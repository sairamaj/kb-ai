"""notes table + user lifetime_notes_created (NB-01)

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

visibility_enum = postgresql.ENUM("public", "private", name="visibility_enum", create_type=False)


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("lifetime_notes_created", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.String(64)), nullable=False, server_default="{}"),
        sa.Column("visibility", visibility_enum, nullable=False, server_default="private"),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute(
        """
        ALTER TABLE notes
        ADD COLUMN IF NOT EXISTS embedding vector(1536)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notes_owner_updated_at
        ON notes (owner_id, updated_at DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notes_embedding_cosine
        ON notes USING hnsw (embedding vector_cosine_ops)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_notes_embedding_cosine")
    op.execute("DROP INDEX IF EXISTS idx_notes_owner_updated_at")
    op.drop_table("notes")
    op.drop_column("users", "lifetime_notes_created")
