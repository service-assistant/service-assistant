"""update message sender from system to assistant

Revision ID: 3b905efe4309
Revises: a1b2c3d4e5f6
Create Date: 2026-06-15 20:06:58.776483

"""

from typing import Sequence, Union

# import sqlalchemy as sa
from alembic import op


revision: str = "3b905efe4309"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE messages SET sender = 'assistant' WHERE sender = 'system'")


def downgrade() -> None:
    op.execute("UPDATE messages SET sender = 'system' WHERE sender = 'assistant'")
