"""create learning_topic_conversations schema (TOPIC-02)

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "learning_topic_conversations",
        sa.Column(
            "learning_topic_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("learning_topics.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("learning_topic_id", "conversation_id", name="uq_learning_topic_conversation"),
    )
    op.create_index(
        "ix_learning_topic_conversations_topic_position",
        "learning_topic_conversations",
        ["learning_topic_id", "position"],
    )


def downgrade() -> None:
    op.drop_index("ix_learning_topic_conversations_topic_position", table_name="learning_topic_conversations")
    op.drop_table("learning_topic_conversations")
