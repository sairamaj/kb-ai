import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import CurrentUser
from app.database import get_db
from app.models import Collection, Conversation, ConversationCollection, Message, MessageRole, Visibility

router = APIRouter(prefix="/conversations", tags=["conversations"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class SaveMessageInput(BaseModel):
    role: str
    content: str


class SaveConversationRequest(BaseModel):
    title: str = ""
    tags: list[str] = []
    messages: list[SaveMessageInput]
    model: str = "gpt-4o-mini"
    visibility: str = "private"


class ConversationResponse(BaseModel):
    id: str
    title: str
    tags: list[str]
    model: str
    visibility: str
    message_count: int
    replay_count: int
    created_at: str
    updated_at: str
    collection_ids: list[str] = []


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


class ConversationDetailResponse(BaseModel):
    id: str
    title: str
    tags: list[str]
    model: str
    visibility: str
    replay_count: int
    created_at: str
    updated_at: str
    messages: list[MessageResponse]
    collection_ids: list[str] = []


class PublicConversationDetailResponse(BaseModel):
    id: str
    title: str
    tags: list[str]
    model: str
    visibility: str
    replay_count: int
    created_at: str
    updated_at: str
    messages: list[MessageResponse]
    author_name: str
    author_avatar: str | None


class UpdateConversationRequest(BaseModel):
    title: str | None = None
    tags: list[str] | None = None
    visibility: str | None = None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _fetch_conversation(
    conv_uuid: uuid.UUID,
    db: AsyncSession,
) -> Conversation | None:
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conv_uuid)
        .options(
            selectinload(Conversation.messages),
            selectinload(Conversation.collection_links),
        )
    )
    return result.scalar_one_or_none()


async def _fetch_conversation_with_owner(
    conv_uuid: uuid.UUID,
    db: AsyncSession,
) -> Conversation | None:
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conv_uuid)
        .options(selectinload(Conversation.messages), selectinload(Conversation.owner))
    )
    return result.scalar_one_or_none()


def _to_detail_response(conv: Conversation) -> ConversationDetailResponse:
    return ConversationDetailResponse(
        id=str(conv.id),
        title=conv.title,
        tags=conv.tags or [],
        model=conv.model,
        visibility=conv.visibility,
        replay_count=conv.replay_count,
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
        messages=[
            MessageResponse(
                id=str(m.id),
                role=m.role,
                content=m.content,
                created_at=m.created_at.isoformat(),
            )
            for m in conv.messages
        ],
        collection_ids=[str(link.collection_id) for link in conv.collection_links],
    )


def _parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=404, detail="Conversation not found")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=ConversationResponse, status_code=201)
async def save_conversation(
    body: SaveConversationRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ConversationResponse:
    # Auto-generate title from first user message if blank.
    title = body.title.strip()
    if not title:
        first_user = next((m.content for m in body.messages if m.role == "user"), None)
        if first_user:
            title = first_user[:80].strip()
            if len(first_user) > 80:
                title += "…"
        else:
            title = "Untitled"

    # Persist only user/assistant turns; skip system messages and empty content.
    msgs = [
        m for m in body.messages
        if m.role in ("user", "assistant") and m.content.strip()
    ]

    conversation = Conversation(
        owner_id=uuid.UUID(current_user.sub),
        title=title,
        model=body.model,
        visibility=Visibility(body.visibility),
        tags=body.tags,
    )
    db.add(conversation)
    await db.flush()  # assign conversation.id before inserting messages

    for m in msgs:
        db.add(Message(
            conversation_id=conversation.id,
            role=MessageRole(m.role),
            content=m.content,
        ))

    await db.commit()
    await db.refresh(conversation)

    return ConversationResponse(
        id=str(conversation.id),
        title=conversation.title,
        tags=conversation.tags,
        model=conversation.model,
        visibility=conversation.visibility,
        message_count=len(msgs),
        replay_count=conversation.replay_count,
        created_at=conversation.created_at.isoformat(),
        updated_at=conversation.updated_at.isoformat(),
        collection_ids=[],
    )


@router.get("/tags", response_model=list[str])
async def list_tags(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[str]:
    """Return all distinct tags used across the current user's conversations."""
    owner_uuid = uuid.UUID(current_user.sub)
    result = await db.execute(
        select(func.unnest(Conversation.tags).label("tag"))
        .where(Conversation.owner_id == owner_uuid)
        .distinct()
        .order_by("tag")
    )
    return [row.tag for row in result.all()]


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    q: str = "",
    tags: list[str] = Query(default=[]),
    collection_id: str | None = Query(default=None, description="Filter to conversations in this collection"),
    sort: Literal["recent", "oldest", "most_replayed"] = "recent",
    limit: int = 50,
    offset: int = 0,
) -> list[ConversationResponse]:
    """
    List the authenticated user's conversations with optional keyword search,
    tag filtering, collection filter, and sorting.

    - ``q`` performs full-text search against conversation title/tags
      (via the GIN-indexed ``search_vector`` generated column) **and** against
      message content (via an inline ``to_tsvector`` subquery).
    - ``tags`` filters to conversations whose tags array overlaps the given set.
    - ``collection_id`` filters to conversations that belong to the given collection.
    - ``sort`` controls ordering: ``recent`` (default), ``oldest``, or
      ``most_replayed``.
    All parameters can be combined.
    """
    owner_uuid = uuid.UUID(current_user.sub)

    if collection_id is not None:
        try:
            col_uuid = uuid.UUID(collection_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid collection_id")
        col_result = await db.execute(
            select(Collection).where(Collection.id == col_uuid, Collection.owner_id == owner_uuid)
        )
        if col_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Collection not found")

    msg_count_sq = (
        select(func.count(Message.id))
        .where(Message.conversation_id == Conversation.id)
        .correlate(Conversation)
        .scalar_subquery()
    )

    stmt = (
        select(Conversation, msg_count_sq.label("message_count"))
        .where(Conversation.owner_id == owner_uuid)
    )

    if collection_id is not None:
        stmt = stmt.where(
            Conversation.id.in_(
                select(ConversationCollection.conversation_id).where(
                    ConversationCollection.collection_id == col_uuid
                )
            )
        )

    if tags:
        stmt = stmt.where(Conversation.tags.overlap(tags))

    q = q.strip()
    if q:
        ts_q = func.plainto_tsquery("english", q)
        # Use the GIN-indexed generated column for title + tags match.
        conv_match = literal_column("search_vector").op("@@")(ts_q)
        # Subquery for message-content match (sequential scan on messages,
        # acceptable for v1 scale).
        msg_subq = select(Message.conversation_id).where(
            func.to_tsvector("english", Message.content).op("@@")(ts_q)
        )
        stmt = stmt.where(or_(conv_match, Conversation.id.in_(msg_subq)))

    _sort_clause = {
        "recent": Conversation.updated_at.desc(),
        "oldest": Conversation.updated_at.asc(),
        "most_replayed": Conversation.replay_count.desc(),
    }[sort]
    stmt = stmt.order_by(_sort_clause).limit(limit).offset(offset)

    rows = (await db.execute(stmt)).all()

    # Load collection_ids for all listed conversations
    conv_ids = [conv.id for conv, _ in rows]
    collection_map: dict[uuid.UUID, list[str]] = {cid: [] for cid in conv_ids}
    if conv_ids:
        cc_result = await db.execute(
            select(ConversationCollection.conversation_id, ConversationCollection.collection_id).where(
                ConversationCollection.conversation_id.in_(conv_ids)
            )
        )
        for conv_id, col_id in cc_result.all():
            collection_map[conv_id].append(str(col_id))

    return [
        ConversationResponse(
            id=str(conv.id),
            title=conv.title,
            tags=conv.tags or [],
            model=conv.model,
            visibility=conv.visibility,
            message_count=msg_count,
            replay_count=conv.replay_count,
            created_at=conv.created_at.isoformat(),
            updated_at=conv.updated_at.isoformat(),
            collection_ids=collection_map.get(conv.id, []),
        )
        for conv, msg_count in rows
    ]


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conversation_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ConversationDetailResponse:
    conv_uuid = _parse_uuid(conversation_id)
    conv = await _fetch_conversation(conv_uuid, db)
    if conv is None or str(conv.owner_id) != current_user.sub:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _to_detail_response(conv)


@router.get("/{conversation_id}/public", response_model=PublicConversationDetailResponse)
async def get_public_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
) -> PublicConversationDetailResponse:
    """Return a conversation that is marked public. No authentication required.
    Returns 403 if the conversation exists but is private."""
    conv_uuid = _parse_uuid(conversation_id)
    conv = await _fetch_conversation_with_owner(conv_uuid, db)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.visibility != Visibility.public:
        raise HTTPException(status_code=403, detail="This conversation is private")
    return PublicConversationDetailResponse(
        id=str(conv.id),
        title=conv.title,
        tags=conv.tags or [],
        model=conv.model,
        visibility=conv.visibility,
        replay_count=conv.replay_count,
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
        messages=[
            MessageResponse(
                id=str(m.id),
                role=m.role,
                content=m.content,
                created_at=m.created_at.isoformat(),
            )
            for m in conv.messages
        ],
        author_name=conv.owner.display_name,
        author_avatar=conv.owner.avatar_url,
    )


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    conv_uuid = _parse_uuid(conversation_id)
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_uuid)
    )
    conv = result.scalar_one_or_none()
    if conv is None or str(conv.owner_id) != current_user.sub:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conv)
    await db.commit()


class ReplayCountResponse(BaseModel):
    replay_count: int


@router.post("/{conversation_id}/replay", response_model=ReplayCountResponse)
async def increment_replay_count(
    conversation_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ReplayCountResponse:
    """Increment replay_count each time Replay Mode is started for a conversation."""
    conv_uuid = _parse_uuid(conversation_id)
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_uuid)
    )
    conv = result.scalar_one_or_none()
    if conv is None or str(conv.owner_id) != current_user.sub:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv.replay_count = (conv.replay_count or 0) + 1
    await db.commit()
    return ReplayCountResponse(replay_count=conv.replay_count)


@router.patch("/{conversation_id}", response_model=ConversationDetailResponse)
async def update_conversation(
    conversation_id: str,
    body: UpdateConversationRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ConversationDetailResponse:
    conv_uuid = _parse_uuid(conversation_id)
    conv = await _fetch_conversation(conv_uuid, db)
    if conv is None or str(conv.owner_id) != current_user.sub:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if body.title is not None:
        stripped = body.title.strip()
        if stripped:
            conv.title = stripped
    if body.tags is not None:
        conv.tags = body.tags
    if body.visibility is not None:
        conv.visibility = Visibility(body.visibility)

    conv.updated_at = datetime.now(timezone.utc)

    await db.commit()

    # Re-fetch with messages to return fresh timestamps and loaded relationship.
    conv = await _fetch_conversation(conv_uuid, db)
    return _to_detail_response(conv)  # type: ignore[arg-type]
