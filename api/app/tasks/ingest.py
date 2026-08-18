import asyncio
import logging
from typing import cast

import procrastinate
from procrastinate.exceptions import JobAborted
from sqlalchemy import update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import database_url_with_driver, get_engine, utcnow
from app.models import Attachment, IngestionStatus
from app.procrastinate_app import app
from app.services.ingest import (
    IngestReport,
    delete_attachment_chunks,
    ingest_pdf_to_attachment,
)

logger = logging.getLogger(__name__)

ABORT_POLL_INTERVAL_SECONDS = 1.0
PROGRESS_FLUSH_INTERVAL_SECONDS = 2.0


def _report_columns(report: IngestReport) -> dict:
    return {
        "ingest_pages_total": report.total_pages,
        "ingest_pages_done": report.pages_processed,
        "ingest_chunks_indexed": report.chunks_indexed,
        "ingest_last_event": report.events[-1] if report.events else None,
        "ingest_native_text_pages": report.native_text_pages,
        "ingest_ocr_pages_attempted": report.ocr_pages_attempted,
        "ingest_ocr_pages_succeeded": report.ocr_pages_succeeded,
        "ingest_ocr_pages_skipped": report.ocr_pages_skipped,
        "ingest_updated_at": utcnow(),
    }


async def _flush_progress(attachment_id: int, latest: list[IngestReport]) -> None:
    """Periodically mirrors pipeline progress onto the attachment row.

    Runs on its own session: the pipeline holds an open transaction on the task's
    session, and committing that from here would publish its partial work.

    Guarded by `ingest_status == running`: cancelling this task doesn't cancel a
    commit already in flight to Postgres, so a flush can otherwise land *after*
    the finalizer has already reset the row (observed in practice — a cancel
    landing mid-flush left stale page counts behind). Once the finalizer flips
    the status in its own commit, this WHERE clause matches zero rows and the
    write becomes a no-op, regardless of network timing.
    """
    while True:
        await asyncio.sleep(PROGRESS_FLUSH_INTERVAL_SECONDS)
        async with AsyncSession(
            get_engine(database_url_with_driver), expire_on_commit=False
        ) as session:
            await session.execute(
                update(Attachment)
                .where(
                    Attachment.id == attachment_id,
                    Attachment.ingest_status == IngestionStatus.running,
                )
                .values(**_report_columns(latest[0]))
            )
            await session.commit()


async def _watch_for_abort(
    context: procrastinate.JobContext, target: asyncio.Task
) -> None:
    while not target.done():
        if context.should_abort():
            target.cancel()
            return
        await asyncio.sleep(ABORT_POLL_INTERVAL_SECONDS)


@app.task(queue="ingest", name="ingest", lock="ingest", pass_context=True)
async def ingest(context: procrastinate.JobContext, attachment_id: int) -> None:
    """Runs the PDF ingestion pipeline for one attachment.

    `lock="ingest"` makes Procrastinate run these jobs strictly one at a time, in
    the order they were deferred — so processing several ready files happens in
    the order the user queued them.
    """
    settings = get_settings()

    async with AsyncSession(
        get_engine(database_url_with_driver), expire_on_commit=False
    ) as session:
        attachment = await session.get(Attachment, attachment_id)
        if attachment is None:
            logger.warning("Attachment %s no longer exists; skipping", attachment_id)
            return
        if attachment.ingest_status != IngestionStatus.queued:
            # Already handled: cancelled back to `ready` before the worker got to
            # it, or redelivered by Procrastinate after already finishing.
            logger.info(
                "Attachment %s is %s, not queued; skipping",
                attachment_id,
                attachment.ingest_status.value,
            )
            return

        attachment.ingest_status = IngestionStatus.running
        attachment.ingest_started_at = utcnow()
        attachment.ingest_error = None
        await session.commit()

        # Re-running must not stack chunks on top of a previous attempt.
        await delete_attachment_chunks(session, attachment.id)

        # The callback fires per page *and* per embedding batch, far too often to
        # write to the database, so it only parks the latest snapshot here.
        latest = [IngestReport()]

        def progress_callback(report: IngestReport) -> None:
            latest[0] = report

        pipeline = asyncio.create_task(
            ingest_pdf_to_attachment(
                session=session,
                pdf_path=attachment.file_global_path,
                attachment_id=attachment.id,
                settings=settings,
                progress_callback=progress_callback,
            )
        )
        aborter = asyncio.create_task(_watch_for_abort(context, pipeline))
        flusher = asyncio.create_task(_flush_progress(attachment_id, latest))

        aborted = False
        error: str | None = None
        try:
            report = await pipeline
        except asyncio.CancelledError:
            aborted = True
            logger.info("Ingestion for attachment %s aborted on request", attachment_id)
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            logger.exception("Ingestion for attachment %s failed", attachment_id)
        else:
            latest[0] = report
        finally:
            for task in (aborter, flusher):
                task.cancel()
            await asyncio.gather(aborter, flusher, return_exceptions=True)

        # Written as a plain UPDATE rather than mutating the `attachment` ORM
        # object: that object's attributes never changed during the run (only
        # the flusher's separate session touched the row), so setting a field
        # back to a value it already holds *locally* is a no-op as far as
        # SQLAlchemy's change-tracking is concerned — it silently drops that
        # column from the generated UPDATE, leaving whatever the flusher last
        # wrote in place. A Core UPDATE has no such memory; it always writes
        # every listed column.
        if aborted:
            # Chunks are only inserted at the very end of the pipeline, so an
            # aborted run leaves nothing behind to clean up. Cancelling returns
            # the attachment to `ready`, not a dead-end "cancelled" state — and
            # should look like a fresh upload, with progress and timestamps
            # cleared rather than frozen mid-run.
            final_values = {
                **_report_columns(IngestReport()),
                "ingest_status": IngestionStatus.ready,
                "ingest_queued_at": None,
                "ingest_started_at": None,
                "ingest_finished_at": None,
                "ingest_error": None,
            }
        elif error is not None:
            final_values = {
                "ingest_status": IngestionStatus.failed,
                "ingest_error": error,
                "ingest_finished_at": utcnow(),
            }
        else:
            final_values = {
                **_report_columns(latest[0]),
                "ingest_status": IngestionStatus.succeeded,
                "ingest_pages_done": latest[0].total_pages,
                "ingest_error": None,
                "ingest_finished_at": utcnow(),
            }

        result = cast(
            CursorResult,
            await session.execute(
                update(Attachment)
                .where(Attachment.id == attachment_id)
                .values(**final_values)
            ),
        )
        await session.commit()

        if result.rowcount == 0:
            # The attachment was deleted while this job was running — an
            # ordinary ending, not a failure. Nothing left to record.
            logger.info(
                "Attachment %s was deleted while running; nothing to record",
                attachment_id,
            )
            return

        if aborted:
            # Tell Procrastinate the abort was honoured, so the job lands in
            # `aborted` rather than being retried or marked failed.
            raise JobAborted()
