from typing import Literal

from pydantic import BaseModel, Field, field_validator


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: (
        Literal[
            "Algenib",
            "Leda",
            "Aoede",
            "Despina",
            "Erinome",
            "Achernar",
            "Sulafat",
            "Vindemiatrix",
        ]
        | None
    ) = None
    style: Literal["neutral", "warm", "sensual", "extra_sensual", "extreme_sensual"] = (
        "neutral"
    )

    @field_validator("text", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value
