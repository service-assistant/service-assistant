from datetime import datetime

from pydantic import BaseModel, Field


class JobRead(BaseModel):
    id: int = Field(description="Procrastinate job ID.")
    queue_name: str = Field(description="Queue the job was submitted to.")
    task_name: str = Field(description="Name of the task function.")
    lock: str | None = Field(default=None, description="Lock key, if any.")
    args: dict = Field(description="Task arguments.")
    status: str = Field(description="Job status (todo, doing, succeeded, failed, ...).")
    scheduled_at: datetime | None = Field(
        default=None, description="When the job is scheduled to run, if deferred."
    )
    attempts: int = Field(description="Number of attempts made so far.")
    abort_requested: bool = Field(description="Whether cancellation was requested.")


class JobListRead(BaseModel):
    items: list[JobRead]
    page: int
    total_pages: int
    total: int
