from types import SimpleNamespace
from typing import cast

from app.config import Settings
from app.models import IngestionStatus
from app.services.benchmark import setup as benchmark_setup


async def test_setup_should_add_every_file_before_processing_any_file(tmp_path, mocker):
    settings = cast(Settings, SimpleNamespace())
    session = mocker.AsyncMock()
    call_order: list[str] = []
    documents = [
        {"filename": "first.pdf"},
        {"filename": "second.pdf"},
    ]
    mocker.patch(
        "app.services.benchmark.setup.benchmark_documents.download_missing_documents",
        return_value={"documents": documents, "ready": 2, "downloaded": []},
    )
    mocker.patch(
        "app.services.benchmark.setup.benchmark_documents.documents_dir",
        return_value=tmp_path,
    )
    categories = (
        SimpleNamespace(id=1, name="brand", parent_id=None, organization_id=1),
        SimpleNamespace(id=2, name="type", parent_id=1, organization_id=1),
        SimpleNamespace(id=3, name="variant", parent_id=2, organization_id=1),
    )
    mocker.patch(
        "app.services.benchmark.setup._get_or_create_category_path",
        return_value=(categories, []),
    )
    device = SimpleNamespace(id=4, name="benchmark", category_id=3)
    mocker.patch(
        "app.services.benchmark.setup._get_or_create_device",
        return_value=(device, True),
    )
    attachments = [
        SimpleNamespace(
            id=10,
            file_global_path=str(tmp_path / "first.pdf"),
            ingest_status=IngestionStatus.ready,
            ingest_job_id=None,
        ),
        SimpleNamespace(
            id=11,
            file_global_path=str(tmp_path / "second.pdf"),
            ingest_status=IngestionStatus.ready,
            ingest_job_id=None,
        ),
    ]

    async def prepare(_settings, _session, _device, _organization_id, local_path):
        index = 0 if local_path.name == "first.pdf" else 1
        call_order.append(f"prepare:{local_path.name}")
        return attachments[index], 0, True

    async def enqueue_batch(_session, queued_attachments):
        call_order.append(
            "queue-batch:" + ",".join(str(item.id) for item in queued_attachments)
        )
        for attachment in queued_attachments:
            attachment.ingest_status = IngestionStatus.succeeded
            attachment.ingest_job_id = attachment.id + 100
            attachment.ingest_pages_done = 1
            attachment.ingest_pages_total = 1
            attachment.ingest_chunks_indexed = 2
            attachment.ingest_last_event = "done"
            attachment.original_filename = f"{attachment.id}.pdf"
            attachment.ingest_error = None
        return queued_attachments

    mocker.patch("app.services.benchmark.setup._prepare_document", side_effect=prepare)
    mocker.patch(
        "app.services.benchmark.setup.ingestion_queue.enqueue_ingestions",
        side_effect=enqueue_batch,
    )
    mocker.patch(
        "app.services.benchmark.setup.ingestion_queue.is_active",
        return_value=False,
    )
    session.get = mocker.AsyncMock(
        side_effect=lambda _model, attachment_id, **_kwargs: attachments[
            attachment_id - 10
        ]
    )
    mocker.patch(
        "app.services.benchmark.setup.inspect_benchmark_setup",
        return_value={
            "ready": True,
            "result": {"attachments": 2, "chunks": 4},
        },
    )

    await benchmark_setup.run_benchmark_setup(
        settings,
        session,
        lambda _key, _state, _message, _details: None,
    )

    assert call_order == [
        "prepare:first.pdf",
        "prepare:second.pdf",
        "queue-batch:10,11",
    ]
