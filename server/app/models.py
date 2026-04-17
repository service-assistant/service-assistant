from datetime import datetime, timezone
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

EMBEDDING_DIMENSIONS = 1024


class AttachmentChunk(SQLModel, table=True):
    __tablename__ = "attachment_chunks"  # type: ignore[assignment]

    id: int | None = Field(default=None, primary_key=True)
    content: str
    embedding: Any = Field(
        sa_column=Column(Vector(EMBEDDING_DIMENSIONS), nullable=False)
    )
    document_name: str
    page: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    extra_metadata: dict | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
