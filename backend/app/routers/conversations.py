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
from app.openai_client import embed_text, has_openai_key

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
    similarity: float | None = None  # Present when search_mode=semantic


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

def _text_for_embedding(title: str, tags: list[str], message_contents: list[str]) -> str:
    """Build a single text blob for embedding from conversation metadata and messages."""
    parts = [title or "", " ".join(tags or [])]
    parts.extend(message_contents or [])
    return " ".join(p.strip() for p in parts if p and p.strip())


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

    # Persist user/assistant/system turns; skip empty content.
    msgs = [
        m for m in body.messages
        if m.role in ("user", "assistant", "system") and m.content.strip()
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

    # Generate and store embedding for semantic search when OpenAI is configured.
    text_to_embed = _text_for_embedding(
        title,
        body.tags,
        [m.content for m in msgs],
    )
    embedding = await embed_text(text_to_embed)
    if embedding is not None:
        conversation.embedding = embedding

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
        similarity=None,
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
    search_mode: Literal["keyword", "semantic"] = Query(default="keyword", description="Keyword (full-text) or semantic (embedding similarity) search"),
    tags: list[str] = Query(default=[]),
    collection_id: str | None = Query(default=None, description="Filter to conversations in this collection"),
    sort: Literal["recent", "oldest", "most_replayed"] = "recent",
    limit: int = 50,
    offset: int = 0,
) -> list[ConversationResponse]:
    """
    List the authenticated user's conversations with optional keyword or semantic search,
    tag filtering, collection filter, and sorting.

    - ``q``: search query. With ``search_mode=keyword`` (default) performs full-text search
      against title/tags and message content. With ``search_mode=semantic`` converts ``q`` to
      an embedding and ranks by cosine similarity (requires OPENAI_API_KEY).
    - ``tags`` filters to conversations whose tags array overlaps the given set.
    - ``collection_id`` filters to conversations that belong to the given collection.
    - ``sort`` controls ordering when not using semantic search: ``recent`` (default),
      ``oldest``, or ``most_replayed``.
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

    q = q.strip()
    semantic_search = search_mode == "semantic" and q
    if semantic_search:
        if not has_openai_key():
            raise HTTPException(
                status_code=503,
                detail="Semantic search requires OPENAI_API_KEY to be configured",
            )
        query_embedding = await embed_text(q)
        if query_embedding is None:
            raise HTTPException(status_code=503, detail="Failed to generate search embedding")
        # Similarity = 1 - cosine_distance (so higher is more similar)
        similarity_expr = (1 - Conversation.embedding.cosine_distance(query_embedding)).label("similarity")
        stmt = (
            select(Conversation, msg_count_sq.label("message_count"), similarity_expr)
            .where(
                Conversation.owner_id == owner_uuid,
                Conversation.embedding.isnot(None),
            )
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
        stmt = stmt.order_by(literal_column("similarity").desc()).limit(limit).offset(offset)
        rows = (await db.execute(stmt)).all()
        conv_ids = [row[0].id for row in rows]
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
                id=str(row[0].id),
                title=row[0].title,
                tags=row[0].tags or [],
                model=row[0].model,
                visibility=row[0].visibility,
                message_count=row[1],
                replay_count=row[0].replay_count,
                created_at=row[0].created_at.isoformat(),
                updated_at=row[0].updated_at.isoformat(),
                collection_ids=collection_map.get(row[0].id, []),
                similarity=round(row[2], 4) if row[2] is not None else None,
            )
            for row in rows
        ]

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
        # Rank by relevance when searching (SEARCH-01).
        rank_expr = func.ts_rank(literal_column("search_vector"), ts_q)
        stmt = stmt.add_columns(rank_expr.label("_rank"))

    _sort_clause = {
        "recent": Conversation.updated_at.desc(),
        "oldest": Conversation.updated_at.asc(),
        "most_replayed": Conversation.replay_count.desc(),
    }[sort]
    if q:
        stmt = stmt.order_by(literal_column("_rank").desc().nulls_last(), _sort_clause)
    else:
        stmt = stmt.order_by(_sort_clause)
    stmt = stmt.limit(limit).offset(offset)

    rows = (await db.execute(stmt)).all()

    # Load collection_ids for all listed conversations
    conv_ids = [row[0].id for row in rows]
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
            similarity=None,
        )
        for conv, msg_count in ((row[0], row[1]) for row in rows)
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

    # Recompute embedding when title or tags change so semantic search stays accurate.
    if body.title is not None or body.tags is not None:
        message_contents = [m.content for m in conv.messages]
        text_to_embed = _text_for_embedding(conv.title, conv.tags or [], message_contents)
        new_embedding = await embed_text(text_to_embed)
        if new_embedding is not None:
            conv.embedding = new_embedding

    await db.commit()

    # Re-fetch with messages to return fresh timestamps and loaded relationship.
    conv = await _fetch_conversation(conv_uuid, db)
    return _to_detail_response(conv)  # type: ignore[arg-type]
