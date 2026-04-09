"""Shared helpers for exporting conversations, collections, and learning topics as Markdown or PDF."""
import re
from datetime import datetime
from io import BytesIO
from typing import Literal

from app.models import Conversation, Note


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


def learning_topic_to_markdown(
    *,
    title: str,
    description: str | None,
    created_at: datetime,
    updated_at: datetime,
    merged: list[tuple[Literal["conversation", "note"], Conversation | Note]],
) -> str:
    """Single document: topic header, then each item in order (conversations as transcripts, notes as markdown body)."""
    lines: list[str] = [
        f"# {title}",
        "",
    ]
    if description and description.strip():
        lines.append(description.strip())
        lines.append("")
    lines.extend(
        [
            f"- **Items:** {len(merged)}",
            f"- **Created:** {created_at.isoformat()}",
            f"- **Updated:** {updated_at.isoformat()}",
            "",
            "---",
            "",
        ]
    )
    if not merged:
        lines.append("*This topic has no conversations or notes yet.*")
        lines.append("")
        return "\n".join(lines).strip() + "\n"

    for kind, entity in merged:
        if kind == "conversation":
            conv = entity
            assert isinstance(conv, Conversation)
            lines.append(f"## Conversation: {conv.title}")
            lines.append("")
            lines.append(conversation_to_markdown(conv))
        else:
            note = entity
            assert isinstance(note, Note)
            lines.append(f"## Note: {note.title}")
            lines.append("")
            if note.tags:
                lines.append(f"- **Tags:** {', '.join(note.tags)}")
                lines.append("")
            lines.append((note.content or "").strip())
            lines.append("")
        lines.append("---")
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def markdown_to_pdf_bytes(markdown_text: str) -> bytes:
    """Render Markdown to PDF via HTML (xhtml2pdf)."""
    import markdown
    from xhtml2pdf import pisa

    body = markdown.markdown(
        markdown_text,
        extensions=["extra", "tables", "nl2br", "sane_lists"],
    )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
@page {{ margin: 1.5cm; }}
body {{ font-family: Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; }}
h1 {{ font-size: 1.6em; margin: 0.8em 0 0.4em; border-bottom: 1px solid #ccc; }}
h2 {{ font-size: 1.25em; margin: 1em 0 0.4em; }}
h3 {{ font-size: 1.1em; margin: 0.8em 0 0.3em; }}
pre, code {{ font-family: DejaVu Sans Mono, Consolas, monospace; font-size: 0.92em; }}
pre {{ background: #f6f6f6; padding: 0.6em 0.8em; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; }}
code {{ background: #f0f0f0; padding: 0.1em 0.25em; border-radius: 2px; }}
table {{ border-collapse: collapse; width: 100%; margin: 0.8em 0; }}
th, td {{ border: 1px solid #ccc; padding: 0.35em 0.5em; }}
blockquote {{ margin: 0.6em 0; padding-left: 1em; border-left: 3px solid #ddd; color: #444; }}
hr {{ border: none; border-top: 1px solid #ccc; margin: 1em 0; }}
ul, ol {{ margin: 0.4em 0 0.4em 1.2em; }}
</style>
</head>
<body>{body}</body>
</html>"""
    buf = BytesIO()
    result = pisa.CreatePDF(html, dest=buf, encoding="utf-8")
    if result.err:
        raise RuntimeError("PDF rendering failed")
    return buf.getvalue()
