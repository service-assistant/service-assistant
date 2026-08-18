"""Tests for the background ingestion task itself (`app/tasks/ingest.py`)."""

import asyncio

import pytest
from procrastinate.exceptions import JobAborted

from app.models import Attachment, IngestionStatus
from app.services.ingest import IngestReport
from app.tasks.ingest import ingest

from tests.routers.factories import create_attachment


def make_context(mocker, should_abort=False):
    """A stand-in JobContext; only `should_abort` is used by the task."""
    return mocker.MagicMock(should_abort=mocker.MagicMock(return_value=should_abort))


async def _queued_attachment(session, tmp_path, filename="manual.pdf"):
    pdf_path = tmp_path / filename
    pdf_path.write_bytes(b"%PDF-1.4 content")
    attachment = await create_attachment(
        session,
        original_filename=filename,
        file_global_path=str(pdf_path),
        ingest_status=IngestionStatus.queued,
    )
    return attachment, pdf_path


async def test_should_mark_succeeded_when_pipeline_completes(
    session, tmp_path, mocker, mock_ingest_pipeline
):
    attachment, _ = await _queued_attachment(session, tmp_path)

    await ingest.func(make_context(mocker), attachment_id=attachment.id)

    await session.refresh(attachment)
    assert attachment.ingest_status == IngestionStatus.succeeded
    assert attachment.ingest_pages_total == 3
    assert attachment.ingest_pages_done == 3
    assert attachment.ingest_chunks_indexed == 7
    assert attachment.ingest_started_at is not None
    assert attachment.ingest_finished_at is not None
    assert attachment.ingest_error is None


async def test_should_record_the_page_and_ocr_breakdown(
    session, tmp_path, mocker, mock_ingest_pipeline
):
    """Kept for diagnosing bad scans, even though no UI renders it."""
    attachment, _ = await _queued_attachment(session, tmp_path)

    await ingest.func(make_context(mocker), attachment_id=attachment.id)

    await session.refresh(attachment)
    assert attachment.ingest_native_text_pages == 1
    assert attachment.ingest_ocr_pages_attempted == 2
    assert attachment.ingest_ocr_pages_succeeded == 1
    assert attachment.ingest_ocr_pages_skipped == 1


async def test_should_keep_attachment_and_file_when_ingestion_fails(
    session, tmp_path, mocker
):
    """Failures no longer delete the upload, so the user can retry it."""
    attachment, pdf_path = await _queued_attachment(session, tmp_path)
    mocker.patch(
        "app.tasks.ingest.ingest_pdf_to_attachment",
        new_callable=mocker.AsyncMock,
        side_effect=RuntimeError("embedding service exploded"),
    )

    await ingest.func(make_context(mocker), attachment_id=attachment.id)

    await session.refresh(attachment)
    assert attachment.ingest_status == IngestionStatus.failed
    assert attachment.ingest_error == "RuntimeError: embedding service exploded"
    assert attachment.ingest_finished_at is not None
    assert pdf_path.exists()
    assert await session.get(Attachment, attachment.id) is not None


async def test_should_reset_to_ready_when_abort_is_requested(session, tmp_path, mocker):
    attachment, _ = await _queued_attachment(session, tmp_path)

    async def never_finishes(**_kwargs):
        await asyncio.sleep(60)
        return IngestReport()

    mocker.patch("app.tasks.ingest.ingest_pdf_to_attachment", new=never_finishes)
    mocker.patch("app.tasks.ingest.ABORT_POLL_INTERVAL_SECONDS", 0.01)

    with pytest.raises(JobAborted):
        await ingest.func(
            make_context(mocker, should_abort=True), attachment_id=attachment.id
        )

    await session.refresh(attachment)
    assert attachment.ingest_status == IngestionStatus.ready
    # Cancelling should leave the row looking like a fresh upload, not a
    # completed-but-reset job with stale numbers.
    assert attachment.ingest_pages_done == 0
    assert attachment.ingest_pages_total == 0
    assert attachment.ingest_queued_at is None
    assert attachment.ingest_started_at is None
    assert attachment.ingest_finished_at is None


async def test_should_not_let_a_late_flush_overwrite_the_abort_reset(
    session, tmp_path, mocker
):
    """A commit already in flight when a task is cancelled can still land at the
    DB after the finalizer's write — cancelling the asyncio task doesn't cancel
    bytes already on the wire. Simulate that by running a "late" flush after the
    task has already reset the row, and confirm the guarded WHERE clause makes
    it a no-op instead of resurrecting stale progress."""
    from sqlalchemy import update

    from app.models import Attachment
    from app.tasks.ingest import _report_columns

    attachment, _ = await _queued_attachment(session, tmp_path)

    async def never_finishes(**_kwargs):
        await asyncio.sleep(60)
        return IngestReport()

    mocker.patch("app.tasks.ingest.ingest_pdf_to_attachment", new=never_finishes)
    mocker.patch("app.tasks.ingest.ABORT_POLL_INTERVAL_SECONDS", 0.01)

    with pytest.raises(JobAborted):
        await ingest.func(
            make_context(mocker, should_abort=True), attachment_id=attachment.id
        )

    await session.refresh(attachment)
    assert attachment.ingest_status == IngestionStatus.ready

    # A flush from before the abort, arriving late.
    stale_report = IngestReport(total_pages=300, pages_processed=55)
    await session.execute(
        update(Attachment)
        .where(Attachment.id == attachment.id, Attachment.ingest_status == "running")
        .values(**_report_columns(stale_report))
    )
    await session.commit()

    await session.refresh(attachment)
    assert attachment.ingest_status == IngestionStatus.ready
    assert attachment.ingest_pages_total == 0
    assert attachment.ingest_pages_done == 0


async def test_should_finish_quietly_when_attachment_is_deleted_mid_run(
    session, tmp_path, mocker
):
    attachment, _ = await _queued_attachment(session, tmp_path)

    async def delete_attachment_while_running(**_kwargs):
        await session.delete(attachment)
        await session.commit()
        return IngestReport()

    mocker.patch(
        "app.tasks.ingest.ingest_pdf_to_attachment",
        new=delete_attachment_while_running,
    )

    # No StaleDataError — there is simply nothing left to record.
    await ingest.func(make_context(mocker), attachment_id=attachment.id)

    session.expunge_all()
    assert await session.get(Attachment, attachment.id) is None


async def test_should_skip_when_no_longer_queued(
    session, tmp_path, mocker, mock_ingest_pipeline
):
    """Covers redelivery by Procrastinate and a cancel that beat the worker to it."""
    attachment, _ = await _queued_attachment(session, tmp_path)
    attachment.ingest_status = IngestionStatus.ready
    await session.commit()

    await ingest.func(make_context(mocker), attachment_id=attachment.id)

    mock_ingest_pipeline.assert_not_awaited()
    await session.refresh(attachment)
    assert attachment.ingest_status == IngestionStatus.ready


async def test_should_do_nothing_when_attachment_is_missing(
    session, mocker, mock_ingest_pipeline
):
    await ingest.func(make_context(mocker), attachment_id=999999)

    mock_ingest_pipeline.assert_not_awaited()
