import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser
from app.database import get_db
from app.models import Conversation, LearningTopic, LearningTopicConversation

router = APIRouter(prefix="/learning-topics", tags=["learning-topics"])


class LearningTopicListItem(BaseModel):
    id: str
    title: str
    description: str | None
    conversation_count: int
    created_at: str
    updated_at: str


class LearningTopicConversationItem(BaseModel):
    conversation_id: str
    position: int
    title: str
    model: str
    tags: list[str]
    replay_count: int
    created_at: str
    updated_at: str


class LearningTopicDetailResponse(BaseModel):
    id: str
    title: str
    description: str | None
    created_at: str
    updated_at: str
    conversations: list[LearningTopicConversationItem]


class CreateLearningTopicRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=32_000)


class AddConversationToTopicRequest(BaseModel):
    conversation_id: str = Field(..., min_length=1)


def _parse_topic_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=404, detail="Learning topic not found")


def _parse_conversation_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=404, detail="Conversation not found")


async def _topic_detail_response(
    db: AsyncSession,
    topic_uuid: uuid.UUID,
    owner_uuid: uuid.UUID,
) -> LearningTopicDetailResponse | None:
    topic = (
        await db.execute(
            select(LearningTopic).where(
                LearningTopic.id == topic_uuid,
                LearningTopic.owner_id == owner_uuid,
            )
        )
    ).scalar_one_or_none()
    if topic is None:
        return None

    membership_rows = (
        await db.execute(
            select(LearningTopicConversation, Conversation)
            .join(
                Conversation,
                Conversation.id == LearningTopicConversation.conversation_id,
            )
            .where(LearningTopicConversation.learning_topic_id == topic_uuid)
            .order_by(
                LearningTopicConversation.position.asc(),
                Conversation.created_at.asc(),
            )
        )
    ).all()

    return LearningTopicDetailResponse(
        id=str(topic.id),
        title=topic.title,
        description=topic.description,
        created_at=topic.created_at.isoformat(),
        updated_at=topic.updated_at.isoformat(),
        conversations=[
            LearningTopicConversationItem(
                conversation_id=str(conversation.id),
                position=membership.position,
                title=conversation.title,
                model=conversation.model,
                tags=conversation.tags or [],
                replay_count=conversation.replay_count,
                created_at=conversation.created_at.isoformat(),
                updated_at=conversation.updated_at.isoformat(),
            )
            for membership, conversation in membership_rows
        ],
    )


@router.get("", response_model=list[LearningTopicListItem])
async def list_learning_topics(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[LearningTopicListItem]:
    owner_uuid = uuid.UUID(current_user.sub)

    count_subquery = (
        select(
            LearningTopicConversation.learning_topic_id.label("learning_topic_id"),
            func.count(LearningTopicConversation.conversation_id).label("conversation_count"),
        )
        .group_by(LearningTopicConversation.learning_topic_id)
        .subquery()
    )

    rows = (
        await db.execute(
            select(
                LearningTopic,
                func.coalesce(count_subquery.c.conversation_count, 0).label("conversation_count"),
            )
            .outerjoin(
                count_subquery,
                count_subquery.c.learning_topic_id == LearningTopic.id,
            )
            .where(LearningTopic.owner_id == owner_uuid)
            .order_by(LearningTopic.updated_at.desc())
        )
    ).all()

    return [
        LearningTopicListItem(
            id=str(topic.id),
            title=topic.title,
            description=topic.description,
            conversation_count=conversation_count,
            created_at=topic.created_at.isoformat(),
            updated_at=topic.updated_at.isoformat(),
        )
        for topic, conversation_count in rows
    ]


@router.post("", response_model=LearningTopicListItem, status_code=201)
async def create_learning_topic(
    body: CreateLearningTopicRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LearningTopicListItem:
    """Create a learning topic with a required title and optional description."""
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if len(title) > 256:
        raise HTTPException(status_code=400, detail="Title must be at most 256 characters")

    description: str | None = None
    if body.description is not None:
        stripped = body.description.strip()
        description = stripped if stripped else None

    owner_uuid = uuid.UUID(current_user.sub)
    topic = LearningTopic(
        owner_id=owner_uuid,
        title=title,
        description=description,
    )
    db.add(topic)
    await db.commit()
    await db.refresh(topic)

    return LearningTopicListItem(
        id=str(topic.id),
        title=topic.title,
        description=topic.description,
        conversation_count=0,
        created_at=topic.created_at.isoformat(),
        updated_at=topic.updated_at.isoformat(),
    )


@router.get("/{topic_id}", response_model=LearningTopicDetailResponse)
async def get_learning_topic(
    topic_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LearningTopicDetailResponse:
    owner_uuid = uuid.UUID(current_user.sub)
    topic_uuid = _parse_topic_uuid(topic_id)

    detail = await _topic_detail_response(db, topic_uuid, owner_uuid)
    if detail is None:
        raise HTTPException(status_code=404, detail="Learning topic not found")
    return detail


@router.post("/{topic_id}/conversations", response_model=LearningTopicDetailResponse, status_code=201)
async def add_conversation_to_learning_topic(
    topic_id: str,
    body: AddConversationToTopicRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LearningTopicDetailResponse:
    """Add a saved conversation to a topic. Appends to the end of the ordered list. Duplicate membership returns 409."""
    owner_uuid = uuid.UUID(current_user.sub)
    topic_uuid = _parse_topic_uuid(topic_id)
    conv_uuid = _parse_conversation_uuid(body.conversation_id.strip())

    topic = (
        await db.execute(
            select(LearningTopic).where(
                LearningTopic.id == topic_uuid,
                LearningTopic.owner_id == owner_uuid,
            )
        )
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="Learning topic not found")

    conv = (
        await db.execute(
            select(Conversation).where(
                Conversation.id == conv_uuid,
                Conversation.owner_id == owner_uuid,
            )
        )
    ).scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    existing = (
        await db.execute(
            select(LearningTopicConversation).where(
                LearningTopicConversation.learning_topic_id == topic_uuid,
                LearningTopicConversation.conversation_id == conv_uuid,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="This conversation is already in the topic",
        )

    max_pos_result = await db.execute(
        select(func.max(LearningTopicConversation.position)).where(
            LearningTopicConversation.learning_topic_id == topic_uuid
        )
    )
    max_pos = max_pos_result.scalar_one()
    next_position = (max_pos if max_pos is not None else -1) + 1

    topic.updated_at = datetime.now(timezone.utc)
    link = LearningTopicConversation(
        learning_topic_id=topic_uuid,
        conversation_id=conv_uuid,
        position=next_position,
    )
    db.add(link)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This conversation is already in the topic",
        ) from None

    detail = await _topic_detail_response(db, topic_uuid, owner_uuid)
    if detail is None:
        raise HTTPException(status_code=404, detail="Learning topic not found")
    return detail


@router.delete("/{topic_id}/conversations/{conversation_id}", response_model=LearningTopicDetailResponse)
async def remove_conversation_from_learning_topic(
    topic_id: str,
    conversation_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LearningTopicDetailResponse:
    """Remove a conversation from a topic. Remaining memberships are renumbered 0..n-1 in stable order. The conversation row is not deleted."""
    owner_uuid = uuid.UUID(current_user.sub)
    topic_uuid = _parse_topic_uuid(topic_id)
    conv_uuid = _parse_conversation_uuid(conversation_id)

    topic = (
        await db.execute(
            select(LearningTopic).where(
                LearningTopic.id == topic_uuid,
                LearningTopic.owner_id == owner_uuid,
            )
        )
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="Learning topic not found")

    result = await db.execute(
        select(LearningTopicConversation).where(
            LearningTopicConversation.learning_topic_id == topic_uuid,
            LearningTopicConversation.conversation_id == conv_uuid,
        )
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Conversation is not in this topic")

    await db.delete(link)
    await db.flush()

    remaining = (
        await db.execute(
            select(LearningTopicConversation, Conversation)
            .join(
                Conversation,
                Conversation.id == LearningTopicConversation.conversation_id,
            )
            .where(LearningTopicConversation.learning_topic_id == topic_uuid)
            .order_by(
                LearningTopicConversation.position.asc(),
                Conversation.created_at.asc(),
            )
        )
    ).all()

    for new_pos, (membership, _) in enumerate(remaining):
        membership.position = new_pos

    topic.updated_at = datetime.now(timezone.utc)
    await db.commit()

    detail = await _topic_detail_response(db, topic_uuid, owner_uuid)
    if detail is None:
        raise HTTPException(status_code=404, detail="Learning topic not found")
    return detail


@router.delete("/{topic_id}", status_code=204)
async def delete_learning_topic(
    topic_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a learning topic and its conversation memberships. Conversations are not deleted."""
    owner_uuid = uuid.UUID(current_user.sub)
    topic_uuid = _parse_topic_uuid(topic_id)

    topic = (
        await db.execute(
            select(LearningTopic).where(
                LearningTopic.id == topic_uuid,
                LearningTopic.owner_id == owner_uuid,
            )
        )
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="Learning topic not found")

    await db.delete(topic)
    await db.commit()
