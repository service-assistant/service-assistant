"""remove image_url from messages

Revision ID: dc64913fec70
Revises: 93c770e5994a
Create Date: 2026-05-25 14:04:40.178676

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "dc64913fec70"
down_revision: Union[str, None] = "93c770e5994a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("messages", "image_url")


def downgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("image_url", sa.String(), nullable=True),
    )
