"""URL content fetching for chat summarization.

Detects URLs in user messages, fetches their content (web pages or YouTube
transcripts), and returns text that can be injected into the LLM context.
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import parse_qs, urlparse

import httpx
from bs4 import BeautifulSoup

# Max chars of page/transcript text to inject — keeps token cost reasonable.
MAX_CONTENT_CHARS = 8_000

# YouTube domains that indicate a video URL.
_YOUTUBE_DOMAINS = {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"}

# Regex to extract http/https URLs from arbitrary text.
_URL_RE = re.compile(
    r"https?://"
    r"(?:[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+)"
)


def extract_urls(text: str) -> list[str]:
    """Return all http/https URLs found in *text*, deduplicated, order-preserving."""
    seen: set[str] = set()
    result: list[str] = []
    for url in _URL_RE.findall(text):
        # Strip trailing punctuation that is unlikely to be part of the URL.
        url = url.rstrip(".,;:!?\"')")
        if url not in seen:
            seen.add(url)
            result.append(url)
    return result


def _is_youtube(url: str) -> bool:
    try:
        return urlparse(url).netloc in _YOUTUBE_DOMAINS
    except Exception:
        return False


def _youtube_video_id(url: str) -> str | None:
    """Extract the video ID from various YouTube URL formats."""
    try:
        parsed = urlparse(url)
        if parsed.netloc == "youtu.be":
            return parsed.path.lstrip("/").split("/")[0] or None
        qs = parse_qs(parsed.query)
        ids = qs.get("v", [])
        return ids[0] if ids else None
    except Exception:
        return None


async def fetch_youtube_transcript(url: str) -> str:
    """Return transcript text for a YouTube video URL.

    Falls back to title + description via oEmbed if no transcript is available.
    Raises RuntimeError with a user-friendly message on complete failure.
    """
    video_id = _youtube_video_id(url)
    if not video_id:
        raise RuntimeError(f"Could not extract video ID from YouTube URL: {url}")

    # youtube-transcript-api is synchronous; run in thread pool.
    try:
        transcript_text = await asyncio.get_event_loop().run_in_executor(
            None, _fetch_transcript_sync, video_id
        )
        if transcript_text:
            return transcript_text[:MAX_CONTENT_CHARS]
    except Exception:
        pass

    # Fallback: oEmbed gives title + author (no API key needed).
    try:
        oembed_text = await _fetch_youtube_oembed(url)
        if oembed_text:
            return oembed_text
    except Exception:
        pass

    raise RuntimeError(
        f"No transcript or metadata available for YouTube video: {url}"
    )


def _fetch_transcript_sync(video_id: str) -> str:
    """Synchronous wrapper around youtube-transcript-api."""
    from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound  # type: ignore

    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        return " ".join(entry["text"] for entry in transcript_list)
    except (TranscriptsDisabled, NoTranscriptFound):
        return ""


async def _fetch_youtube_oembed(url: str) -> str:
    """Fetch YouTube video title and author via oEmbed (no API key required)."""
    oembed_url = f"https://www.youtube.com/oembed?url={url}&format=json"
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(oembed_url, follow_redirects=True)
        resp.raise_for_status()
        data = resp.json()
        title = data.get("title", "")
        author = data.get("author_name", "")
        parts = []
        if title:
            parts.append(f"Title: {title}")
        if author:
            parts.append(f"Channel: {author}")
        return "\n".join(parts) if parts else ""


async def fetch_web_page(url: str) -> str:
    """Fetch a web page and return its main readable text content.

    Strips scripts, styles, nav, footer, and other boilerplate.
    Raises RuntimeError with a user-friendly message on failure.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; PromptKB/1.0; +https://github.com/user/kb)"
        )
    }
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "text/html" not in content_type and "text/plain" not in content_type:
                raise RuntimeError(
                    f"URL does not return readable content (content-type: {content_type})"
                )
            return _extract_text(resp.text)
    except httpx.TimeoutException:
        raise RuntimeError(f"Timed out fetching URL: {url}")
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"HTTP {e.response.status_code} fetching URL: {url}")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Failed to fetch URL: {url} — {e}")


def _extract_text(html: str) -> str:
    """Extract readable text from HTML, stripping boilerplate tags."""
    soup = BeautifulSoup(html, "lxml")

    # Remove noisy elements.
    for tag in soup(["script", "style", "nav", "footer", "header", "aside",
                     "noscript", "form", "iframe", "figure"]):
        tag.decompose()

    # Prefer <article> or <main> if available for cleaner text.
    main = soup.find("article") or soup.find("main") or soup.body or soup

    text = main.get_text(separator="\n", strip=True)

    # Collapse excessive blank lines.
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    text = "\n".join(lines)

    return text[:MAX_CONTENT_CHARS]


async def fetch_url_content(url: str) -> tuple[str, str]:
    """Dispatch to the correct fetcher and return (content, source_type).

    source_type is 'youtube' or 'web'.
    Raises RuntimeError on failure.
    """
    if _is_youtube(url):
        content = await fetch_youtube_transcript(url)
        return content, "youtube"
    content = await fetch_web_page(url)
    return content, "web"
