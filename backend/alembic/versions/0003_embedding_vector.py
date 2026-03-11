"""add embedding column for semantic search (SEARCH-02)

Enables pgvector extension and adds a vector(1536) column to store
OpenAI text-embedding-3-small embeddings. Creates an HNSW index for
cosine similarity search.

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-10

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("""
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS embedding vector(1536)
    """)
    # HNSW index for fast approximate nearest-neighbor search by cosine distance
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_conversations_embedding_cosine
        ON conversations USING hnsw (embedding vector_cosine_ops)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_conversations_embedding_cosine")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS embedding")
    op.execute("DROP EXTENSION IF EXISTS vector")
