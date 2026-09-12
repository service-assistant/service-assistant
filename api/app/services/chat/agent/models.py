from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

FactValue = str | float | bool


class AgentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MachineContext(AgentModel):
    device_id: int
    name: str = Field(min_length=1)
    model_serial_code: str | None = None
    nameplate_data: dict[str, object] | None = None


class Symptom(AgentModel):
    search_phrase: str = Field(min_length=1)
    fact_key: str = Field(default="reported_symptom", pattern=r"^[a-z][a-z0-9_]*$")
    fact_value: FactValue | None = None
    unit: str | None = None


class Observation(AgentModel):
    key: str = Field(
        min_length=1,
        pattern=r"^[a-z][a-z0-9_]*$",
        description="Stable snake_case key naming one atomic observed fact.",
    )
    value: FactValue
    unit: str | None = None
    certainty: Literal["certain", "uncertain"]


class ExtractedCaseContext(AgentModel):
    symptom: Symptom
    observations: list[Observation] = Field(default_factory=list)


class CaseContext(ExtractedCaseContext):
    machine: MachineContext


class RetrievalQueryPlan(AgentModel):
    base_queries: list[str] = Field(
        min_length=1,
        max_length=2,
        description="One or two short technical retrieval queries in English.",
    )
    contextual_queries: list[str] = Field(
        default_factory=list,
        max_length=1,
        description="Zero or one short contextual retrieval query in English.",
    )


class CaseUnderstandingResult(AgentModel):
    case_context: ExtractedCaseContext
    query_plan: RetrievalQueryPlan
