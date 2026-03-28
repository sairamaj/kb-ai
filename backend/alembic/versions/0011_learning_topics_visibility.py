"""add learning_topics.visibility (reuse visibility_enum)

Revision ID: 0011
Revises: 0010
Create Date: 2026-03-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

visibility_enum = postgresql.ENUM("public", "private", name="visibility_enum", create_type=False)


def upgrade() -> None:
    op.add_column(
        "learning_topics",
        sa.Column("visibility", visibility_enum, nullable=False, server_default="private"),
    )


def downgrade() -> None:
    op.drop_column("learning_topics", "visibility")
