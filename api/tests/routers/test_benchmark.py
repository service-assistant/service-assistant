from types import SimpleNamespace
import asyncio
from typing import cast

from app.config import Settings
from app.routers.admin import benchmark
from app.services import benchmark_setup
from app.services.benchmark_cases import load_benchmark_dataset
from tests.routers.factories import (
    create_attachment,
    create_category,
    create_chunk,
    create_device,
    link_attachment_device,
)


def _run(setup_id: str = "benchmark-test") -> benchmark.BenchmarkSetupRun:
    return benchmark.BenchmarkSetupRun(
        id=setup_id,
        state="queued",
        steps=[
            benchmark.BenchmarkSetupStep(key=key, label=label)
            for key, label in benchmark.BENCHMARK_SETUP_STEPS
        ],
        created_at="2026-01-01T00:00:00+00:00",
    )


class TestProcessBenchmarkSetup:
    async def test_benchmark_setup_should_report_all_completed_stages(self, mocker):
        run = _run()
        benchmark._benchmark_setup_runs[run.id] = run
        session = mocker.AsyncMock()
        session_context = mocker.MagicMock()
        session_context.__aenter__ = mocker.AsyncMock(return_value=session)
        session_context.__aexit__ = mocker.AsyncMock(return_value=None)
        mocker.patch(
            "app.routers.admin.benchmark.AsyncSession", return_value=session_context
        )

        async def fake_setup(settings, session, progress):
            del settings, session
            for key, _label in benchmark.BENCHMARK_SETUP_STEPS:
                progress(key, "processing", "Running", None)
                progress(key, "completed", "Done", {"ok": True})
            return {"device_id": 7, "attachments": 4, "chunks": 100}

        mocker.patch(
            "app.routers.admin.benchmark.benchmark_setup.run_benchmark_setup",
            side_effect=fake_setup,
        )
        settings = cast(
            Settings, SimpleNamespace(database_url="postgresql+psycopg://unused")
        )

        try:
            await benchmark._process_benchmark_setup(run.id, settings)
        finally:
            benchmark._benchmark_setup_runs.pop(run.id, None)

        assert run.state == "completed"
        assert all(step.state == "completed" for step in run.steps)
        assert run.result == {"device_id": 7, "attachments": 4, "chunks": 100}
        assert run.finished_at is not None

    async def test_benchmark_setup_should_mark_active_stage_as_failed(self, mocker):
        run = _run("failed-benchmark")
        benchmark._benchmark_setup_runs[run.id] = run
        session_context = mocker.MagicMock()
        session_context.__aenter__ = mocker.AsyncMock(return_value=mocker.AsyncMock())
        session_context.__aexit__ = mocker.AsyncMock(return_value=None)
        mocker.patch(
            "app.routers.admin.benchmark.AsyncSession", return_value=session_context
        )

        async def failing_setup(settings, session, progress):
            del settings, session
            progress("ingest", "processing", "Chunking", None)
            raise RuntimeError("embedding failed")

        mocker.patch(
            "app.routers.admin.benchmark.benchmark_setup.run_benchmark_setup",
            side_effect=failing_setup,
        )
        settings = cast(
            Settings, SimpleNamespace(database_url="postgresql+psycopg://unused")
        )

        try:
            await benchmark._process_benchmark_setup(run.id, settings)
        finally:
            benchmark._benchmark_setup_runs.pop(run.id, None)

        assert run.state == "failed"
        assert run.error == "embedding failed"
        ingest = next(step for step in run.steps if step.key == "ingest")
        assert ingest.state == "failed"
        assert ingest.message == "embedding failed"


class TestGetLatestBenchmarkSetup:
    async def test_latest_setup_should_detect_persisted_database_state_by_ids(
        self, session
    ):
        brand_category = await create_category(
            session, name=benchmark_setup.BENCHMARK_BRAND_CATEGORY_NAME
        )
        type_category = await create_category(
            session,
            name=benchmark_setup.BENCHMARK_TYPE_CATEGORY_NAME,
            parent_id=brand_category.id,
        )
        variant_category = await create_category(
            session,
            name=benchmark_setup.BENCHMARK_VARIANT_CATEGORY_NAME,
            parent_id=type_category.id,
        )
        device = await create_device(
            session,
            variant_category.id,
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
        benchmark._benchmark_setup_runs.clear()

        result = await benchmark.get_latest_benchmark_setup(session)

        assert result is not None
        assert result["state"] == "completed"
        assert result["id"] == "persisted-database-state"
        assert result["result"] == {
            "category_id": variant_category.id,
            "brand_category_id": brand_category.id,
            "type_category_id": type_category.id,
            "variant_category_id": variant_category.id,
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


class TestInspectBenchmarkSetup:
    async def test_inspection_should_reject_device_outside_benchmark_hierarchy(
        self, session
    ):
        brand_category = await create_category(
            session, name=benchmark_setup.BENCHMARK_BRAND_CATEGORY_NAME
        )
        type_category = await create_category(
            session,
            name=benchmark_setup.BENCHMARK_TYPE_CATEGORY_NAME,
            parent_id=brand_category.id,
        )
        await create_category(
            session,
            name=benchmark_setup.BENCHMARK_VARIANT_CATEGORY_NAME,
            parent_id=type_category.id,
        )
        wrong_variant = await create_category(
            session, name=benchmark_setup.BENCHMARK_VARIANT_CATEGORY_NAME
        )
        await create_device(
            session,
            wrong_variant.id,
            name=benchmark_setup.BENCHMARK_DEVICE_NAME,
            model_serial_code=benchmark_setup.BENCHMARK_MODEL_SERIAL_CODE,
        )

        inspection = await benchmark_setup.inspect_benchmark_setup(session)

        assert inspection["ready"] is False
        assert "benchmark_device_category" in inspection["missing"]


class TestCategorySetup:
    async def test_category_setup_should_create_and_reuse_complete_hierarchy(
        self, session
    ):
        first_path, first_created = await benchmark_setup._get_or_create_category_path(
            session
        )
        (
            second_path,
            second_created,
        ) = await benchmark_setup._get_or_create_category_path(session)

        brand_category, type_category, variant_category = first_path
        assert [category.name for category in first_path] == [
            benchmark_setup.BENCHMARK_BRAND_CATEGORY_NAME,
            benchmark_setup.BENCHMARK_TYPE_CATEGORY_NAME,
            benchmark_setup.BENCHMARK_VARIANT_CATEGORY_NAME,
        ]
        assert brand_category.parent_id is None
        assert type_category.parent_id == brand_category.id
        assert variant_category.parent_id == type_category.id
        assert len(first_created) == 3
        assert [category.id for category in second_path] == [
            category.id for category in first_path
        ]
        assert second_created == []


class TestCancelBenchmarkRun:
    async def test_cancel_benchmark_run_should_signal_active_processor(self):
        run = benchmark.BenchmarkCaseRun(
            id="cancel-me",
            case_id="fault_2002_without_colon",
            state="processing",
            created_at="2026-01-01T00:00:00+00:00",
        )
        cancellation_event = asyncio.Event()
        benchmark._benchmark_case_runs[run.id] = run
        benchmark._benchmark_case_cancel_events[run.id] = cancellation_event

        try:
            result = await benchmark.cancel_benchmark_case_run(run.id)
        finally:
            benchmark._benchmark_case_runs.pop(run.id, None)
            benchmark._benchmark_case_cancel_events.pop(run.id, None)

        assert result["cancel_requested"] is True
        assert result["state"] == "processing"
        assert cancellation_event.is_set()
