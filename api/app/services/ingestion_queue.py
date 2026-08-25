"""Queueing side of PDF ingestion.

Ingestion itself runs in a Procrastinate worker (see `app/tasks/ingest.py`); this
module owns the `attachments.ingest_*` field transitions and the defer/cancel
calls, so routers stay thin and the task has one place to look for state.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from ..database import utcnow
from ..models import Attachment, IngestionStatus
from ..procrastinate_app import app as procrastinate_app
from ..services.ingest import IngestReport
from ..tasks.ingest import _report_columns, ingest

logger = logging.getLogger(__name__)


def is_active(attachment: Attachment) -> bool:
    return attachment.ingest_status in (IngestionStatus.queued, IngestionStatus.running)


async def enqueue_ingestion(
    session: AsyncSession, attachment: Attachment
) -> Attachment:
    """Queues (or re-queues) an attachment for ingestion.

    Valid from `ready`, `succeeded`, or `failed` — callers are responsible for
    rejecting the call while already `queued`/`running`. Resets progress fields
    so a re-run doesn't show stale numbers from a previous attempt.
    """
    return (await enqueue_ingestions(session, [attachment]))[0]


async def enqueue_ingestions(
    session: AsyncSession, attachments: list[Attachment]
) -> list[Attachment]:
    """Queue a complete attachment batch before a worker can pick up its first job."""
    if not attachments:
        return []

    queued_at = utcnow()
    empty_report = _report_columns(IngestReport())
    for attachment in attachments:
        attachment.ingest_status = IngestionStatus.queued
        attachment.ingest_queued_at = queued_at
        attachment.ingest_started_at = None
        attachment.ingest_finished_at = None
        attachment.ingest_error = None
        for column, value in empty_report.items():
            setattr(attachment, column, value)
    await session.commit()

    job_ids = await ingest.configure().batch_defer_async(
        *({"attachment_id": attachment.id} for attachment in attachments)
    )
    for attachment, job_id in zip(attachments, job_ids, strict=True):
        attachment.ingest_job_id = job_id
    await session.commit()
    for attachment in attachments:
        await session.refresh(attachment)

    return attachments


async def cancel_ingestion(session: AsyncSession, attachment: Attachment) -> Attachment:
    """Cancels a queued attachment, or asks a running one to abort.

    A queued job is reset to `ready` here and never starts. A running job is
    only *asked* to stop — the worker notices `should_abort()` at the next page
    boundary and resets the row itself.
    """
    if attachment.ingest_job_id is not None:
        try:
            await procrastinate_app.job_manager.cancel_job_by_id_async(
                attachment.ingest_job_id,
                abort=True,
                delete_job=False,
            )
        except Exception:
            # The job may already be gone (finished, pruned). The row is still
            # ours to close out, so don't fail the request over it.
            logger.exception(
                "Could not cancel procrastinate job %s for attachment %s",
                attachment.ingest_job_id,
                attachment.id,
            )

    if attachment.ingest_status == IngestionStatus.queued:
        attachment.ingest_status = IngestionStatus.ready
        attachment.ingest_queued_at = None
        await session.commit()
        await session.refresh(attachment)

    return attachment
