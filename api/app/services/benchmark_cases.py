from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class BenchmarkSource(BaseModel):
    filename: str
    locator: str
    page: int | None = None


class BenchmarkCase(BaseModel):
    id: str
    title: str
    category: str
    question: str
    diagnostic_mode_enabled: bool
    expected_route: str
    canonical_fault_code: str | None = None
    reference_answer: str
    required_facts: list[str] = Field(min_length=1)
    required_behaviors: list[str] = Field(default_factory=list)
    forbidden_claims: list[str] = Field(default_factory=list)
    source: BenchmarkSource
    evaluation_mode: Literal["llm", "source_image"] = "llm"
    minimum_source_images: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_source_image_evaluation(self) -> "BenchmarkCase":
        if self.evaluation_mode == "source_image" and self.minimum_source_images < 1:
            raise ValueError(
                "source_image benchmark cases require minimum_source_images >= 1"
            )
        return self


class BenchmarkDataset(BaseModel):
    version: str
    cases: list[BenchmarkCase]


def load_benchmark_dataset() -> BenchmarkDataset:
    dataset_path = Path(__file__).parent.parent / "benchmarks" / "cases.json"
    return BenchmarkDataset.model_validate_json(
        dataset_path.read_text(encoding="utf-8")
    )


def serialize_benchmark_cases() -> list[dict]:
    return [case.model_dump(mode="json") for case in load_benchmark_dataset().cases]
