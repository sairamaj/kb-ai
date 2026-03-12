import json
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.gemini_client import has_gemini_key, stream_gemini_tokens
from app.openai_client import get_openai_client

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    provider: str = "openai"  # "openai" | "gemini"
    model: str = "gpt-4o-mini"


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

    if provider == "openai":
        # Validate key and create client before opening the stream so that
        # any 503 is returned as a proper HTTP error, not a broken SSE stream.
        client = get_openai_client()
        iterator = _token_stream(client, request)
    elif provider == "gemini":
        if not has_gemini_key():
            raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")
        iterator = _gemini_stream(request)
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
