import re
from typing import Literal

from app.schemas import ChatMode
from pydantic import BaseModel, Field, model_validator


class BenchmarkSource(BaseModel):
    filename: str
    locator: str
    page: int | None = None


class BenchmarkSimulationFact(BaseModel):
    value: str | float | bool
    unit: str | None = None
    technician_reply: str = Field(min_length=1)
    aliases: list[str] = Field(default_factory=list)


class BenchmarkCaseAssumption(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    statement: str = Field(min_length=1)
    source_locator: str = Field(min_length=1)
    source_page: int = Field(ge=1)


class BenchmarkAgentGoal(BaseModel):
    required_evidence_fact_keys: list[str] = Field(default_factory=list)
    terminal_goal: str = Field(min_length=1)
    min_primary_actions: int = Field(default=1, ge=0)
    max_primary_actions: int = Field(default=1, ge=0)

    @model_validator(mode="after")
    def validate_primary_action_range(self):
        if self.min_primary_actions > self.max_primary_actions:
            raise ValueError("min_primary_actions cannot exceed max_primary_actions")
        return self


class BenchmarkCase(BaseModel):
    id: str
    title: str
    category: str
    question: str
    mode: ChatMode = ChatMode.standard
    expected_route: str
    canonical_fault_code: str | None = None
    reference_answer: str
    required_facts: list[str] = Field(min_length=1)
    required_behaviors: list[str] = Field(default_factory=list)
    forbidden_claims: list[str] = Field(default_factory=list)
    source: BenchmarkSource
    evaluation_mode: Literal["llm", "source_image"] = "llm"
    minimum_source_images: int = Field(default=0, ge=0)
    simulation_facts: dict[str, BenchmarkSimulationFact] = Field(default_factory=dict)
    assumptions: list[BenchmarkCaseAssumption] = Field(default_factory=list)
    agent_goal: BenchmarkAgentGoal | None = None

    @model_validator(mode="after")
    def validate_source_image_evaluation(self) -> "BenchmarkCase":
        if self.evaluation_mode == "source_image" and self.minimum_source_images < 1:
            raise ValueError(
                "source_image benchmark cases require minimum_source_images >= 1"
            )
        known_names: set[str] = set()
        for fact_key, fact in self.simulation_facts.items():
            for name in [fact_key, *fact.aliases]:
                if re.fullmatch(r"[a-z][a-z0-9_]*", name) is None:
                    raise ValueError(f"simulation fact name must be snake_case: {name}")
                if name in known_names:
                    raise ValueError(
                        f"simulation fact name must be unique within a case: {name}"
                    )
                known_names.add(name)
        assumption_keys = [assumption.key for assumption in self.assumptions]
        if len(assumption_keys) != len(set(assumption_keys)):
            raise ValueError("case assumption keys must be unique within a case")
        if self.agent_goal is not None:
            unknown_evidence_keys = (
                set(self.agent_goal.required_evidence_fact_keys) - known_names
            )
            if unknown_evidence_keys:
                raise ValueError(
                    "agent goal references unknown simulation facts: "
                    + ", ".join(sorted(unknown_evidence_keys))
                )
        return self


class BenchmarkDataset(BaseModel):
    version: str
    cases: list[BenchmarkCase]
