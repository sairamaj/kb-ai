import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.database import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class Visibility(str, enum.Enum):
    public = "public"
    private = "private"


class OAuthProvider(str, enum.Enum):
    google = "google"
    github = "github"


class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class UserRole(str, enum.Enum):
    administrator = "administrator"
    pro = "pro"
    starter = "starter"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    oauth_provider: Mapped[str] = mapped_column(Enum(OAuthProvider, name="oauth_provider_enum"), nullable=False)
    oauth_sub: Mapped[str] = mapped_column(String(256), nullable=False)
    email: Mapped[str] = mapped_column(String(256), nullable=False)
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(
        Enum(UserRole, name="user_role_enum"),
        nullable=False,
        default=UserRole.starter,
    )
    # AUTHZ-07: Lifetime count of conversations created (Starter cap); never decremented on delete.
    lifetime_conversations_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # AUTHZ-10: Lifetime count of collections created (Starter cap); never decremented on delete.
    lifetime_collections_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # REP-04: Last time the user performed an authenticated action (e.g. /auth/me).
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # REP-05: Number of visits (incremented on each OAuth login).
    visit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    conversations: Mapped[list["Conversation"]] = relationship("Conversation", back_populates="owner", cascade="all, delete-orphan")
    collections: Mapped[list["Collection"]] = relationship("Collection", back_populates="owner", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("oauth_provider", "oauth_sub", name="uq_user_provider_sub"),
    )


# ---------------------------------------------------------------------------
# Conversation
# ---------------------------------------------------------------------------

class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False, default="Untitled")
    model: Mapped[str] = mapped_column(String(128), nullable=False, default="gpt-4o")
    visibility: Mapped[str] = mapped_column(Enum(Visibility, name="visibility_enum"), nullable=False, default=Visibility.private)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(64)), nullable=False, default=list)
    replay_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    # OpenAI embedding for semantic search (text-embedding-3-small, 1536 dimensions)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)

    owner: Mapped["User"] = relationship("User", back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")
    collection_links: Mapped[list["ConversationCollection"]] = relationship("ConversationCollection", back_populates="conversation", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Message
# ---------------------------------------------------------------------------

class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(Enum(MessageRole, name="message_role_enum"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")


# ---------------------------------------------------------------------------
# Collection
# ---------------------------------------------------------------------------

class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    visibility: Mapped[str] = mapped_column(Enum(Visibility, name="visibility_enum"), nullable=False, default=Visibility.private)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    owner: Mapped["User"] = relationship("User", back_populates="collections")
    conversation_links: Mapped[list["ConversationCollection"]] = relationship("ConversationCollection", back_populates="collection", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# ConversationCollection (join table)
# ---------------------------------------------------------------------------

class ConversationCollection(Base):
    __tablename__ = "conversation_collections"

    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True)
    collection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="collection_links")
    collection: Mapped["Collection"] = relationship("Collection", back_populates="conversation_links")
