"""Minimal Gemini streaming client (HTTP SSE).

We proxy Gemini's SSE stream into our own SSE format:
  data: {"token": "..."}\n\n
"""

from __future__ import annotations

import json
import os
from typing import AsyncIterator, Literal

import httpx
from fastapi import HTTPException


GeminiRole = Literal["user", "model"]


def has_gemini_key() -> bool:
    return bool(os.getenv("GEMINI_API_KEY", "").strip())


def _gemini_base_url() -> str:
    # Gemini API endpoint (Generative Language API)
    return os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")


def _gemini_api_key() -> str:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")
    return key


def _to_gemini_role(role: str) -> GeminiRole | None:
    # Gemini uses "model" for assistant messages.
    if role == "user":
        return "user"
    if role == "assistant":
        return "model"
    return None


async def stream_gemini_tokens(
    *,
    model: str,
    messages: list[dict[str, str]],
) -> AsyncIterator[str]:
    """
    Stream tokens from Gemini using :streamGenerateContent?alt=sse.

    Input messages are OpenAI-ish dicts: {"role": "...", "content": "..."} including optional system messages.
    """
    api_key = _gemini_api_key()
    base_url = _gemini_base_url()

    system_parts: list[str] = []
    contents: list[dict] = []

    for m in messages:
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "")
        if not content.strip():
            continue
        if role == "system":
            system_parts.append(content)
            continue
        gem_role = _to_gemini_role(role)
        if gem_role is None:
            continue
        contents.append({"role": gem_role, "parts": [{"text": content}]})

    body: dict = {"contents": contents}
    if system_parts:
        body["systemInstruction"] = {"parts": [{"text": "\n\n".join(system_parts)}]}

    url = f"{base_url}/models/{model}:streamGenerateContent"
    params = {"key": api_key, "alt": "sse"}

    async with httpx.AsyncClient(timeout=None) as client:
        try:
            async with client.stream("POST", url, params=params, json=body) as resp:
                if resp.status_code >= 400:
                    # Read a little body for debugging if present
                    text = await resp.aread()
                    detail = text.decode("utf-8", errors="ignore")[:1000] if text else resp.reason_phrase
                    raise HTTPException(status_code=502, detail=f"Gemini error {resp.status_code}: {detail}")

                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    if not line.startswith("data:"):
                        continue
                    payload = line[len("data:") :].strip()
                    if not payload or payload == "[DONE]":
                        continue
                    try:
                        obj = json.loads(payload)
                    except json.JSONDecodeError:
                        continue

                    # Gemini chunks typically contain candidates[0].content.parts[].text
                    candidates = obj.get("candidates") or []
                    if not candidates:
                        continue
                    content_obj = (candidates[0].get("content") or {}) if isinstance(candidates[0], dict) else {}
                    parts = content_obj.get("parts") or []
                    for part in parts:
                        if not isinstance(part, dict):
                            continue
                        text = part.get("text")
                        if text:
                            yield text
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Gemini request failed: {e!s}")

