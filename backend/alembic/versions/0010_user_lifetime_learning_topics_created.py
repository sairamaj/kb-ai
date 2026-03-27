"""add user lifetime_learning_topics_created (TOPIC-11)

Revision ID: 0010
Revises: 0009
Create Date: 2026-03-27

Starter users have a lifetime cap on learning topics created; this column
tracks the count (incremented on create, never decremented on delete).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("lifetime_learning_topics_created", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "lifetime_learning_topics_created")
