from types import SimpleNamespace
import asyncio
from typing import cast

from app.config import Settings
from app.routers import admin
from app.services import benchmark_setup
from app.services.benchmark_cases import load_benchmark_dataset
from tests.routers.factories import (
    create_attachment,
    create_category,
    create_chunk,
    create_device,
    link_attachment_device,
)


def _run(setup_id: str = "benchmark-test") -> admin.BenchmarkSetupRun:
    return admin.BenchmarkSetupRun(
        id=setup_id,
        state="queued",
        steps=[
            admin.BenchmarkSetupStep(key=key, label=label)
            for key, label in admin.BENCHMARK_SETUP_STEPS
        ],
        created_at="2026-01-01T00:00:00+00:00",
    )


async def test_benchmark_setup_should_report_all_completed_stages(mocker):
    run = _run()
    admin._benchmark_setup_runs[run.id] = run
    session = mocker.AsyncMock()
    session_context = mocker.MagicMock()
    session_context.__aenter__ = mocker.AsyncMock(return_value=session)
    session_context.__aexit__ = mocker.AsyncMock(return_value=None)
    mocker.patch("app.routers.admin.AsyncSession", return_value=session_context)

    async def fake_setup(settings, session, progress):
        del settings, session
        for key, _label in admin.BENCHMARK_SETUP_STEPS:
            progress(key, "processing", "Running", None)
            progress(key, "completed", "Done", {"ok": True})
        return {"device_id": 7, "attachments": 4, "chunks": 100}

    mocker.patch(
        "app.routers.admin.benchmark_setup.run_benchmark_setup",
        side_effect=fake_setup,
    )
    settings = cast(
        Settings, SimpleNamespace(database_url="postgresql+psycopg://unused")
    )

    try:
        await admin._process_benchmark_setup(run.id, settings)
    finally:
        admin._benchmark_setup_runs.pop(run.id, None)

    assert run.state == "completed"
    assert all(step.state == "completed" for step in run.steps)
    assert run.result == {"device_id": 7, "attachments": 4, "chunks": 100}
    assert run.finished_at is not None


async def test_benchmark_setup_should_mark_active_stage_as_failed(mocker):
    run = _run("failed-benchmark")
    admin._benchmark_setup_runs[run.id] = run
    session_context = mocker.MagicMock()
    session_context.__aenter__ = mocker.AsyncMock(return_value=mocker.AsyncMock())
    session_context.__aexit__ = mocker.AsyncMock(return_value=None)
    mocker.patch("app.routers.admin.AsyncSession", return_value=session_context)

    async def failing_setup(settings, session, progress):
        del settings, session
        progress("ingest", "processing", "Chunking", None)
        raise RuntimeError("embedding failed")

    mocker.patch(
        "app.routers.admin.benchmark_setup.run_benchmark_setup",
        side_effect=failing_setup,
    )
    settings = cast(
        Settings, SimpleNamespace(database_url="postgresql+psycopg://unused")
    )

    try:
        await admin._process_benchmark_setup(run.id, settings)
    finally:
        admin._benchmark_setup_runs.pop(run.id, None)

    assert run.state == "failed"
    assert run.error == "embedding failed"
    ingest = next(step for step in run.steps if step.key == "ingest")
    assert ingest.state == "failed"
    assert ingest.message == "embedding failed"


async def test_latest_setup_should_detect_persisted_database_state_by_ids(session):
    category = await create_category(
        session, name=benchmark_setup.BENCHMARK_CATEGORY_NAME
    )
    device = await create_device(
        session,
        category.id,
        name=benchmark_setup.BENCHMARK_DEVICE_NAME,
        model_serial_code=benchmark_setup.BENCHMARK_MODEL_SERIAL_CODE,
    )
    documents = []
    for source_name in sorted(
        {case.source.filename for case in load_benchmark_dataset().cases}
    ):
        attachment = await create_attachment(
            session,
            original_filename=source_name,
        )
        chunk = await create_chunk(session, attachment.id)
        await link_attachment_device(session, attachment.id, device.id)
        documents.append((attachment, chunk))
    admin._benchmark_setup_runs.clear()

    result = await admin.get_latest_benchmark_setup(session)

    assert result is not None
    assert result["state"] == "completed"
    assert result["id"] == "persisted-database-state"
    assert result["result"] == {
        "category_id": category.id,
        "device_id": device.id,
        "stable_device_key": benchmark_setup.BENCHMARK_MODEL_SERIAL_CODE,
        "attachments": len(documents),
        "chunks": len(documents),
    }
    ingest = next(step for step in result["steps"] if step["key"] == "ingest")
    assert ingest["details"]["documents"] == [
        {
            "filename": attachment.original_filename,
            "attachment_id": attachment.id,
            "chunks": 1,
        }
        for attachment, _chunk in documents
    ]
    assert all(chunk.id is not None for _attachment, chunk in documents)


async def test_cancel_benchmark_run_should_signal_active_processor():
    run = admin.BenchmarkCaseRun(
        id="cancel-me",
        case_id="fault_2002_without_colon",
        state="processing",
        created_at="2026-01-01T00:00:00+00:00",
    )
    cancellation_event = asyncio.Event()
    admin._benchmark_case_runs[run.id] = run
    admin._benchmark_case_cancel_events[run.id] = cancellation_event

    try:
        result = await admin.cancel_benchmark_case_run(run.id)
    finally:
        admin._benchmark_case_runs.pop(run.id, None)
        admin._benchmark_case_cancel_events.pop(run.id, None)

    assert result["cancel_requested"] is True
    assert result["state"] == "processing"
    assert cancellation_event.is_set()
