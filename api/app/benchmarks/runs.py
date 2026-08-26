from dataclasses import dataclass
from typing import Any, Literal

BenchmarkRunState = Literal[
    "queued",
    "processing",
    "completed",
    "failed",
    "cancelled",
]

BenchmarkStepState = Literal[
    "queued",
    "processing",
    "completed",
    "failed",
]


@dataclass
class BenchmarkSetupStep:
    key: str
    label: str
    state: BenchmarkStepState = "queued"
    message: str = "Waiting"
    details: dict[str, Any] | None = None


@dataclass
class BenchmarkSetupRun:
    id: str
    state: BenchmarkRunState
    steps: list[BenchmarkSetupStep]
    created_at: str
    finished_at: str | None = None
    error: str | None = None
    result: dict[str, Any] | None = None


@dataclass
class BenchmarkCaseRun:
    id: str
    case_id: str
    state: BenchmarkRunState
    created_at: str
    finished_at: str | None = None
    error: str | None = None
    result: dict[str, Any] | None = None
    cancel_requested: bool = False
