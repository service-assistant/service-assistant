"""add message router decision

Revision ID: c47f8a2d9e10
Revises: a81c4e7d9b20
Create Date: 2026-07-21 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c47f8a2d9e10"
down_revision: Union[str, None] = "a81c4e7d9b20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("router_decision", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("messages", "router_decision")
