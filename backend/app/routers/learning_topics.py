import math
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import CurrentUser
from app.database import get_db
from app.limits import PRO_LEARNING_TOPIC_LIMIT, STARTER_LEARNING_TOPIC_LIMIT
from app.models import (
    Conversation,
    LearningTopic,
    LearningTopicConversation,
    Message,
    MessageRole,
    User,
    UserRole,
    Visibility,
)

router = APIRouter(prefix="/learning-topics", tags=["learning-topics"])


class LearningTopicListItem(BaseModel):
    id: str
    title: str
    description: str | None
    visibility: str
    conversation_count: int
    created_at: str
    updated_at: str
    is_owner: bool = True
    author_name: str | None = None
    author_avatar: str | None = None


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
    visibility: str
    created_at: str
    updated_at: str
    conversations: list[LearningTopicConversationItem]


class CreateLearningTopicRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=32_000)
    visibility: str = "private"


class UpdateLearningTopicRequest(BaseModel):
    visibility: str | None = None


class PublicLearningTopicConversationItem(BaseModel):
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


class PublicLearningTopicDetailResponse(BaseModel):
    id: str
    title: str
    description: str | None
    created_at: str
    updated_at: str
    author_name: str
    author_avatar: str | None
    conversations: list[PublicLearningTopicConversationItem]


class PublicLearningTopicDiscoveryItem(BaseModel):
    """One public learning topic for unauthenticated discovery (guest feed)."""

    id: str
    title: str
    description: str | None
    conversation_count: int
    created_at: str
    updated_at: str
    author_name: str
    author_avatar: str | None


class PublicLearningTopicDiscoveryResponse(BaseModel):
    items: list[PublicLearningTopicDiscoveryItem]
    total: int
    page: int
    per_page: int
    pages: int


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
        visibility=topic.visibility,
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
    """List learning topics: the user's own (full member counts) plus public topics from others (public conv counts)."""
    owner_uuid = uuid.UUID(current_user.sub)

    all_members_count_sq = (
        select(
            LearningTopicConversation.learning_topic_id.label("ltid"),
            func.count(LearningTopicConversation.conversation_id).label("cnt"),
        )
        .group_by(LearningTopicConversation.learning_topic_id)
        .subquery()
    )

    public_members_count_sq = (
        select(
            LearningTopicConversation.learning_topic_id.label("ltid"),
            func.count(LearningTopicConversation.conversation_id).label("cnt"),
        )
        .select_from(LearningTopicConversation)
        .join(Conversation, Conversation.id == LearningTopicConversation.conversation_id)
        .where(Conversation.visibility == Visibility.public)
        .group_by(LearningTopicConversation.learning_topic_id)
        .subquery()
    )

    own_rows = (
        await db.execute(
            select(
                LearningTopic,
                func.coalesce(all_members_count_sq.c.cnt, 0).label("conversation_count"),
            )
            .outerjoin(all_members_count_sq, all_members_count_sq.c.ltid == LearningTopic.id)
            .where(LearningTopic.owner_id == owner_uuid)
            .order_by(LearningTopic.updated_at.desc())
        )
    ).all()

    out: list[LearningTopicListItem] = [
        LearningTopicListItem(
            id=str(topic.id),
            title=topic.title,
            description=topic.description,
            visibility=topic.visibility,
            conversation_count=int(conversation_count),
            created_at=topic.created_at.isoformat(),
            updated_at=topic.updated_at.isoformat(),
            is_owner=True,
        )
        for topic, conversation_count in own_rows
    ]

    other_result = await db.execute(
        select(
            LearningTopic,
            func.coalesce(public_members_count_sq.c.cnt, 0).label("conversation_count"),
        )
        .outerjoin(public_members_count_sq, public_members_count_sq.c.ltid == LearningTopic.id)
        .where(
            LearningTopic.owner_id != owner_uuid,
            LearningTopic.visibility == Visibility.public,
        )
        .options(selectinload(LearningTopic.owner))
        .order_by(LearningTopic.updated_at.desc())
    )
    other_rows = other_result.unique().all()

    for topic, conversation_count in other_rows:
        out.append(
            LearningTopicListItem(
                id=str(topic.id),
                title=topic.title,
                description=topic.description,
                visibility=topic.visibility,
                conversation_count=int(conversation_count),
                created_at=topic.created_at.isoformat(),
                updated_at=topic.updated_at.isoformat(),
                is_owner=False,
                author_name=topic.owner.display_name,
                author_avatar=topic.owner.avatar_url,
            )
        )

    return out


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

    try:
        visibility = Visibility(body.visibility)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="visibility must be 'public' or 'private'",
        ) from None

    owner_uuid = uuid.UUID(current_user.sub)

    # TOPIC-11: Same role-based cap pattern as conversations (Pro = current total, Starter = lifetime).
    user_result = await db.execute(select(User).where(User.id == owner_uuid))
    user = user_result.scalar_one_or_none()
    if user and user.role != UserRole.administrator:
        if user.role == UserRole.pro:
            count_result = await db.execute(
                select(func.count(LearningTopic.id)).where(LearningTopic.owner_id == owner_uuid)
            )
            current_count = count_result.scalar() or 0
            if current_count >= PRO_LEARNING_TOPIC_LIMIT:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        f"Learning topic limit reached for your plan. You can have up to {PRO_LEARNING_TOPIC_LIMIT} learning topics. "
                        "Delete an existing learning topic to create a new one."
                    ),
                )
        elif user.role == UserRole.starter:
            if (user.lifetime_learning_topics_created or 0) >= STARTER_LEARNING_TOPIC_LIMIT:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        f"Learning topic limit reached for your plan. Starter accounts can create up to {STARTER_LEARNING_TOPIC_LIMIT} learning topics. "
                        "Upgrade to Pro for more learning topics."
                    ),
                )

    topic = LearningTopic(
        owner_id=owner_uuid,
        title=title,
        description=description,
        visibility=visibility,
    )
    db.add(topic)
    await db.flush()

    if user and user.role == UserRole.starter:
        user.lifetime_learning_topics_created = (user.lifetime_learning_topics_created or 0) + 1

    await db.commit()
    await db.refresh(topic)

    return LearningTopicListItem(
        id=str(topic.id),
        title=topic.title,
        description=topic.description,
        visibility=topic.visibility,
        conversation_count=0,
        created_at=topic.created_at.isoformat(),
        updated_at=topic.updated_at.isoformat(),
        is_owner=True,
    )


@router.get("/public", response_model=PublicLearningTopicDiscoveryResponse)
async def list_public_learning_topics(
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> PublicLearningTopicDiscoveryResponse:
    """Paginated list of public learning topics for guests (no authentication)."""
    offset = (page - 1) * per_page

    public_members_count_sq = (
        select(
            LearningTopicConversation.learning_topic_id.label("ltid"),
            func.count(LearningTopicConversation.conversation_id).label("cnt"),
        )
        .select_from(LearningTopicConversation)
        .join(Conversation, Conversation.id == LearningTopicConversation.conversation_id)
        .where(Conversation.visibility == Visibility.public)
        .group_by(LearningTopicConversation.learning_topic_id)
        .subquery()
    )

    base_where = LearningTopic.visibility == Visibility.public

    total_result = await db.execute(select(func.count()).select_from(LearningTopic).where(base_where))
    total: int = total_result.scalar_one()

    rows = (
        await db.execute(
            select(
                LearningTopic,
                func.coalesce(public_members_count_sq.c.cnt, 0).label("conversation_count"),
            )
            .outerjoin(public_members_count_sq, public_members_count_sq.c.ltid == LearningTopic.id)
            .where(base_where)
            .options(selectinload(LearningTopic.owner))
            .order_by(LearningTopic.updated_at.desc())
            .limit(per_page)
            .offset(offset)
        )
    ).unique().all()

    items = [
        PublicLearningTopicDiscoveryItem(
            id=str(topic.id),
            title=topic.title,
            description=topic.description,
            conversation_count=int(conv_count),
            created_at=topic.created_at.isoformat(),
            updated_at=topic.updated_at.isoformat(),
            author_name=topic.owner.display_name,
            author_avatar=topic.owner.avatar_url,
        )
        for topic, conv_count in rows
    ]

    pages = math.ceil(total / per_page) if total > 0 else 1

    return PublicLearningTopicDiscoveryResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get("/{topic_id}/public", response_model=PublicLearningTopicDetailResponse)
async def get_public_learning_topic(
    topic_id: str,
    db: AsyncSession = Depends(get_db),
) -> PublicLearningTopicDetailResponse:
    """Public topic and its public conversations only. No authentication."""
    topic_uuid = _parse_topic_uuid(topic_id)
    result = await db.execute(
        select(LearningTopic).where(LearningTopic.id == topic_uuid).options(selectinload(LearningTopic.owner))
    )
    topic = result.scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="Learning topic not found")
    if topic.visibility != Visibility.public:
        raise HTTPException(status_code=403, detail="This learning topic is private")

    msg_count_sq = (
        select(func.count(Message.id))
        .where(Message.conversation_id == Conversation.id)
        .correlate(Conversation)
        .scalar_subquery()
    )
    stmt = (
        select(Conversation, msg_count_sq.label("message_count"))
        .join(
            LearningTopicConversation,
            LearningTopicConversation.conversation_id == Conversation.id,
        )
        .where(
            LearningTopicConversation.learning_topic_id == topic_uuid,
            Conversation.visibility == Visibility.public,
        )
        .options(selectinload(Conversation.owner))
        .order_by(LearningTopicConversation.position.asc(), Conversation.created_at.asc())
    )
    rows = (await db.execute(stmt)).unique().all()

    conversations = [
        PublicLearningTopicConversationItem(
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

    return PublicLearningTopicDetailResponse(
        id=str(topic.id),
        title=topic.title,
        description=topic.description,
        created_at=topic.created_at.isoformat(),
        updated_at=topic.updated_at.isoformat(),
        author_name=topic.owner.display_name,
        author_avatar=topic.owner.avatar_url,
        conversations=conversations,
    )


@router.get("/{topic_id}/public/replay", response_model=TopicReplayResponse)
async def get_public_learning_topic_replay(
    topic_id: str,
    db: AsyncSession = Depends(get_db),
) -> TopicReplayResponse:
    """Step-through replay for guests: public topic only; user/assistant messages from public conversations in topic order."""
    topic_uuid = _parse_topic_uuid(topic_id)
    topic = (
        await db.execute(select(LearningTopic).where(LearningTopic.id == topic_uuid))
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="Learning topic not found")
    if topic.visibility != Visibility.public:
        raise HTTPException(status_code=403, detail="This learning topic is private")

    stmt = (
        select(Message, Conversation)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .join(
            LearningTopicConversation,
            (LearningTopicConversation.conversation_id == Conversation.id)
            & (LearningTopicConversation.learning_topic_id == topic_uuid),
        )
        .where(Conversation.visibility == Visibility.public)
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
        if msg.role != MessageRole.system
    ]

    return TopicReplayResponse(
        topic_id=str(topic.id),
        topic_title=topic.title,
        total_messages=len(items),
        items=items,
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


@router.patch("/{topic_id}", response_model=LearningTopicListItem)
async def update_learning_topic(
    topic_id: str,
    body: UpdateLearningTopicRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> LearningTopicListItem:
    """Update visibility (and reserved for future fields). Owner only."""
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

    if body.visibility is not None:
        try:
            topic.visibility = Visibility(body.visibility)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="visibility must be 'public' or 'private'",
            ) from None

    await db.commit()
    await db.refresh(topic)

    count_result = await db.execute(
        select(func.count(LearningTopicConversation.conversation_id)).where(
            LearningTopicConversation.learning_topic_id == topic_uuid,
        )
    )
    conversation_count = int(count_result.scalar() or 0)

    return LearningTopicListItem(
        id=str(topic.id),
        title=topic.title,
        description=topic.description,
        visibility=topic.visibility,
        conversation_count=conversation_count,
        created_at=topic.created_at.isoformat(),
        updated_at=topic.updated_at.isoformat(),
        is_owner=True,
    )


@router.get("/{topic_id}/replay", response_model=TopicReplayResponse)
async def get_learning_topic_replay(
    topic_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> TopicReplayResponse:
    """Return user/assistant messages in topic order (no system prompts); conversations by position, then chronological within each."""
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
        if msg.role != MessageRole.system
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
