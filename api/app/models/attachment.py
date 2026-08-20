from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, utcnow
from .associations import AttachmentDevice

if TYPE_CHECKING:
    from .chunk import Chunk
    from .device import Device
    from .organization import Organization


class IngestionStatus(str, Enum):
    ready = "ready"  # uploaded but not ingested yet / waiting to be ingested
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey(
            "organizations.id",
            ondelete="CASCADE",
        ),
        index=True,
    )
    organization: Mapped[Organization] = relationship(
        back_populates="attachments",
        lazy="raise",
    )
    file_global_path: Mapped[str]
    original_filename: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=utcnow,
        onupdate=utcnow,
    )

    # Deliberate architecture decision to not create a separate table for these
    # as we will probably still load them all together in 90% of cases and
    ingest_status: Mapped[IngestionStatus] = mapped_column(
        SAEnum(IngestionStatus, native_enum=False),
        default=IngestionStatus.ready,
    )
    ingest_job_id: Mapped[int | None]
    ingest_pages_total: Mapped[int] = mapped_column(default=0)
    ingest_pages_done: Mapped[int] = mapped_column(default=0)
    ingest_chunks_indexed: Mapped[int] = mapped_column(default=0)
    ingest_last_event: Mapped[str | None]
    ingest_error: Mapped[str | None]
    ingest_native_text_pages: Mapped[int] = mapped_column(default=0)
    ingest_ocr_pages_attempted: Mapped[int] = mapped_column(default=0)
    ingest_ocr_pages_succeeded: Mapped[int] = mapped_column(default=0)
    ingest_ocr_pages_skipped: Mapped[int] = mapped_column(default=0)
    ingest_queued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ingest_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ingest_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ingest_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    chunks: Mapped[list[Chunk]] = relationship(
        back_populates="attachment",
        passive_deletes=True,
        lazy="raise",
    )

    devices: Mapped[list[Device]] = relationship(
        back_populates="attachments",
        secondary=AttachmentDevice.__table__,
        passive_deletes=True,
        lazy="raise",
    )
