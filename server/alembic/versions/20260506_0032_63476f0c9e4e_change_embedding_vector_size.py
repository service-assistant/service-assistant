"""change embedding vector size

Revision ID: 63476f0c9e4e
Revises: 5b668b89ccdc
Create Date: 2026-05-06 00:32:32.092296

"""
from typing import Sequence, Union

import pgvector.sqlalchemy
from alembic import op


revision: str = '63476f0c9e4e'
down_revision: Union[str, None] = '5b668b89ccdc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "attachment_chunks",
        "embedding",
        type_=pgvector.sqlalchemy.Vector(1536),
        postgresql_using="embedding::vector(1536)",
    )


def downgrade() -> None:
    op.alter_column(
        "attachment_chunks",
        "embedding",
        type_=pgvector.sqlalchemy.Vector(1024),
        postgresql_using="embedding::vector(1024)",
    )