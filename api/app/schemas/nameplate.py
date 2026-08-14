from pydantic import BaseModel, Field


class NameplateAttribute(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=500)
    unit: str | None = Field(default=None, max_length=40)
    confidence: float | None = Field(default=None, ge=0, le=1)


class NameplateData(BaseModel):
    model: str = Field(min_length=1, max_length=200)
    attributes: list[NameplateAttribute] = Field(default_factory=list)
    raw_text: str = Field(default="", max_length=20_000)
    model_confidence: float | None = Field(default=None, ge=0, le=1)
    match_confidence: float | None = Field(default=None, ge=0, le=1)


class NameplateDeviceCandidate(BaseModel):
    id: int
    name: str
    model_serial_code: str | None = None
    score: float = Field(ge=0, le=1)
    matched_identifier: str


class NameplateRecognitionResponse(BaseModel):
    nameplate_data: NameplateData
    matched_device: NameplateDeviceCandidate | None = None
    candidates: list[NameplateDeviceCandidate] = Field(default_factory=list)
    requires_confirmation: bool
