"""add ingest columns to attachments

Revision ID: 9c2f1a7b4d31
Revises: 1488e1a78ed2
Create Date: 2026-08-17 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "9c2f1a7b4d31"
down_revision: Union[str, None] = "1488e1a78ed2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE attachments
            ADD COLUMN ingest_status VARCHAR(9) NOT NULL DEFAULT 'ready',
            ADD COLUMN ingest_job_id BIGINT,
            ADD COLUMN ingest_pages_total INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN ingest_pages_done INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN ingest_chunks_indexed INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN ingest_last_event VARCHAR,
            ADD COLUMN ingest_error VARCHAR,
            -- Page/OCR breakdown, kept for diagnosing bad scans.
            ADD COLUMN ingest_native_text_pages INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN ingest_ocr_pages_attempted INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN ingest_ocr_pages_succeeded INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN ingest_ocr_pages_skipped INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN ingest_queued_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN ingest_started_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN ingest_finished_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN ingest_updated_at TIMESTAMP WITH TIME ZONE;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE attachments
            DROP COLUMN ingest_status,
            DROP COLUMN ingest_job_id,
            DROP COLUMN ingest_pages_total,
            DROP COLUMN ingest_pages_done,
            DROP COLUMN ingest_chunks_indexed,
            DROP COLUMN ingest_last_event,
            DROP COLUMN ingest_error,
            DROP COLUMN ingest_native_text_pages,
            DROP COLUMN ingest_ocr_pages_attempted,
            DROP COLUMN ingest_ocr_pages_succeeded,
            DROP COLUMN ingest_ocr_pages_skipped,
            DROP COLUMN ingest_queued_at,
            DROP COLUMN ingest_started_at,
            DROP COLUMN ingest_finished_at,
            DROP COLUMN ingest_updated_at;
        """
    )
