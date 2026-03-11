import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import CurrentUser
from app.database import get_db
from app.models import Collection, Conversation, ConversationCollection, Message, Visibility

router = APIRouter(prefix="/collections", tags=["collections"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class CreateCollectionRequest(BaseModel):
    name: str
    visibility: str = "private"


class CollectionResponse(BaseModel):
    id: str
    name: str
    visibility: str
    created_at: str


class AddToCollectionRequest(BaseModel):
    conversation_id: str


class UpdateCollectionRequest(BaseModel):
    name: str | None = None
    visibility: str | None = None


class PublicCollectionConversationItem(BaseModel):
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


class PublicCollectionDetailResponse(BaseModel):
    id: str
    name: str
    created_at: str
    author_name: str
    author_avatar: str | None
    conversations: list[PublicCollectionConversationItem]


def _parse_uuid(value: str, name: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {name}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=list[CollectionResponse])
async def list_collections(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[CollectionResponse]:
    """List all collections owned by the authenticated user."""
    owner_uuid = uuid.UUID(current_user.sub)
    result = await db.execute(
        select(Collection)
        .where(Collection.owner_id == owner_uuid)
        .order_by(Collection.created_at.desc())
    )
    collections = result.scalars().all()
    return [
        CollectionResponse(
            id=str(c.id),
            name=c.name,
            visibility=c.visibility,
            created_at=c.created_at.isoformat(),
        )
        for c in collections
    ]


@router.post("", response_model=CollectionResponse, status_code=201)
async def create_collection(
    body: CreateCollectionRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> CollectionResponse:
    """Create a new collection. Name is required; visibility defaults to private."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Collection name is required")

    try:
        visibility = Visibility(body.visibility)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="visibility must be 'public' or 'private'",
        )

    collection = Collection(
        owner_id=uuid.UUID(current_user.sub),
        name=name,
        visibility=visibility,
    )
    db.add(collection)
    await db.commit()
    await db.refresh(collection)

    return CollectionResponse(
        id=str(collection.id),
        name=collection.name,
        visibility=collection.visibility,
        created_at=collection.created_at.isoformat(),
    )


@router.get("/{collection_id}/public", response_model=PublicCollectionDetailResponse)
async def get_public_collection(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
) -> PublicCollectionDetailResponse:
    """Return a collection that is marked public and its public conversations. No authentication required.
    Returns 403 if the collection exists but is private."""
    col_uuid = _parse_uuid(collection_id, "collection_id")
    result = await db.execute(
        select(Collection).where(Collection.id == col_uuid).options(selectinload(Collection.owner))
    )
    col = result.scalar_one_or_none()
    if col is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    if col.visibility != Visibility.public:
        raise HTTPException(status_code=403, detail="This collection is private")

    msg_count_sq = (
        select(func.count(Message.id))
        .where(Message.conversation_id == Conversation.id)
        .correlate(Conversation)
        .scalar_subquery()
    )
    stmt = (
        select(Conversation, msg_count_sq.label("message_count"))
        .join(ConversationCollection, ConversationCollection.conversation_id == Conversation.id)
        .where(
            ConversationCollection.collection_id == col_uuid,
            Conversation.visibility == Visibility.public,
        )
        .options(selectinload(Conversation.owner))
        .order_by(Conversation.updated_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    conversations = [
        PublicCollectionConversationItem(
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

    return PublicCollectionDetailResponse(
        id=str(col.id),
        name=col.name,
        created_at=col.created_at.isoformat(),
        author_name=col.owner.display_name,
        author_avatar=col.owner.avatar_url,
        conversations=conversations,
    )


@router.get("/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> CollectionResponse:
    """Get a single collection by id. Returns 404 if not found or not owned by user."""
    col_uuid = _parse_uuid(collection_id, "collection_id")
    owner_uuid = uuid.UUID(current_user.sub)
    result = await db.execute(
        select(Collection).where(Collection.id == col_uuid, Collection.owner_id == owner_uuid)
    )
    c = result.scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return CollectionResponse(
        id=str(c.id),
        name=c.name,
        visibility=c.visibility,
        created_at=c.created_at.isoformat(),
    )


@router.patch("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: str,
    body: UpdateCollectionRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> CollectionResponse:
    """Update collection name and/or visibility. User must own the collection."""
    col_uuid = _parse_uuid(collection_id, "collection_id")
    owner_uuid = uuid.UUID(current_user.sub)
    result = await db.execute(
        select(Collection).where(Collection.id == col_uuid, Collection.owner_id == owner_uuid)
    )
    c = result.scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    if body.name is not None:
        name = body.name.strip()
        if name:
            c.name = name
    if body.visibility is not None:
        try:
            c.visibility = Visibility(body.visibility)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="visibility must be 'public' or 'private'",
            )

    await db.commit()
    await db.refresh(c)
    return CollectionResponse(
        id=str(c.id),
        name=c.name,
        visibility=c.visibility,
        created_at=c.created_at.isoformat(),
    )


@router.post("/{collection_id}/conversations", status_code=204)
async def add_conversation_to_collection(
    collection_id: str,
    body: AddToCollectionRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Add a conversation to a collection. User must own both the collection and the conversation."""
    col_uuid = _parse_uuid(collection_id, "collection_id")
    conv_uuid = _parse_uuid(body.conversation_id, "conversation_id")
    owner_uuid = uuid.UUID(current_user.sub)

    col_result = await db.execute(
        select(Collection).where(Collection.id == col_uuid, Collection.owner_id == owner_uuid)
    )
    if col_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conv_uuid, Conversation.owner_id == owner_uuid)
    )
    if conv_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    existing = await db.execute(
        select(ConversationCollection).where(
            ConversationCollection.collection_id == col_uuid,
            ConversationCollection.conversation_id == conv_uuid,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return  # already in collection, idempotent

    link = ConversationCollection(collection_id=col_uuid, conversation_id=conv_uuid)
    db.add(link)
    await db.commit()


@router.delete("/{collection_id}/conversations/{conversation_id}", status_code=204)
async def remove_conversation_from_collection(
    collection_id: str,
    conversation_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a conversation from a collection. User must own the collection."""
    col_uuid = _parse_uuid(collection_id, "collection_id")
    conv_uuid = _parse_uuid(conversation_id, "conversation_id")
    owner_uuid = uuid.UUID(current_user.sub)

    col_result = await db.execute(
        select(Collection).where(Collection.id == col_uuid, Collection.owner_id == owner_uuid)
    )
    if col_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    result = await db.execute(
        select(ConversationCollection).where(
            ConversationCollection.collection_id == col_uuid,
            ConversationCollection.conversation_id == conv_uuid,
        )
    )
    link = result.scalar_one_or_none()
    if link is not None:
        await db.delete(link)
        await db.commit()
