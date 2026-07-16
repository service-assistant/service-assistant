"""preserve compatibility with the removed diagnostic state migration

Revision ID: 7d9f5d7a1c20
Revises: 3b905efe4309
Create Date: 2026-07-14 12:00:00.000000

The original version of this revision briefly added diagnostic state columns.
Diagnostic state is now reconstructed from message history, so fresh databases
must not create those columns. Keeping the revision as a no-op allows databases
that already recorded this revision to remain on a valid Alembic history.
"""

from typing import Sequence, Union


revision: str = "7d9f5d7a1c20"
down_revision: Union[str, None] = "3b905efe4309"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
