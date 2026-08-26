from pydantic import BaseModel, ConfigDict, Field


class CriterionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int = Field(ge=0)
    satisfied: bool
    evidence: str


class JudgeResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    required_facts: list[CriterionResult]
    required_behaviors: list[CriterionResult]
    forbidden_claims: list[CriterionResult]
    feedback: str


class ChunkEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int = Field(ge=0)
    relevance_score: int = Field(ge=0, le=3)
    supported_fact_indexes: list[int]
    evidence: str


class ChunkJudgeResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chunks: list[ChunkEvaluation]
    feedback: str
