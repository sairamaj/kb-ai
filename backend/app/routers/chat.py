import json
import logging
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.gemini_client import has_gemini_key, stream_gemini_tokens
from app.openai_client import get_openai_client
from app.url_fetcher import extract_urls, fetch_url_content

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    provider: str = "openai"  # "openai" | "gemini"
    model: str = "gpt-4o-mini"


async def _inject_url_context(messages: list[ChatMessage]) -> list[ChatMessage]:
    """Detect URLs in the last user message and merge fetched content into that turn.

    Returns a new messages list where the last user message is replaced by a
    single user message containing URL-derived content plus the original text
    (under a 'User message:' separator). No synthetic assistant turns are added.
    """
    # Find the last user message.
    last_user_idx = None
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].role == "user":
            last_user_idx = i
            break

    if last_user_idx is None:
        return messages

    last_user_msg = messages[last_user_idx]
    urls = extract_urls(last_user_msg.content)
    if not urls:
        return messages

    context_blocks: list[str] = []
    for url in urls:
        try:
            content, source_type = await fetch_url_content(url)
            label = "YouTube video transcript" if source_type == "youtube" else "Web page content"
            block = (
                f"[{label} from {url}]\n"
                f"{content}\n"
                f"[End of content from {url}]"
            )
            context_blocks.append(block)
            logger.info("Fetched %s content for URL: %s (%d chars)", source_type, url, len(content))
        except RuntimeError as e:
            # Inform the LLM that fetching failed so it can tell the user.
            context_blocks.append(
                f"[Could not fetch content from {url}: {e}]"
            )
            logger.warning("URL fetch failed for %s: %s", url, e)

    if not context_blocks:
        return messages

    # Merge fetched content into the last user turn only (no synthetic assistant).
    # Keeps alternation valid for providers and avoids the model thinking it already replied.
    enriched_user_content = (
        "The user has shared the following URL(s). Use the content below to answer "
        "their request. Always cite the source URL(s) in your response.\n\n"
        + "\n\n".join(context_blocks)
        + "\n\n---\nUser message:\n"
        + last_user_msg.content
    )

    new_messages = list(messages[:last_user_idx])
    new_messages.append(ChatMessage(role="user", content=enriched_user_content))
    new_messages.extend(messages[last_user_idx + 1 :])
    return new_messages


async def _token_stream(client: AsyncOpenAI, request: ChatRequest) -> AsyncIterator[str]:
    stream = await client.chat.completions.create(
        model=request.model,
        messages=[{"role": m.role, "content": m.content} for m in request.messages],
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            # SSE format: "data: <json>\n\n"
            yield f"data: {json.dumps({'token': delta})}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/stream")
async def stream_chat(request: ChatRequest) -> StreamingResponse:
    provider = (request.provider or "openai").strip().lower()

    # Enrich messages with fetched URL content before calling the LLM.
    enriched_messages = await _inject_url_context(request.messages)
    enriched_request = ChatRequest(
        messages=enriched_messages,
        provider=request.provider,
        model=request.model,
    )

    if provider == "openai":
        # Validate key and create client before opening the stream so that
        # any 503 is returned as a proper HTTP error, not a broken SSE stream.
        client = get_openai_client()
        iterator = _token_stream(client, enriched_request)
    elif provider == "gemini":
        if not has_gemini_key():
            raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")
        iterator = _gemini_stream(enriched_request)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    return StreamingResponse(
        iterator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def _gemini_stream(request: ChatRequest) -> AsyncIterator[str]:
    # Convert into our SSE token format.
    async for token in stream_gemini_tokens(
        model=request.model or "gemini-2.0-flash",
        messages=[{"role": m.role, "content": m.content} for m in request.messages],
    ):
        yield f"data: {json.dumps({'token': token})}\n\n"
    yield "data: [DONE]\n\n"


class ProviderOptionsResponse(BaseModel):
    providers: list[dict]


@router.get("/options", response_model=ProviderOptionsResponse)
async def chat_options() -> ProviderOptionsResponse:
    # Default lists (OpenAI-powered + Gemini). Keys can be missing; frontend can still display.
    return ProviderOptionsResponse(
        providers=[
            {
                "id": "openai",
                "label": "OpenAI",
                "models": ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
                "enabled": True,
            },
            {
                "id": "gemini",
                "label": "Gemini",
                "models": ["gemini-2.0-flash", "gemini-1.5-pro"],
                "enabled": has_gemini_key(),
            },
        ]
    )
