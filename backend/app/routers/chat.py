import json
import os
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

router = APIRouter(prefix="/chat", tags=["chat"])

_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
        _client = AsyncOpenAI(api_key=api_key)
    return _client


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
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
    # Validate key and create client before opening the stream so that
    # any 503 is returned as a proper HTTP error, not a broken SSE stream.
    client = get_openai_client()
    return StreamingResponse(
        _token_stream(client, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
