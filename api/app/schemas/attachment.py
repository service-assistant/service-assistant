from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from ..models import IngestionStatus


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(
        description="Unique attachment ID.",
        examples=[1],
    )
    file_global_path: str = Field(
        description="Absolute path to the file on disk.",
        examples=["/attachments/toyota_8fbe20_manual.pdf"],
    )
    original_filename: str = Field(
        description="Original filename as uploaded by the user.",
        examples=["toyota_8fbe20_manual.pdf"],
    )
    created_at: datetime = Field(
        description="Timestamp when the attachment was uploaded.",
        examples=["2026-01-15T09:12:00Z"],
    )
    updated_at: datetime = Field(
        description="Timestamp of the last update.",
        examples=["2026-01-15T09:12:00Z"],
    )

    ingest_status: IngestionStatus = Field(
        description="Current ingestion state.",
        examples=["running"],
    )
    ingest_job_id: int | None = Field(
        default=None,
        description="ID of the background job running this ingestion.",
        examples=[482],
    )
    ingest_pages_total: int = Field(
        description="Number of pages in the PDF, once known.",
        examples=[42],
    )
    ingest_pages_done: int = Field(
        description="Number of pages processed so far.",
        examples=[17],
    )
    ingest_chunks_indexed: int = Field(
        description="Number of chunks written to the vector store.",
        examples=[134],
    )
    ingest_last_event: str | None = Field(
        default=None,
        description="Most recent progress message from the pipeline.",
        examples=["Page 17: extracting native text."],
    )
    ingest_error: str | None = Field(
        default=None,
        description="Error message if the ingestion failed.",
        examples=[
            "EmbeddingServiceError: Azure embeddings failed or timed out; "
            "the file cannot be indexed and will be deleted."
        ],
    )
    ingest_native_text_pages: int = Field(
        default=0,
        description="Pages that had extractable text without OCR.",
        examples=[15],
    )
    ingest_ocr_pages_attempted: int = Field(
        default=0,
        description="Image-only pages that were sent to OCR.",
        examples=[2],
    )
    ingest_ocr_pages_succeeded: int = Field(
        default=0,
        description="Pages OCR recovered text from.",
        examples=[2],
    )
    ingest_ocr_pages_skipped: int = Field(
        default=0,
        description="Pages dropped because OCR failed or timed out.",
        examples=[0],
    )
    ingest_queued_at: datetime | None = Field(
        default=None,
        description="When the current/last attempt was queued.",
        examples=["2026-01-15T09:30:00Z"],
    )
    ingest_started_at: datetime | None = Field(
        default=None,
        description="When the worker picked the job up.",
        examples=["2026-01-15T09:30:02Z"],
    )
    ingest_finished_at: datetime | None = Field(
        default=None,
        description="When the ingestion reached a terminal state.",
        examples=["2026-01-15T09:31:47Z"],
    )
    ingest_updated_at: datetime | None = Field(
        default=None,
        description="Timestamp of the last progress update.",
        examples=["2026-01-15T09:30:52Z"],
    )
