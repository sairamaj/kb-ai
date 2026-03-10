"""add search vector to conversations

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-10

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add a GENERATED ALWAYS AS STORED tsvector column that indexes
    # title + tags for fast GIN-based full-text search.
    op.execute("""
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector(
                'english',
                coalesce(title, '') || ' ' ||
                coalesce(array_to_string(tags, ' '), '')
            )
        ) STORED
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_conv_search
        ON conversations USING GIN(search_vector)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_conv_search")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS search_vector")
