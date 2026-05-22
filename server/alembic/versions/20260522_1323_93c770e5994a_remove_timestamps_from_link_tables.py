"""remove timestamps from link tables

Revision ID: 93c770e5994a
Revises: f4c9b2e8d1a3
Create Date: 2026-05-22 13:23:30.451454

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "93c770e5994a"
down_revision: Union[str, None] = "f4c9b2e8d1a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("attachments_devices", "created_at")
    op.drop_column("attachments_devices", "updated_at")
    op.drop_column("chunks_messages", "created_at")
    op.drop_column("chunks_messages", "updated_at")


def downgrade() -> None:
    op.add_column(
        "attachments_devices", sa.Column("created_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "attachments_devices", sa.Column("updated_at", sa.DateTime(), nullable=True)
    )

    op.add_column(
        "chunks_messages", sa.Column("created_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "chunks_messages", sa.Column("updated_at", sa.DateTime(), nullable=True)
    )

    op.execute("UPDATE attachments_devices SET created_at = now(), updated_at = now()")
    op.execute("UPDATE chunks_messages SET created_at = now(), updated_at = now()")

    op.alter_column("attachments_devices", "created_at", nullable=False)
    op.alter_column("attachments_devices", "updated_at", nullable=False)
    op.alter_column("chunks_messages", "created_at", nullable=False)
    op.alter_column("chunks_messages", "updated_at", nullable=False)
