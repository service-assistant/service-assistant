"""Remove server_default from timestamp columns

Revision ID: a1b2c3d4e5f6
Revises: 4a82b8e216a4
Create Date: 2026-06-06 12:24:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "4a82b8e216a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = [
    "brands",
    "device_types",
    "devices",
    "attachments",
    "chunks",
    "chat_threads",
    "messages",
]


def upgrade() -> None:
    for table in TABLES:
        op.alter_column(
            table,
            "created_at",
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            server_default=None,
        )
        op.alter_column(
            table,
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            server_default=None,
        )


def downgrade() -> None:
    for table in TABLES:
        op.alter_column(
            table,
            "created_at",
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            server_default=sa.text("NOW()"),
        )
        op.alter_column(
            table,
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
            server_default=sa.text("NOW()"),
        )
