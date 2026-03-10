import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import CurrentUser
from app.database import get_db
from app.models import Conversation, Message, MessageRole, Visibility

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
    created_at: str


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
        .options(selectinload(Conversation.messages))
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
        created_at=conversation.created_at.isoformat(),
    )


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
