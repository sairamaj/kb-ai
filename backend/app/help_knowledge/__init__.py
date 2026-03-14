"""
Help knowledge for the in-app help chatbot (CB-01).

This package holds the single source of truth for what the bot is allowed to say
about the application. Content is loaded from help_knowledge/content.md and
exposed for use by the help-chat API (e.g. as system context or for RAG).
"""

from pathlib import Path

# Directory containing content.md (next to this __init__.py)
_KNOWLEDGE_DIR = Path(__file__).resolve().parent
_CONTENT_FILE = _KNOWLEDGE_DIR / "content.md"

# Cached full text; loaded on first access
_cached_text: str | None = None


def get_help_knowledge() -> str:
    """
    Return the full help knowledge content as a single string.

    Used by the help chatbot to ground answers. Content is read from
    help_knowledge/content.md and cached after the first load.
    """
    global _cached_text
    if _cached_text is None:
        _cached_text = _CONTENT_FILE.read_text(encoding="utf-8")
    return _cached_text


def get_help_knowledge_path() -> Path:
    """Return the path to the help knowledge content file (for build/RAG tooling)."""
    return _CONTENT_FILE


def clear_help_knowledge_cache() -> None:
    """Clear the in-memory cache so the next get_help_knowledge() reloads from disk."""
    global _cached_text
    _cached_text = None
