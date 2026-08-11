from datetime import datetime
from enum import Enum

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from app.models.message import MessageSender

from .photo_context import PhotoObservation


class MessageCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content: str = Field(
        description="Text of the user message.",
        examples=["What does fault code E-23 mean and how do I clear it?"],
    )
    diagnostic_mode_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "diagnostic_mode_enabled", "diagnostic_mode_2002"
        ),
        description="Whether the Next Best Step diagnostic flow is enabled.",
    )
    photo_context: list[PhotoObservation] = Field(
        default_factory=list,
        max_length=5,
        description=(
            "Concise observations extracted from technician photos before retrieval."
        ),
    )


class TranscriptDecision(str, Enum):
    accept = "accept"
    ignore = "ignore"


class TranscriptResponse(BaseModel):
    decision: TranscriptDecision
    transcript: str = Field(
        default="",
        description="Selected technician utterance, empty unless decision is accept.",
        examples=["Jak zresetować błąd E-23?"],
    )
    message: str | None = Field(
        default=None,
        description="Optional feedback to display instead of sending a chat message.",
    )


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique message ID.")
    content: str = Field(
        description="Text content of the message.",
        examples=["What does fault code E-23 mean and how do I clear it?"],
    )
    sender: MessageSender = Field(
        description="Who sent the message: `user` or `system` (assistant)."
    )
    has_continuation: bool = Field(
        description=(
            "Whether the documentation contains a coherent continuation of this "
            "assistant response."
        )
    )
    router_decision: str | None = Field(
        default=None,
        description="Message route selected before generating this assistant response.",
    )
    thread_id: int = Field(
        description="ID of the thread this message belongs to.", examples=[1]
    )
    created_at: datetime = Field(description="Timestamp when the message was created.")
    updated_at: datetime = Field(description="Timestamp of the last update.")
