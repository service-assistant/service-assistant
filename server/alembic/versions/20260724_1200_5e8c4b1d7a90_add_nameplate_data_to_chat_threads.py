"""add nameplate data to chat threads

Revision ID: 5e8c4b1d7a90
Revises: c47f8a2d9e10
Create Date: 2026-07-24 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "5e8c4b1d7a90"
down_revision: Union[str, None] = "c47f8a2d9e10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_threads",
        sa.Column("nameplate_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chat_threads", "nameplate_data")
