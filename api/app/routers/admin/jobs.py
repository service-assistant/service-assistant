from app.dependencies.database import DbSessionDependency
from app.schemas import JobListRead, JobRead
from fastapi import APIRouter
from sqlalchemy import text

# Procrastinate's job queue is shared, unscoped system infrastructure (one
# ingestion job runs globally at a time across every organization) — not
# tenant data, so this stays app_admin/debug-only rather than org-scoped
# (gate applied in main.py's include_router call, not here).
router = APIRouter()

_PAGE_SIZE = 25

# Not the enum's declaration order: surfaces what needs attention first
# (running, then queued, then failed), and buries the routine terminal
# states (aborted/cancelled/succeeded) at the bottom.
_JOB_STATUS_ORDER = ["doing", "todo", "failed", "aborted", "cancelled", "succeeded"]
_JOB_STATUS_ORDER_SQL = " ".join(
    f"WHEN '{jstatus}' THEN {rank}" for rank, jstatus in enumerate(_JOB_STATUS_ORDER)
)


@router.get(
    "",
    response_model=JobListRead,
    summary="List background jobs",
    description="Returns a paginated list of Procrastinate jobs, most attention-worthy first.",
)
async def list_jobs(session: DbSessionDependency, page: int = 1):
    page = max(page, 1)

    total = (
        await session.execute(text("SELECT count(*) FROM procrastinate_jobs"))
    ).scalar_one()
    total_pages = max((total + _PAGE_SIZE - 1) // _PAGE_SIZE, 1)
    page = min(page, total_pages)

    # TODO: create SQLAlchemy model mirroring procrastinate_jobs table and JobsRepository class
    rows = (
        (
            await session.execute(
                text(
                    f"""
                SELECT id, queue_name, task_name, lock, args, status,
                       scheduled_at, attempts, abort_requested
                FROM procrastinate_jobs
                ORDER BY CASE status {_JOB_STATUS_ORDER_SQL} ELSE 99 END, id DESC
                LIMIT :limit OFFSET :offset
                """
                ),
                {"limit": _PAGE_SIZE, "offset": (page - 1) * _PAGE_SIZE},
            )
        )
        .mappings()
        .all()
    )

    return JobListRead(
        items=[JobRead(**row) for row in rows],
        page=page,
        total_pages=total_pages,
        total=total,
    )
