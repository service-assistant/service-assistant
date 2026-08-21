from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from ..models import IngestionStatus


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


class DebugChunkPageRead(BaseModel):
    page_number: int = Field(description="One-based PDF page number.")
    chunk_count: int = Field(description="Number of chunks assigned to the page.")


class DebugChunkFileRead(BaseModel):
    id: int
    organization_id: int
    organization_name: str
    organization_slug: str
    original_filename: str
    ingest_status: IngestionStatus
    ingest_pages_total: int
    chunk_count: int
    created_at: datetime


class DebugChunkFileDetailRead(DebugChunkFileRead):
    chunk_pages: list[DebugChunkPageRead]
