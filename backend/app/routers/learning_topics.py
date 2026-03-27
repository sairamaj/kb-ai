import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser
from app.database import get_db
from app.models import Conversation, LearningTopic, LearningTopicConversation, Message

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


class ReorderLearningTopicConversationsRequest(BaseModel):
    """Full ordered list of conversation IDs currently in the topic. Must match membership exactly (permutation)."""

    conversation_ids: list[str] = Field(default_factory=list)


class TopicReplayMessagePayload(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


class TopicReplayEntry(BaseModel):
    conversation_id: str
    conversation_title: str
    message: TopicReplayMessagePayload


class TopicReplayResponse(BaseModel):
    topic_id: str
    topic_title: str
    total_messages: int
    items: list[TopicReplayEntry]


class TopicReplayMemberReplayCount(BaseModel):
    conversation_id: str
    replay_count: int


class TopicReplayIncrementResponse(BaseModel):
    conversation_replay_counts: list[TopicReplayMemberReplayCount]


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


def _parse_conversation_uuid_reorder(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value.strip())
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="Invalid conversation id in conversation_ids",
        ) from None


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


@router.get("/{topic_id}/replay", response_model=TopicReplayResponse)
async def get_learning_topic_replay(
    topic_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> TopicReplayResponse:
    """Return all messages in topic order: conversations by position, then chronological within each."""
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

    stmt = (
        select(Message, Conversation)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .join(
            LearningTopicConversation,
            (LearningTopicConversation.conversation_id == Conversation.id)
            & (LearningTopicConversation.learning_topic_id == topic_uuid),
        )
        .order_by(LearningTopicConversation.position.asc(), Message.created_at.asc())
    )
    rows = (await db.execute(stmt)).all()

    items = [
        TopicReplayEntry(
            conversation_id=str(conv.id),
            conversation_title=conv.title,
            message=TopicReplayMessagePayload(
                id=str(msg.id),
                role=str(msg.role),
                content=msg.content,
                created_at=msg.created_at.isoformat(),
            ),
        )
        for msg, conv in rows
    ]

    return TopicReplayResponse(
        topic_id=str(topic.id),
        topic_title=topic.title,
        total_messages=len(items),
        items=items,
    )


@router.post("/{topic_id}/replay", response_model=TopicReplayIncrementResponse)
async def increment_learning_topic_replay_counts(
    topic_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> TopicReplayIncrementResponse:
    """Increment replay_count on each conversation in the topic once (when starting topic replay)."""
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

    result = await db.execute(
        select(Conversation)
        .join(
            LearningTopicConversation,
            LearningTopicConversation.conversation_id == Conversation.id,
        )
        .where(LearningTopicConversation.learning_topic_id == topic_uuid)
    )
    conversations = result.scalars().all()

    counts: list[TopicReplayMemberReplayCount] = []
    for conv in conversations:
        conv.replay_count = (conv.replay_count or 0) + 1
        counts.append(
            TopicReplayMemberReplayCount(
                conversation_id=str(conv.id),
                replay_count=conv.replay_count,
            )
        )

    await db.commit()

    return TopicReplayIncrementResponse(conversation_replay_counts=counts)


@router.patch("/{topic_id}/order", response_model=LearningTopicDetailResponse)
async def reorder_learning_topic_conversations(
    topic_id: str,
    body: ReorderLearningTopicConversationsRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LearningTopicDetailResponse:
    """Persist a new order for conversations in the topic. Payload must list every member exactly once."""
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

    membership_rows = (
        await db.execute(
            select(LearningTopicConversation).where(
                LearningTopicConversation.learning_topic_id == topic_uuid,
            )
        )
    ).scalars().all()

    current_ids = {str(m.conversation_id) for m in membership_rows}

    parsed_ids: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    for raw in body.conversation_ids:
        cid = _parse_conversation_uuid_reorder(raw)
        if cid in seen:
            raise HTTPException(
                status_code=422,
                detail="conversation_ids contains duplicates",
            )
        seen.add(cid)
        parsed_ids.append(cid)

    if len(parsed_ids) != len(current_ids):
        raise HTTPException(
            status_code=422,
            detail="conversation_ids must include each conversation in the topic exactly once",
        )
    if set(str(x) for x in parsed_ids) != current_ids:
        raise HTTPException(
            status_code=422,
            detail="conversation_ids must match the conversations in this topic",
        )

    links_by_conv = {m.conversation_id: m for m in membership_rows}
    for new_pos, conv_id in enumerate(parsed_ids):
        links_by_conv[conv_id].position = new_pos

    topic.updated_at = datetime.now(timezone.utc)
    await db.commit()

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
