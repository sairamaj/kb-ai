"""AI flashcard generation (ENH-02): one structured OpenAI call per topic."""

from __future__ import annotations

import logging

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.openai_client import get_openai_client

logger = logging.getLogger(__name__)

FLASHCARD_MODEL = "gpt-4o-mini"
MAX_CARDS = 40
MAX_SOURCE_CHARS = 120_000


class _FlashcardPair(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    answer: str = Field(..., min_length=1, max_length=8000)


class _FlashcardsOpenAIResult(BaseModel):
    """Root model for OpenAI structured output (no max list length — we trim after parse)."""

    cards: list[_FlashcardPair] = Field(default_factory=list)


def truncate_source_material(text: str, max_chars: int = MAX_SOURCE_CHARS) -> str:
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    head = max_chars // 2
    tail = max_chars - head - 80
    return t[:head] + "\n\n[... content truncated for length ...]\n\n" + t[-tail:]


async def generate_flashcards_from_source(*, topic_title: str, source_material: str) -> list[dict[str, str]]:
    """
    Single OpenAI call with structured output. Returns list of {question, answer}.
    Raises HTTPException on configuration or API errors.
    """
    material = truncate_source_material(source_material)
    if not material.strip():
        raise HTTPException(status_code=400, detail="No source content to build flashcards from.")

    client = get_openai_client()
    system = (
        "You create study flashcards for active recall. Given a learning topic title and source material "
        "(conversations and notes), output clear question–answer pairs. "
        "Questions should test understanding, not trivial wording. Answers should be concise but complete. "
        f"Produce between 3 and {min(25, MAX_CARDS)} cards when the material allows; fewer is fine only if "
        "the source is very short. Stay faithful to the source; do not invent facts. "
        "Each question must be distinct."
    )
    user = f"Topic title: {topic_title}\n\nSource material:\n{material}"

    try:
        completion = await client.beta.chat.completions.parse(
            model=FLASHCARD_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format=_FlashcardsOpenAIResult,
            temperature=0.35,
        )
    except Exception as e:
        logger.exception("OpenAI flashcard generation failed")
        raise HTTPException(status_code=502, detail="Flashcard generation failed. Try again later.") from e

    message = completion.choices[0].message
    parsed = message.parsed
    if parsed is None:
        raise HTTPException(
            status_code=502,
            detail="Could not parse flashcards from the model response. Try again.",
        )

    out: list[dict[str, str]] = []
    for pair in parsed.cards[:MAX_CARDS]:
        q = pair.question.strip()
        a = pair.answer.strip()
        if q and a:
            out.append({"question": q, "answer": a})

    if not out:
        raise HTTPException(
            status_code=502,
            detail="The model did not return any flashcards. Add more content to the topic or try again.",
        )

    return out
