"""learning_topic_notes join (NB-03)

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "learning_topic_notes",
        sa.Column(
            "learning_topic_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("learning_topics.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "note_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("notes.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_learning_topic_notes_topic_position",
        "learning_topic_notes",
        ["learning_topic_id", "position"],
    )


def downgrade() -> None:
    op.drop_index("ix_learning_topic_notes_topic_position", table_name="learning_topic_notes")
    op.drop_table("learning_topic_notes")
