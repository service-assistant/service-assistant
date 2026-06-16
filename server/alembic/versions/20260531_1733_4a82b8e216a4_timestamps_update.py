"""Timestamps update

Revision ID: 4a82b8e216a4
Revises: 63476f0c9e4e
Create Date: 2026-05-31 17:33:18.916615

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "4a82b8e216a4"
down_revision: Union[str, None] = "dc64913fec70"
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
            type_=sa.DateTime(timezone=True),
            postgresql_using="created_at AT TIME ZONE 'UTC'",
            existing_nullable=False,
            server_default=sa.text("NOW()"),
        )
        op.alter_column(
            table,
            "updated_at",
            type_=sa.DateTime(timezone=True),
            postgresql_using="updated_at AT TIME ZONE 'UTC'",
            existing_nullable=False,
            server_default=sa.text("NOW()"),
        )


def downgrade() -> None:
    for table in TABLES:
        op.alter_column(
            table,
            "created_at",
            type_=sa.DateTime(timezone=False),
            postgresql_using="created_at AT TIME ZONE 'UTC'",
            existing_nullable=False,
            server_default=sa.text("NOW()"),
        )
        op.alter_column(
            table,
            "updated_at",
            type_=sa.DateTime(timezone=False),
            postgresql_using="updated_at AT TIME ZONE 'UTC'",
            existing_nullable=False,
            server_default=sa.text("NOW()"),
        )
