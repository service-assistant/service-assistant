"""add message continuation flag

Revision ID: a81c4e7d9b20
Revises: 7d9f5d7a1c20
Create Date: 2026-07-19 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a81c4e7d9b20"
down_revision: Union[str, None] = "7d9f5d7a1c20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column(
            "has_continuation",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("messages", "has_continuation")
