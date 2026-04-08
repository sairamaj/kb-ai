"""Unified full-text and semantic search across conversations and notes (ENH-06)."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import BigInteger, Integer, String, Text, cast, func, literal, literal_column, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser
from app.database import get_db
from app.models import Conversation, ConversationCollection, Message, Note
from app.openai_client import embed_text, has_openai_key

router = APIRouter(prefix="/search", tags=["search"])


class UnifiedSearchItem(BaseModel):
    type: Literal["conversation", "note"]
    id: str
    title: str
    tags: list[str]
    updated_at: str
    is_pinned: bool
    visibility: str
    score: float | None = Field(None, description="Full-text rank or semantic similarity (0–1)")
    message_count: int | None = None
    model: str | None = None
    replay_count: int | None = None
    content_preview: str | None = None
    collection_ids: list[str] = Field(default_factory=list)


def _note_preview_expr():
    """Short plain-text preview for search cards (matches notes list ~150 chars)."""
    collapsed = func.regexp_replace(Note.content, r"\s+", " ", "g")
    return func.case(
        (func.char_length(collapsed) <= 150, collapsed),
        else_=func.concat(func.left(collapsed, 149), "…"),
    )


def _keyword_union(
    owner_uuid: uuid.UUID,
    q: str,
    content_type: Literal["all", "conversation", "note"],
):
    ts_q = func.plainto_tsquery("english", q)
    msg_subq = select(Message.conversation_id).where(
        func.to_tsvector("english", Message.content).op("@@")(ts_q)
    )
    conv_match = literal_column("search_vector").op("@@")(ts_q)
    msg_rank_sub = (
        select(
            func.coalesce(
                func.max(func.ts_rank(func.to_tsvector("english", Message.content), ts_q)),
                0.0,
            )
        )
        .where(Message.conversation_id == Conversation.id)
        .correlate(Conversation)
        .scalar_subquery()
    )
    rank_conv = func.greatest(
        func.ts_rank(literal_column("search_vector"), ts_q),
        msg_rank_sub,
    )
    msg_count_sq = (
        select(func.count(Message.id))
        .where(Message.conversation_id == Conversation.id)
        .correlate(Conversation)
        .scalar_subquery()
    )

    note_doc = func.concat(
        func.coalesce(Note.title, ""),
        " ",
        func.coalesce(Note.content, ""),
        " ",
        func.coalesce(func.array_to_string(Note.tags, " "), ""),
    )
    note_ts = func.to_tsvector("english", note_doc)
    note_match = note_ts.op("@@")(ts_q)
    note_rank = func.ts_rank(note_ts, ts_q)

    stmt_conv = select(
        literal("conversation").label("result_kind"),
        Conversation.id.label("result_id"),
        Conversation.title,
        Conversation.tags,
        Conversation.updated_at,
        Conversation.is_pinned,
        Conversation.visibility,
        Conversation.model,
        cast(Conversation.replay_count, BigInteger).label("replay_count"),
        cast(msg_count_sq, Integer).label("message_count"),
        cast(literal(None), Text).label("content_preview"),
        rank_conv.label("score"),
    ).where(
        Conversation.owner_id == owner_uuid,
        or_(conv_match, Conversation.id.in_(msg_subq)),
    )

    stmt_note = select(
        literal("note").label("result_kind"),
        Note.id.label("result_id"),
        Note.title,
        Note.tags,
        Note.updated_at,
        Note.is_pinned,
        Note.visibility,
        cast(literal(None), String).label("model"),
        cast(literal(None), BigInteger).label("replay_count"),
        cast(literal(None), Integer).label("message_count"),
        cast(_note_preview_expr(), Text).label("content_preview"),
        note_rank.label("score"),
    ).where(Note.owner_id == owner_uuid, note_match)

    if content_type == "conversation":
        return stmt_conv.subquery("kw")
    if content_type == "note":
        return stmt_note.subquery("kw")
    return union_all(stmt_conv, stmt_note).subquery("kw")


def _semantic_union(
    owner_uuid: uuid.UUID,
    query_embedding: list[float],
    content_type: Literal["all", "conversation", "note"],
):
    similarity_conv = (1 - Conversation.embedding.cosine_distance(query_embedding)).label("score")
    similarity_note = (1 - Note.embedding.cosine_distance(query_embedding)).label("score")

    msg_count_sq = (
        select(func.count(Message.id))
        .where(Message.conversation_id == Conversation.id)
        .correlate(Conversation)
        .scalar_subquery()
    )

    stmt_conv = select(
        literal("conversation").label("result_kind"),
        Conversation.id.label("result_id"),
        Conversation.title,
        Conversation.tags,
        Conversation.updated_at,
        Conversation.is_pinned,
        Conversation.visibility,
        Conversation.model,
        cast(Conversation.replay_count, BigInteger).label("replay_count"),
        cast(msg_count_sq, Integer).label("message_count"),
        cast(literal(None), Text).label("content_preview"),
        similarity_conv,
    ).where(
        Conversation.owner_id == owner_uuid,
        Conversation.embedding.isnot(None),
    )

    stmt_note = select(
        literal("note").label("result_kind"),
        Note.id.label("result_id"),
        Note.title,
        Note.tags,
        Note.updated_at,
        Note.is_pinned,
        Note.visibility,
        cast(literal(None), String).label("model"),
        cast(literal(None), BigInteger).label("replay_count"),
        cast(literal(None), Integer).label("message_count"),
        cast(_note_preview_expr(), Text).label("content_preview"),
        similarity_note,
    ).where(Note.owner_id == owner_uuid, Note.embedding.isnot(None))

    if content_type == "conversation":
        return stmt_conv.subquery("sem")
    if content_type == "note":
        return stmt_note.subquery("sem")
    return union_all(stmt_conv, stmt_note).subquery("sem")


@router.get("", response_model=list[UnifiedSearchItem])
async def unified_search(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    q: str = Query("", max_length=2000),
    search_mode: Literal["keyword", "semantic"] = Query(
        default="keyword",
        description="Keyword (full-text) or semantic (embedding similarity)",
    ),
    content_type: Literal["all", "conversation", "note"] = Query(
        default="all",
        alias="type",
        description="Search conversations, notes, or both",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[UnifiedSearchItem]:
    """
    Search the current user's conversations and notes in one ranked list.

    Keyword mode uses PostgreSQL full-text search (conversation title/tags/messages; note title/content/tags).
    Semantic mode ranks by embedding cosine similarity when rows have embeddings (requires OPENAI_API_KEY).
    """
    owner_uuid = uuid.UUID(current_user.sub)
    q_norm = q.strip()
    if not q_norm:
        return []

    if search_mode == "semantic":
        if not has_openai_key():
            raise HTTPException(
                status_code=503,
                detail="Semantic search requires OPENAI_API_KEY to be configured",
            )
        query_embedding = await embed_text(q_norm)
        if query_embedding is None:
            raise HTTPException(status_code=503, detail="Failed to generate search embedding")

        sq = _semantic_union(owner_uuid, query_embedding, content_type)
        stmt = (
            select(sq)
            .order_by(sq.c.is_pinned.desc(), sq.c.score.desc().nulls_last(), sq.c.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
    else:
        sq = _keyword_union(owner_uuid, q_norm, content_type)
        stmt = (
            select(sq)
            .order_by(sq.c.is_pinned.desc(), sq.c.score.desc().nulls_last(), sq.c.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )

    result = await db.execute(stmt)
    rows = result.all()

    conv_ids: list[uuid.UUID] = []
    items: list[UnifiedSearchItem] = []
    for row in rows:
        m = row._mapping
        kind = m["result_kind"]
        rid = m["result_id"]
        score_val = m["score"]
        score_out = round(float(score_val), 4) if score_val is not None else None
        if kind == "conversation":
            conv_ids.append(rid)
            rc = m["replay_count"]
            items.append(
                UnifiedSearchItem(
                    type="conversation",
                    id=str(rid),
                    title=m["title"],
                    tags=list(m["tags"] or []),
                    updated_at=m["updated_at"].isoformat(),
                    is_pinned=bool(m["is_pinned"]),
                    visibility=str(m["visibility"]),
                    score=score_out,
                    message_count=int(m["message_count"] or 0),
                    model=m["model"],
                    replay_count=int(rc) if rc is not None else None,
                    content_preview=None,
                    collection_ids=[],
                )
            )
        else:
            items.append(
                UnifiedSearchItem(
                    type="note",
                    id=str(rid),
                    title=m["title"],
                    tags=list(m["tags"] or []),
                    updated_at=m["updated_at"].isoformat(),
                    is_pinned=bool(m["is_pinned"]),
                    visibility=str(m["visibility"]),
                    score=score_out,
                    message_count=None,
                    model=None,
                    replay_count=None,
                    content_preview=m["content_preview"],
                    collection_ids=[],
                )
            )

    if conv_ids:
        cc_result = await db.execute(
            select(ConversationCollection.conversation_id, ConversationCollection.collection_id).where(
                ConversationCollection.conversation_id.in_(conv_ids)
            )
        )
        cmap: dict[uuid.UUID, list[str]] = {cid: [] for cid in conv_ids}
        for conv_id, col_id in cc_result.all():
            cmap[conv_id].append(str(col_id))
        for it in items:
            if it.type == "conversation":
                uid = uuid.UUID(it.id)
                it.collection_ids = cmap.get(uid, [])

    return items
