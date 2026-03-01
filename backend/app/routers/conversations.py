import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser
from app.database import get_db
from app.models import Conversation, Message, MessageRole, Visibility

router = APIRouter(prefix="/conversations", tags=["conversations"])


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
