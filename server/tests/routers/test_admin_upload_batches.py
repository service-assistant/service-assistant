from types import SimpleNamespace

from app.config import get_settings
from app.routers import admin


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
    assert result["failed"] == 1
    assert result["items"][2]["error"] == "full traceback"
