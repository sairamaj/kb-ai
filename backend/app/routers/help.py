"""
Help chatbot API (CB-02).

Provides a dedicated endpoint for the in-app help bot. Uses the help knowledge
source (CB-01); does not create or modify conversations, collections, or user data.
Authentication is optional: unauthenticated requests receive generic answers only.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.auth import OptionalUser
from app.help_knowledge import get_help_knowledge
from app.openai_client import get_openai_client

router = APIRouter(prefix="/help", tags=["help"])


class HelpChatRequest(BaseModel):
    """Request body for the help-chat endpoint."""

    message: str
    session_id: str | None = None  # Optional; reserved for multi-turn (CB-08)


class HelpChatResponse(BaseModel):
    """Response body for the help-chat endpoint."""

    answer: str


def _build_system_prompt(user: OptionalUser) -> str:
    """Build the system prompt from help knowledge. Optionally include user context (Phase 2)."""
    knowledge = get_help_knowledge()
    base = (
        "You are the in-app help assistant for the Prompt Knowledge Base application. "
        "Answer only from the following knowledge. Keep answers concise and accurate. "
        "If the user asks something outside this scope, politely say you only answer questions "
        "about this application and suggest example topics (e.g. saving conversations, replay mode, roles and limits).\n\n"
        "---\n\n"
    ) + knowledge
    # Phase 2 (CB-05): when authenticated, we could append user role/usage here.
    if user is not None:
        # For now we only note that the user is authenticated; no PII.
        base += "\n\n[The user is authenticated; you may refer to \"your plan\" or \"your usage\" when the API provides that context in a future phase.]"
    return base


@router.post("/chat", response_model=HelpChatResponse)
async def help_chat(
    request: HelpChatRequest,
    current_user: OptionalUser = None,
) -> HelpChatResponse:
    """
    Answer a user question using the help knowledge source.

    - Accepts a message (and optional session_id for future multi-turn).
    - Does not create or update conversations, collections, or user records.
    - Authenticated requests are accepted; unauthenticated requests receive
      only generic/product-level answers (no user-specific data).
    """
    message = (request.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    client = get_openai_client()
    system_prompt = _build_system_prompt(current_user)

    completion = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        stream=False,
    )

    answer = completion.choices[0].message.content or ""
    return HelpChatResponse(answer=answer)
