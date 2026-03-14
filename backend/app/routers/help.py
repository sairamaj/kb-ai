"""
Help chatbot API (CB-02).

Provides a dedicated endpoint for the in-app help bot. Uses the help knowledge
source (CB-01); does not create or modify conversations, collections, or user data.
Authentication is optional: unauthenticated requests receive generic answers only.

CB-03: Answers are grounded in the help knowledge; the bot does not invent
features, limits, or procedures. Role names and limit semantics match the docs.

CB-04: Out-of-scope questions receive a polite redirect; the bot does not answer
off-topic questions or expose internal paths or technical details in redirects.

CB-05: For authenticated requests, inject role and usage (conversation/collection
counts) so the bot can personalize answers (e.g. "With your Starter plan you
currently have 3 of 5 conversations"). No PII or internal identifiers in the prompt.
"""

import uuid
from dataclasses import dataclass
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import OptionalUser
from app import config as app_config
from app.database import get_db
from app.help_knowledge import get_help_knowledge
from app.limits import (
    PRO_COLLECTION_LIMIT,
    PRO_CONVERSATION_LIMIT,
    STARTER_COLLECTION_LIMIT,
    STARTER_CONVERSATION_LIMIT,
)
from app.models import Collection, Conversation, User, UserRole
from app.openai_client import get_openai_client

router = APIRouter(prefix="/help", tags=["help"])


@dataclass(frozen=True)
class HelpUserContext:
    """
    CB-05: Role and non-sensitive usage for personalizing help answers.
    Only these fields are passed to the model; no user id, email, or secrets.
    """

    role: str  # "administrator" | "pro" | "starter" (value for display: Administrator, Pro, Starter)
    conversations_used: int
    conversations_limit: int | None  # None for administrator (unlimited)
    collections_used: int
    collections_limit: int | None


async def get_help_user_context(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> HelpUserContext | None:
    """
    CB-05: Load the user's role and usage (conversation/collection counts) for help personalization.
    Returns None if the user is not found. Uses same semantics as auth /me (Pro = current total,
    Starter = lifetime created, Administrator = unlimited).
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return None
    if user.role == UserRole.administrator:
        return HelpUserContext(
            role=user.role.value,
            conversations_used=0,
            conversations_limit=None,
            collections_used=0,
            collections_limit=None,
        )
    if user.role == UserRole.pro:
        conv_count = await db.execute(
            select(func.count(Conversation.id)).where(Conversation.owner_id == user_id)
        )
        coll_count = await db.execute(
            select(func.count(Collection.id)).where(Collection.owner_id == user_id)
        )
        return HelpUserContext(
            role=user.role.value,
            conversations_used=conv_count.scalar() or 0,
            conversations_limit=PRO_CONVERSATION_LIMIT,
            collections_used=coll_count.scalar() or 0,
            collections_limit=PRO_COLLECTION_LIMIT,
        )
    # Starter: lifetime counts
    return HelpUserContext(
        role=user.role.value,
        conversations_used=user.lifetime_conversations_created or 0,
        conversations_limit=STARTER_CONVERSATION_LIMIT,
        collections_used=user.lifetime_collections_created or 0,
        collections_limit=STARTER_COLLECTION_LIMIT,
    )


# CB-04: Fixed redirect for out-of-scope questions. No internal paths, secrets, or implementation details.
OUT_OF_SCOPE_REDIRECT = (
    "I'm here to help only with the Prompt Knowledge Base application—its features, usage, and plans. "
    "I can't answer questions about other topics or products. "
    "You could try asking things like: How do I save a conversation? What does the Pro plan include?"
)


class HelpChatMessage(BaseModel):
    """One turn in the help conversation (CB-08). Only user and assistant; no system."""

    role: str  # "user" | "assistant"
    content: str


class HelpChatRequest(BaseModel):
    """Request body for the help-chat endpoint."""

    message: str
    session_id: str | None = None  # Optional; unused (history is in request body).
    history: list[HelpChatMessage] | None = None  # CB-08: prior turns in this help session (user/assistant only).


class HelpChatResponse(BaseModel):
    """Response body for the help-chat endpoint."""

    answer: str


async def _is_question_about_app(message: str) -> bool:
    """
    CB-04: Classify whether the user question is about the Prompt Knowledge Base application.
    Returns True if in scope, False if clearly off-topic. Unparseable or ambiguous -> treat as in scope.
    """
    client = get_openai_client()
    classification_prompt = (
        "You are a classifier. The user will ask a single question. "
        "Determine if the question is about the 'Prompt Knowledge Base' application: "
        "its features, how to use it (chat, save, replay, library, collections), roles (Starter, Pro, Administrator), "
        "limits, visibility, or where to find developer/admin info. "
        "Answer with exactly one word: YES if the question is about this app, NO if it is about something else "
        "(e.g. general knowledge, other products, unrelated topics)."
    )
    try:
        completion = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": classification_prompt},
                {"role": "user", "content": message},
            ],
            stream=False,
        )
        raw = (completion.choices[0].message.content or "").strip().upper()
        # Only treat as out-of-scope when we get a clear NO to avoid blocking valid questions.
        return not raw.startswith("NO")
    except Exception:
        return True  # On error, proceed to answer so we don't block users


def _runtime_limits_block() -> str:
    """Build a short block with current configured limits for grounding (CB-03)."""
    return (
        "Current configured limits for this deployment (configurable via environment):\n"
        f"- Pro: {app_config.LIMIT_PRO_CONVERSATIONS} conversations (current total), "
        f"{app_config.LIMIT_PRO_COLLECTIONS} collections (current total).\n"
        f"- Starter: {app_config.LIMIT_STARTER_CONVERSATIONS} conversations (lifetime cap), "
        f"{app_config.LIMIT_STARTER_COLLECTIONS} collections (lifetime cap).\n"
        "- Administrator: unlimited.\n"
        "When citing limits, use these numbers and note they are configurable per deployment.\n"
    )


def _format_user_context_block(ctx: HelpUserContext) -> str:
    """CB-05: Format role and usage for the system prompt. No PII or internal identifiers."""
    role_display = ctx.role.capitalize()
    if ctx.conversations_limit is None:
        return (
            f"CURRENT USER CONTEXT (use only to personalize answers; do not repeat raw): "
            f"The user's plan is {role_display} (unlimited conversations and collections)."
        )
    return (
        f"CURRENT USER CONTEXT (use only to personalize answers; do not repeat raw): "
        f"The user's plan is {role_display}. "
        f"They have used {ctx.conversations_used} of {ctx.conversations_limit} conversation slots "
        f"and {ctx.collections_used} of {ctx.collections_limit} collection slots. "
        f"({'Lifetime cap for Starter—deleting does not free slots.' if ctx.role == 'starter' else 'Current total for Pro—deleting frees a slot.'})"
    )


def _build_system_prompt(user_context: HelpUserContext | None) -> str:
    """Build the system prompt from help knowledge, with strict grounding (CB-03). CB-05: include user context when present."""
    knowledge = get_help_knowledge()
    grounding = (
        "You are the in-app help assistant for the Prompt Knowledge Base application.\n\n"
        "GROUNDING (CB-03): You must base every answer only on the knowledge below. "
        "Do not invent features, limits, or procedures. Do not change documented role names or limit semantics. "
        "Use the exact role names: Administrator, Pro, Starter. "
        "Starter limits are LIFETIME creation caps (deleting does not free slots); "
        "Pro limits are on CURRENT total (deleting frees a slot). "
        "When mentioning limit numbers, use the \"Current configured limits\" block below; "
        "if asked about \"the\" limits, state they are configurable per deployment and give these values.\n\n"
        "Keep answers concise. You may summarize or paraphrase the official content but stay consistent with it.\n\n"
        "If the question is not about this application, do not answer it; instead give a short, polite redirect "
        "that you only answer questions about this app and suggest example topics (e.g. saving conversations, replay mode, roles and limits).\n\n"
        "---\n\n"
        + _runtime_limits_block()
        + "\n---\n\n"
        "HELP KNOWLEDGE (single source of truth):\n\n"
    )
    base = grounding + knowledge
    if user_context is not None:
        base += "\n\n" + _format_user_context_block(user_context)
    return base


@router.post("/chat", response_model=HelpChatResponse)
async def help_chat(
    request: HelpChatRequest,
    current_user: OptionalUser = None,
    db: AsyncSession = Depends(get_db),
) -> HelpChatResponse:
    """
    Answer a user question using the help knowledge source.

    - Accepts a message and optional history (CB-08 multi-turn). History is a list of
      prior { role, content } turns (user/assistant only) in this help session; the
      backend uses it as conversation context. No server-side session; stateless.
    - Does not create or update conversations, collections, or user records.
    - Authenticated requests are accepted; unauthenticated requests receive
      only generic/product-level answers (no user-specific data).
    """
    message = (request.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    # CB-04: If the question is not about the app, return a fixed polite redirect.
    # CB-08: When history is present, skip this check so follow-ups (e.g. "How do I open it?") are answered in context.
    has_history = bool(request.history and len(request.history) > 0)
    if not has_history and not await _is_question_about_app(message):
        return HelpChatResponse(answer=OUT_OF_SCOPE_REDIRECT)

    # CB-05: For authenticated users, load role and usage so the bot can personalize answers.
    help_context: HelpUserContext | None = None
    if current_user is not None:
        help_context = await get_help_user_context(uuid.UUID(current_user.sub), db)

    client = get_openai_client()
    system_prompt = _build_system_prompt(help_context)

    # CB-08: Build conversation messages. Include prior turns (capped) then the new user message.
    # Only user and assistant from this help session; no main-app conversation data.
    max_history_messages = 20  # Last 10 turns to avoid token overflow
    chat_messages: list[dict[str, str]] = []
    if request.history:
        for m in request.history[-max_history_messages:]:
            if m.role in ("user", "assistant") and m.content.strip():
                chat_messages.append({"role": m.role, "content": m.content.strip()})
    chat_messages.append({"role": "user", "content": message})

    completion = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            *chat_messages,
        ],
        stream=False,
    )

    answer = completion.choices[0].message.content or ""
    return HelpChatResponse(answer=answer)
