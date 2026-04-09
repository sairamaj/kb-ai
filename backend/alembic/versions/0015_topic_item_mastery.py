"""topic item review / mastery (ENH-04)

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "learning_topic_conversations",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "learning_topic_conversations",
        sa.Column("mastery_level", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "learning_topic_notes",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "learning_topic_notes",
        sa.Column("mastery_level", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("learning_topic_notes", "mastery_level")
    op.drop_column("learning_topic_notes", "reviewed_at")
    op.drop_column("learning_topic_conversations", "mastery_level")
    op.drop_column("learning_topic_conversations", "reviewed_at")
