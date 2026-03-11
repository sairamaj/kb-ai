"""add search vector to conversations (SEARCH-01)

Adds a tsvector column and GIN index for full-text search on title and tags.
The column is maintained by a trigger (not GENERATED ALWAYS AS) because
array_to_string() is STABLE and cannot be used in a generated expression.

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
    # array_to_string() is STABLE, not IMMUTABLE, so PostgreSQL rejects it
    # in a GENERATED ALWAYS AS expression. Use a plain tsvector column kept
    # current by a trigger instead.
    op.execute("""
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS search_vector tsvector
    """)

    # Backfill existing rows.
    op.execute("""
        UPDATE conversations
        SET search_vector = to_tsvector(
            'english'::regconfig,
            coalesce(title, '') || ' ' ||
            coalesce(array_to_string(tags, ' '), '')
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_conv_search
        ON conversations USING GIN(search_vector)
    """)

    # Trigger function: recompute search_vector on INSERT or UPDATE.
    op.execute("""
        CREATE OR REPLACE FUNCTION conversations_search_vector_update()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            NEW.search_vector := to_tsvector(
                'english'::regconfig,
                coalesce(NEW.title, '') || ' ' ||
                coalesce(array_to_string(NEW.tags, ' '), '')
            );
            RETURN NEW;
        END;
        $$
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trig_conv_search_vector ON conversations
    """)

    op.execute("""
        CREATE TRIGGER trig_conv_search_vector
        BEFORE INSERT OR UPDATE OF title, tags
        ON conversations
        FOR EACH ROW EXECUTE FUNCTION conversations_search_vector_update()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trig_conv_search_vector ON conversations")
    op.execute("DROP FUNCTION IF EXISTS conversations_search_vector_update()")
    op.execute("DROP INDEX IF EXISTS idx_conv_search")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS search_vector")
