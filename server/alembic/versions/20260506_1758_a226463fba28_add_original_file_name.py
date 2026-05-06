"""add original file name

Revision ID: a226463fba28
Revises: 63476f0c9e4e
Create Date: 2026-05-06 17:58:26.600114

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
import sqlmodel.sql.sqltypes


revision: str = 'a226463fba28'
down_revision: Union[str, None] = '63476f0c9e4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "attachment_chunks",
        sa.Column("document_original_name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("attachment_chunks", "document_original_name")
