"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-02-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Pre-defined enum types — create_type=False tells SQLAlchemy the type
# already exists in the DB and must NOT be emitted as CREATE TYPE.
oauth_provider_enum = postgresql.ENUM("google", "github", name="oauth_provider_enum", create_type=False)
visibility_enum = postgresql.ENUM("public", "private", name="visibility_enum", create_type=False)
message_role_enum = postgresql.ENUM("user", "assistant", "system", name="message_role_enum", create_type=False)


def upgrade() -> None:
    # --- enums (idempotent via DO block) ---------------------------------
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE oauth_provider_enum AS ENUM ('google', 'github');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE visibility_enum AS ENUM ('public', 'private');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE message_role_enum AS ENUM ('user', 'assistant', 'system');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    # --- users -----------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("oauth_provider", oauth_provider_enum, nullable=False),
        sa.Column("oauth_sub", sa.String(256), nullable=False),
        sa.Column("email", sa.String(256), nullable=False),
        sa.Column("display_name", sa.String(256), nullable=False),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("oauth_provider", "oauth_sub", name="uq_user_provider_sub"),
    )

    # --- conversations ---------------------------------------------------
    op.create_table(
        "conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(512), nullable=False, server_default="Untitled"),
        sa.Column("model", sa.String(128), nullable=False, server_default="gpt-4o"),
        sa.Column("visibility", visibility_enum, nullable=False, server_default="private"),
        sa.Column("tags", postgresql.ARRAY(sa.String(64)), nullable=False, server_default="{}"),
        sa.Column("replay_count", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_conversations_owner_id", "conversations", ["owner_id"])
    op.create_index("ix_conversations_visibility", "conversations", ["visibility"])

    # --- messages --------------------------------------------------------
    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", message_role_enum, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])

    # --- collections -----------------------------------------------------
    op.create_table(
        "collections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("visibility", visibility_enum, nullable=False, server_default="private"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_collections_owner_id", "collections", ["owner_id"])

    # --- conversation_collections ----------------------------------------
    op.create_table(
        "conversation_collections",
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("collection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("conversation_collections")
    op.drop_index("ix_collections_owner_id", table_name="collections")
    op.drop_table("collections")
    op.drop_index("ix_messages_conversation_id", table_name="messages")
    op.drop_table("messages")
    op.drop_index("ix_conversations_visibility", table_name="conversations")
    op.drop_index("ix_conversations_owner_id", table_name="conversations")
    op.drop_table("conversations")
    op.drop_table("users")
    op.execute("""
        DO $$ BEGIN DROP TYPE message_role_enum;
        EXCEPTION WHEN undefined_object THEN NULL; END $$
    """)
    op.execute("""
        DO $$ BEGIN DROP TYPE visibility_enum;
        EXCEPTION WHEN undefined_object THEN NULL; END $$
    """)
    op.execute("""
        DO $$ BEGIN DROP TYPE oauth_provider_enum;
        EXCEPTION WHEN undefined_object THEN NULL; END $$
    """)
