import asyncio
from types import SimpleNamespace

from app.config import get_settings
from app.routers import admin
from app.services.ingest import ImageOnlyPdfError, IngestReport


async def test_server_batch_should_continue_after_one_file_fails(tmp_path, mocker):
    settings = get_settings().model_copy(update={"attachments_dir": tmp_path})
    batch_id = "test-batch"
    staging_dir = tmp_path / ".upload_batches" / batch_id
    staging_dir.mkdir(parents=True)
    staged_files = [staging_dir / "0000.upload", staging_dir / "0001.upload"]
    for staged_file in staged_files:
        staged_file.write_bytes(b"%PDF-1.4")

    batch = admin.UploadBatch(
        id=batch_id,
        items=[
            admin.UploadBatchItem(filename="first.pdf"),
            admin.UploadBatchItem(filename="second.pdf"),
        ],
        created_at="2026-01-01T00:00:00+00:00",
    )
    admin._upload_batches[batch_id] = batch

    session = mocker.AsyncMock()
    session_context = mocker.MagicMock()
    session_context.__aenter__ = mocker.AsyncMock(return_value=session)
    session_context.__aexit__ = mocker.AsyncMock(return_value=None)
    mocker.patch("app.routers.admin.AsyncSession", return_value=session_context)
    save = mocker.patch(
        "app.routers.admin.save_and_ingest_attachment",
        side_effect=[
            RuntimeError("first file failed"),
            SimpleNamespace(id=42),
        ],
    )

    try:
        await admin._process_upload_batch(
            batch_id=batch_id,
            staged_files=staged_files,
            device_ids=[7],
            settings=settings,
        )
    finally:
        admin._upload_batches.pop(batch_id, None)

    assert save.await_count == 2
    assert batch.items[0].state == "failed"
    assert "RuntimeError: first file failed" in str(batch.items[0].error)
    assert batch.items[1].state == "succeeded"
    assert batch.items[1].attachment_id == 42
    assert batch.finished_at is not None
    assert not staging_dir.exists()


def test_upload_batch_serialization_should_report_progress():
    batch = admin.UploadBatch(
        id="batch-id",
        items=[
            admin.UploadBatchItem(filename="done.pdf", state="succeeded"),
            admin.UploadBatchItem(filename="active.pdf", state="processing"),
            admin.UploadBatchItem(
                filename="failed.pdf",
                state="failed",
                error="full traceback",
            ),
        ],
        created_at="2026-01-01T00:00:00+00:00",
    )

    result = admin._serialize_upload_batch(batch)

    assert result["state"] == "processing"
    assert result["total"] == 3
    assert result["completed"] == 2
    assert result["succeeded"] == 1
    assert result["skipped"] == 0
    assert result["failed"] == 1
    assert result["items"][2]["error"] == "full traceback"


async def test_server_batch_reports_and_continues_after_image_only_pdf(
    tmp_path, mocker
):
    settings = get_settings().model_copy(update={"attachments_dir": tmp_path})
    batch_id = "image-only-batch"
    staging_dir = tmp_path / ".upload_batches" / batch_id
    staging_dir.mkdir(parents=True)
    staged_files = [staging_dir / "0000.upload", staging_dir / "0001.upload"]
    for staged_file in staged_files:
        staged_file.write_bytes(b"%PDF-1.4")

    batch = admin.UploadBatch(
        id=batch_id,
        items=[
            admin.UploadBatchItem(filename="scans.pdf"),
            admin.UploadBatchItem(filename="manual.pdf"),
        ],
        created_at="2026-01-01T00:00:00+00:00",
    )
    admin._upload_batches[batch_id] = batch
    session = mocker.AsyncMock()
    session_context = mocker.MagicMock()
    session_context.__aenter__ = mocker.AsyncMock(return_value=session)
    session_context.__aexit__ = mocker.AsyncMock(return_value=None)
    mocker.patch("app.routers.admin.AsyncSession", return_value=session_context)
    report = IngestReport(total_pages=3)
    report.events.append(
        "Skipped entire file: every page is image-only and OCR recovered no text."
    )
    save = mocker.patch(
        "app.routers.admin.save_and_ingest_attachment",
        side_effect=[
            ImageOnlyPdfError(report),
            SimpleNamespace(id=99),
        ],
    )

    try:
        await admin._process_upload_batch(batch_id, staged_files, [], settings=settings)
    finally:
        admin._upload_batches.pop(batch_id, None)

    assert save.await_count == 2
    assert batch.items[0].state == "skipped"
    assert batch.items[0].total_pages == 3
    assert (
        "Image-only file was deleted because OCR recovered no text."
        in batch.items[0].events
    )
    assert batch.items[1].state == "succeeded"


async def test_only_one_admin_upload_batch_worker_runs_at_a_time(mocker):
    settings = get_settings()
    active = 0
    maximum_active = 0

    async def fake_batch_worker(*_args, **_kwargs):
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        await asyncio.sleep(0.01)
        active -= 1

    mocker.patch(
        "app.routers.admin._run_upload_batch",
        side_effect=fake_batch_worker,
    )

    await asyncio.gather(
        admin._process_upload_batch("first", [], [], settings),
        admin._process_upload_batch("second", [], [], settings),
    )

    assert maximum_active == 1
