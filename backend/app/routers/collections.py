import io
import uuid
import zipfile
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import CurrentUser
from app.database import get_db
from app.export_utils import conversation_to_markdown, sanitize_filename
from app.limits import PRO_COLLECTION_LIMIT, STARTER_COLLECTION_LIMIT
from app.models import Collection, Conversation, ConversationCollection, Message, User, UserRole, Visibility

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
    is_owner: bool = True
    author_name: str | None = None
    author_avatar: str | None = None


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
    """List collections for the authenticated user: their own plus public collections from others."""
    owner_uuid = uuid.UUID(current_user.sub)

    # Own collections first, most recent first
    result = await db.execute(
        select(Collection)
        .where(Collection.owner_id == owner_uuid)
        .order_by(Collection.created_at.desc())
    )
    own = result.scalars().all()
    out = [
        CollectionResponse(
            id=str(c.id),
            name=c.name,
            visibility=c.visibility,
            created_at=c.created_at.isoformat(),
            is_owner=True,
        )
        for c in own
    ]

    # Public collections from other users (for discovery in library)
    other_result = await db.execute(
        select(Collection)
        .where(
            Collection.owner_id != owner_uuid,
            Collection.visibility == Visibility.public,
        )
        .options(selectinload(Collection.owner))
        .order_by(Collection.created_at.desc())
    )
    other_public = other_result.unique().scalars().all()
    for c in other_public:
        out.append(
            CollectionResponse(
                id=str(c.id),
                name=c.name,
                visibility=c.visibility,
                created_at=c.created_at.isoformat(),
                is_owner=False,
                author_name=c.owner.display_name,
                author_avatar=c.owner.avatar_url,
            )
        )
    return out


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

    # AUTHZ-09 / AUTHZ-10 / AUTHZ-11: Enforce collection limits by role.
    owner_uuid = uuid.UUID(current_user.sub)
    user_result = await db.execute(select(User).where(User.id == owner_uuid))
    user = user_result.scalar_one_or_none()
    if user and user.role != UserRole.administrator:
        # AUTHZ-11: Explicit bypass — administrators are never subject to collection limits.
        if user.role == UserRole.pro:
            count_result = await db.execute(
                select(func.count(Collection.id)).where(Collection.owner_id == owner_uuid)
            )
            current_count = count_result.scalar() or 0
            if current_count >= PRO_COLLECTION_LIMIT:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        f"Collection limit reached for your plan. You can have up to {PRO_COLLECTION_LIMIT} collections. "
                        "Delete an existing collection to create a new one."
                    ),
                )
        elif user.role == UserRole.starter:
            if (user.lifetime_collections_created or 0) >= STARTER_COLLECTION_LIMIT:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        f"Collection limit reached for your plan. Starter accounts can create up to {STARTER_COLLECTION_LIMIT} collections. "
                        "Upgrade to Pro for more collections."
                    ),
                )

    collection = Collection(
        owner_id=owner_uuid,
        name=name,
        visibility=visibility,
    )
    db.add(collection)
    await db.flush()

    # AUTHZ-10: Increment lifetime count for Starter users (never decremented on delete).
    if user and user.role == UserRole.starter:
        user.lifetime_collections_created = (user.lifetime_collections_created or 0) + 1

    await db.commit()
    await db.refresh(collection)

    return CollectionResponse(
        id=str(collection.id),
        name=collection.name,
        visibility=collection.visibility,
        created_at=collection.created_at.isoformat(),
        is_owner=True,
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
        is_owner=True,
    )


@router.get("/{collection_id}/export", response_class=Response)
async def export_collection(
    collection_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    format: Literal["md", "zip"] = Query(default="md", description="Export as single Markdown or ZIP of .md files"),
) -> Response:
    """Export a collection as Markdown (single file) or ZIP (one .md per conversation). User must own the collection."""
    col_uuid = _parse_uuid(collection_id, "collection_id")
    owner_uuid = uuid.UUID(current_user.sub)
    col_result = await db.execute(
        select(Collection).where(Collection.id == col_uuid, Collection.owner_id == owner_uuid)
    )
    col = col_result.scalar_one_or_none()
    if col is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    conv_result = await db.execute(
        select(Conversation)
        .join(ConversationCollection, ConversationCollection.conversation_id == Conversation.id)
        .where(ConversationCollection.collection_id == col_uuid)
        .options(selectinload(Conversation.messages))
        .order_by(Conversation.updated_at.desc())
    )
    conversations = list(conv_result.scalars().unique().all())

    if format == "md":
        lines = [
            f"# Collection: {col.name}",
            "",
            f"- **Conversations:** {len(conversations)}",
            f"- **Collection created:** {col.created_at.isoformat()}",
            "",
            "---",
            "",
        ]
        for conv in conversations:
            lines.append(f"## Conversation: {conv.title}")
            lines.append("")
            lines.append(conversation_to_markdown(conv))
            lines.append("")
            lines.append("---")
            lines.append("")
        body = "\n".join(lines).strip() + "\n"
        filename = sanitize_filename(col.name) + ".md"
        return PlainTextResponse(
            content=body,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # format == "zip"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        seen_names: set[str] = set()
        for conv in conversations:
            base = sanitize_filename(conv.title)
            name = f"{base}.md"
            if name in seen_names:
                name = f"{base}_{str(conv.id)[:8]}.md"
            seen_names.add(name)
            zf.writestr(name, conversation_to_markdown(conv))
    buf.seek(0)
    filename = sanitize_filename(col.name) + ".zip"
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
        is_owner=True,
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
