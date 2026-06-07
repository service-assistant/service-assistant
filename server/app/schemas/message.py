from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.message import MessageSender


class MessageCreate(BaseModel):
    content: str = Field(
        description="Text of the user message.",
        examples=["What does fault code E-23 mean and how do I clear it?"],
    )


class TranscriptResponse(BaseModel):
    transcript: str = Field(
        description="Speech-to-text result for the uploaded audio.",
        examples=["Jak zresetować błąd E-23?"],
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
    thread_id: int = Field(
        description="ID of the thread this message belongs to.", examples=[1]
    )
    created_at: datetime = Field(description="Timestamp when the message was created.")
    updated_at: datetime = Field(description="Timestamp of the last update.")
