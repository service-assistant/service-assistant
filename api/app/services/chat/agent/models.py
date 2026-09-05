from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AgentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MachineContext(AgentModel):
    device_id: int
    name: str = Field(min_length=1)
    model_serial_code: str | None = None
    nameplate_data: dict[str, object] | None = None


class Symptom(AgentModel):
    raw: str = Field(min_length=1)
    search_phrase: str = Field(min_length=1)


class Observation(AgentModel):
    type: str = Field(min_length=1)
    value: str = Field(min_length=1)
    certainty: Literal["certain", "uncertain"]


class ExtractedCaseContext(AgentModel):
    symptom: Symptom
    observations: list[Observation] = Field(default_factory=list)


class CaseContext(ExtractedCaseContext):
    machine: MachineContext


class RetrievalQueryPlan(AgentModel):
    base_queries: list[str] = Field(min_length=1, max_length=3)
    contextual_queries: list[str] = Field(default_factory=list, max_length=3)


class CaseUnderstandingResult(AgentModel):
    case_context: ExtractedCaseContext
    query_plan: RetrievalQueryPlan
