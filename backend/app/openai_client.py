"""Shared OpenAI client and embedding helpers."""

import os

from fastapi import HTTPException
from openai import AsyncOpenAI

_client: AsyncOpenAI | None = None

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
# Rough limit to stay under 8191 tokens (~4 chars per token)
MAX_EMBED_TEXT_CHARS = 24_000


def get_openai_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
        _client = AsyncOpenAI(api_key=api_key)
    return _client


def has_openai_key() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


async def embed_text(text: str) -> list[float] | None:
    """Return embedding for text, or None if OpenAI is not configured."""
    if not has_openai_key():
        return None
    text = (text or "").strip()
    if not text:
        return None
    if len(text) > MAX_EMBED_TEXT_CHARS:
        text = text[:MAX_EMBED_TEXT_CHARS]
    client = get_openai_client()
    resp = await client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
    )
    return resp.data[0].embedding
