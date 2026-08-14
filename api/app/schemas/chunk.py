from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChunkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(description="Unique chunk ID.")
    attachment_id: int = Field(
        description="ID of the attachment this chunk was extracted from."
    )
    content: str = Field(description="Raw text content of the chunk.")
    metadata: dict | None = Field(
        default=None,
        validation_alias="extra_metadata",
        description="Optional metadata stored alongside the chunk (e.g. page number).",
    )
    created_at: datetime = Field(description="Timestamp when the chunk was created.")
    updated_at: datetime = Field(description="Timestamp of the last update.")
