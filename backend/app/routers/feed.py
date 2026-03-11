import math

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Conversation, Message, Visibility

router = APIRouter(prefix="/feed", tags=["feed"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class FeedItem(BaseModel):
    id: str
    title: str
    tags: list[str]
    model: str
    message_count: int
    replay_count: int
    created_at: str
    updated_at: str
    author_name: str
    author_avatar: str | None


class FeedResponse(BaseModel):
    items: list[FeedItem]
    total: int
    page: int
    per_page: int
    pages: int


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("", response_model=FeedResponse)
async def get_feed(
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> FeedResponse:
    """Return a paginated list of all public conversations. No authentication required."""
    offset = (page - 1) * per_page

    total_result = await db.execute(
        select(func.count()).where(Conversation.visibility == Visibility.public)
    )
    total: int = total_result.scalar_one()

    msg_count_sq = (
        select(func.count(Message.id))
        .where(Message.conversation_id == Conversation.id)
        .correlate(Conversation)
        .scalar_subquery()
    )

    stmt = (
        select(Conversation, msg_count_sq.label("message_count"))
        .where(Conversation.visibility == Visibility.public)
        .options(selectinload(Conversation.owner))
        .order_by(Conversation.updated_at.desc())
        .limit(per_page)
        .offset(offset)
    )

    rows = (await db.execute(stmt)).all()

    items = [
        FeedItem(
            id=str(conv.id),
            title=conv.title,
            tags=conv.tags or [],
            model=conv.model,
            message_count=msg_count,
            replay_count=conv.replay_count,
            created_at=conv.created_at.isoformat(),
            updated_at=conv.updated_at.isoformat(),
            author_name=conv.owner.display_name,
            author_avatar=conv.owner.avatar_url,
        )
        for conv, msg_count in rows
    ]

    pages = math.ceil(total / per_page) if total > 0 else 1

    return FeedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )
