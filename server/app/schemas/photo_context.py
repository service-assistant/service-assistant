from pydantic import BaseModel, Field


class PhotoObservation(BaseModel):
    component: str = Field(min_length=1, max_length=160)
    main_identifier: str | None = Field(default=None, max_length=160)
    confidence: float | None = Field(default=None, ge=0, le=1)


class PhotoContextResponse(BaseModel):
    observations: list[PhotoObservation] = Field(default_factory=list, max_length=5)
