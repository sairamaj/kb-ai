"""Shared helpers for exporting conversations and collections as Markdown."""
import re

from app.models import Conversation


def sanitize_filename(name: str, max_len: int = 80) -> str:
    """Replace characters unsafe for filenames with underscore; truncate."""
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip() or "export"
    return safe[:max_len].rstrip("._ ") or "export"


def conversation_to_markdown(conv: Conversation) -> str:
    """Render a conversation with messages as Markdown."""
    lines = [
        f"# {conv.title}",
        "",
        f"- **Model:** {conv.model}",
        f"- **Created:** {conv.created_at.isoformat()}",
        f"- **Updated:** {conv.updated_at.isoformat()}",
    ]
    if conv.tags:
        lines.append(f"- **Tags:** {', '.join(conv.tags)}")
    lines.extend(["", "---", ""])
    for m in conv.messages:
        role = m.role.capitalize()
        lines.append(f"## {role}")
        lines.append("")
        lines.append(m.content.strip())
        lines.append("")
    return "\n".join(lines).strip() + "\n"
