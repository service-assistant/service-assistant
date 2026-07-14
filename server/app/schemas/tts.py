from pydantic import BaseModel, Field, field_validator


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1)

    @field_validator("text", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value
