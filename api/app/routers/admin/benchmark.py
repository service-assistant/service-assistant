import asyncio
import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from uuid import uuid4

from app.config import Settings
from app.database import database_url_with_driver, get_engine
from app.dependencies.database import DbSessionDependency
from app.dependencies.settings import SettingsDependency
from app.services import (
    benchmark_cases,
    benchmark_documents,
    benchmark_runner,
    benchmark_setup,
)
from app.services.async_utils import run_blocking
from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

# Internal engineering tool (runs against a fixed benchmark dataset seeded
# under the "default" org, not real tenant data) — app_admin/debug-only
# (gate applied in main.py's include_router call, not here).
router = APIRouter()
logger = logging.getLogger(__name__)


@dataclass
class BenchmarkSetupStep:
    key: str
    label: str
    state: str = "queued"
    message: str = "Waiting"
    details: dict | None = None


@dataclass
class BenchmarkSetupRun:
    id: str
    state: str
    steps: list[BenchmarkSetupStep]
    created_at: str
    finished_at: str | None = None
    error: str | None = None
    result: dict | None = None


@dataclass
class BenchmarkCaseRun:
    id: str
    case_id: str
    state: str
    created_at: str
    finished_at: str | None = None
    error: str | None = None
    result: dict | None = None
    cancel_requested: bool = False


_benchmark_download_lock = asyncio.Lock()
_benchmark_setup_lock = asyncio.Lock()
_benchmark_setup_runs: dict[str, BenchmarkSetupRun] = {}
_benchmark_case_runs: dict[str, BenchmarkCaseRun] = {}
_benchmark_case_cancel_events: dict[str, asyncio.Event] = {}

BENCHMARK_SETUP_STEPS = [
    ("download", "Download documents from R2"),
    ("category", "Create benchmark category hierarchy"),
    ("device", "Create benchmark machine"),
    ("attachments", "Add and link all benchmark files"),
    ("ingest", "Queue and process all benchmark files"),
    ("verify", "Verify benchmark setup"),
]


@router.get("/cases")
async def get_benchmark_cases():
    return {
        "version": benchmark_cases.load_benchmark_dataset().version,
        "cases": benchmark_cases.serialize_benchmark_cases(),
    }


def _get_benchmark_case(case_id: str):
    return next(
        (
            case
            for case in benchmark_cases.load_benchmark_dataset().cases
            if case.id == case_id
        ),
        None,
    )


def _serialize_benchmark_case_run(run: BenchmarkCaseRun) -> dict:
    return asdict(run)


async def _process_benchmark_case_run(run_id: str, settings: Settings) -> None:
    run = _benchmark_case_runs[run_id]
    cancellation_event = _benchmark_case_cancel_events.setdefault(
        run_id, asyncio.Event()
    )
    run.state = "processing"
    case = _get_benchmark_case(run.case_id)
    try:
        if case is None:
            raise RuntimeError(f"Benchmark case not found: {run.case_id}")
        async with AsyncSession(
            get_engine(database_url_with_driver),
            expire_on_commit=False,
        ) as session:
            run.result = await benchmark_runner.run_benchmark_case(
                case=case,
                settings=settings,
                session=session,
                cancellation_event=cancellation_event,
            )
        run.state = "completed"
    except benchmark_runner.BenchmarkCancelledError:
        run.state = "cancelled"
        run.error = None
    except Exception as exc:
        run.state = "failed"
        run.error = str(exc)
        logger.exception("Benchmark case run %s failed", run_id)
    finally:
        run.finished_at = datetime.now(timezone.utc).isoformat()
        _benchmark_case_cancel_events.pop(run_id, None)


@router.post("/cases/{case_id}/runs", status_code=status.HTTP_202_ACCEPTED)
async def start_benchmark_case_run(
    case_id: str,
    background_tasks: BackgroundTasks,
    settings: SettingsDependency,
):
    if _get_benchmark_case(case_id) is None:
        raise HTTPException(status_code=404, detail="Benchmark case not found")
    active_run = next(
        (
            run
            for run in reversed(list(_benchmark_case_runs.values()))
            if run.case_id == case_id and run.state in {"queued", "processing"}
        ),
        None,
    )
    if active_run is not None:
        return _serialize_benchmark_case_run(active_run)

    run_id = str(uuid4())
    run = BenchmarkCaseRun(
        id=run_id,
        case_id=case_id,
        state="queued",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    _benchmark_case_runs[run_id] = run
    _benchmark_case_cancel_events[run_id] = asyncio.Event()
    background_tasks.add_task(_process_benchmark_case_run, run_id, settings)
    return _serialize_benchmark_case_run(run)


@router.get("/runs/{run_id}")
async def get_benchmark_case_run(run_id: str):
    run = _benchmark_case_runs.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Benchmark run not found")
    return _serialize_benchmark_case_run(run)


@router.post("/runs/{run_id}/cancel")
async def cancel_benchmark_case_run(run_id: str):
    run = _benchmark_case_runs.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Benchmark run not found")
    if run.state in {"completed", "failed", "cancelled"}:
        return _serialize_benchmark_case_run(run)
    run.cancel_requested = True
    cancellation_event = _benchmark_case_cancel_events.get(run_id)
    if cancellation_event is not None:
        cancellation_event.set()
    return _serialize_benchmark_case_run(run)


@router.get("/documents/status")
async def get_benchmark_documents_status(settings: SettingsDependency):
    try:
        return await run_blocking(benchmark_documents.get_document_status, settings)
    except benchmark_documents.BenchmarkStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc


@router.post("/documents/download")
async def download_benchmark_documents(settings: SettingsDependency):
    try:
        async with _benchmark_download_lock:
            return await run_blocking(
                benchmark_documents.download_missing_documents,
                settings,
            )
    except benchmark_documents.BenchmarkStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc


def _serialize_benchmark_setup(run: BenchmarkSetupRun) -> dict:
    return {
        "id": run.id,
        "state": run.state,
        "created_at": run.created_at,
        "finished_at": run.finished_at,
        "error": run.error,
        "result": run.result,
        "steps": [asdict(step) for step in run.steps],
    }


async def _process_benchmark_setup(setup_id: str, settings: Settings) -> None:
    run = _benchmark_setup_runs[setup_id]
    run.state = "processing"

    def update_step(
        key: str,
        state: str,
        message: str,
        details: dict | None,
    ) -> None:
        step = next(item for item in run.steps if item.key == key)
        step.state = state
        step.message = message
        step.details = details

    try:
        async with _benchmark_setup_lock:
            async with AsyncSession(
                get_engine(database_url_with_driver),
                expire_on_commit=False,
            ) as session:
                run.result = await benchmark_setup.run_benchmark_setup(
                    settings=settings,
                    session=session,
                    progress=update_step,
                )
        run.state = "completed"
    except Exception as exc:
        run.state = "failed"
        run.error = str(exc)
        active_step = next(
            (step for step in run.steps if step.state == "processing"), None
        )
        if active_step is not None:
            active_step.state = "failed"
            active_step.message = str(exc)
        logger.exception("Benchmark setup %s failed", setup_id)
    finally:
        run.finished_at = datetime.now(timezone.utc).isoformat()


@router.post("/setup", status_code=status.HTTP_202_ACCEPTED)
async def start_benchmark_setup(
    background_tasks: BackgroundTasks,
    settings: SettingsDependency,
):
    active_run = next(
        (
            run
            for run in reversed(list(_benchmark_setup_runs.values()))
            if run.state in {"queued", "processing"}
        ),
        None,
    )
    if active_run is not None:
        return _serialize_benchmark_setup(active_run)

    setup_id = str(uuid4())
    run = BenchmarkSetupRun(
        id=setup_id,
        state="queued",
        steps=[
            BenchmarkSetupStep(key=key, label=label)
            for key, label in BENCHMARK_SETUP_STEPS
        ],
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    _benchmark_setup_runs[setup_id] = run
    background_tasks.add_task(_process_benchmark_setup, setup_id, settings)
    return _serialize_benchmark_setup(run)


@router.get("/setup")
async def get_latest_benchmark_setup(session: DbSessionDependency):
    active_run = next(
        (
            run
            for run in reversed(list(_benchmark_setup_runs.values()))
            if run.state in {"queued", "processing"}
        ),
        None,
    )
    if active_run is not None:
        return _serialize_benchmark_setup(active_run)

    inspection = await benchmark_setup.inspect_benchmark_setup(session)
    if inspection["ready"]:
        result = inspection["result"]
        completed_steps = [
            BenchmarkSetupStep(
                key="download",
                label="Download documents from R2",
                state="completed",
                message=f"{result['attachments']} document(s) present in the database.",
            ),
            BenchmarkSetupStep(
                key="category",
                label="Create benchmark category hierarchy",
                state="completed",
                message=(
                    "Category hierarchy verified by IDs "
                    f"{result['brand_category_id']} → "
                    f"{result['type_category_id']} → "
                    f"{result['variant_category_id']}."
                ),
                details={
                    "brand_category_id": result["brand_category_id"],
                    "type_category_id": result["type_category_id"],
                    "variant_category_id": result["variant_category_id"],
                },
            ),
            BenchmarkSetupStep(
                key="device",
                label="Create benchmark machine",
                state="completed",
                message=f"Machine verified by ID {result['device_id']}.",
                details={"id": result["device_id"]},
            ),
            BenchmarkSetupStep(
                key="attachments",
                label="Add and link all benchmark files",
                state="completed",
                message=f"{result['attachments']} document(s) stored and linked.",
                details={"documents": inspection["documents"]},
            ),
            BenchmarkSetupStep(
                key="ingest",
                label="Queue and process all benchmark files",
                state="completed",
                message=(
                    f"{result['attachments']} attachment(s) and "
                    f"{result['chunks']} chunk(s) verified by ID relationships."
                ),
                details={"documents": inspection["documents"]},
            ),
            BenchmarkSetupStep(
                key="verify",
                label="Verify benchmark setup",
                state="completed",
                message="Persisted benchmark setup is complete.",
                details=result,
            ),
        ]
        persisted_run = BenchmarkSetupRun(
            id="persisted-database-state",
            state="completed",
            steps=completed_steps,
            created_at=datetime.now(timezone.utc).isoformat(),
            finished_at=datetime.now(timezone.utc).isoformat(),
            result=result,
        )
        return _serialize_benchmark_setup(persisted_run)

    if _benchmark_setup_runs:
        latest_id = next(reversed(_benchmark_setup_runs))
        latest = _benchmark_setup_runs[latest_id]
        if latest.state == "failed":
            return _serialize_benchmark_setup(latest)
    return None


@router.get("/setup/{setup_id}")
async def get_benchmark_setup(setup_id: str):
    run = _benchmark_setup_runs.get(setup_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Benchmark setup not found")
    return _serialize_benchmark_setup(run)
