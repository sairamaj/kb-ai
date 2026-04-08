from dotenv import load_dotenv

load_dotenv()  # load .env before any config imports read os.getenv

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from sqlalchemy import text  # noqa: E402
from starlette.requests import Request  # noqa: E402
from urllib.parse import urlparse  # noqa: E402

import app.models  # noqa: F401, E402 — register models on Base.metadata
from app.database import engine  # noqa: E402
from app.config import CORS_ORIGINS, FRONTEND_URL  # noqa: E402
from app.routers import auth, chat, conversations, feed, collections, users, help, reports, learning_topics, notes  # noqa: E402

app = FastAPI(title="Prompt KB API", version="0.1.0")


def _normalize_origin(url: str) -> str | None:
    """
    Convert a URL or origin-ish string into an origin usable by FastAPI's CORSMiddleware.
    Examples:
      - https://example.com/app -> https://example.com
      - http://example.com:3000 -> http://example.com:3000
    """
    if not url:
        return None

    raw = url.strip()
    if not raw:
        return None

    parsed = urlparse(raw)

    # If someone passes just `example.com:443`, treat it as host:port.
    if not parsed.scheme and parsed.netloc:
        scheme = "http"
        netloc = parsed.netloc
    elif not parsed.scheme and not parsed.netloc:
        scheme = "http"
        # If they accidentally include a path like `example.com/app`, keep only host[:port].
        netloc = raw.split("/", 1)[0]
    else:
        scheme = parsed.scheme
        netloc = parsed.netloc

    if not scheme or not netloc:
        return None

    return f"{scheme}://{netloc}"


def _build_allowed_origins() -> list[str]:
    # Keep the current dev/docker origins, then add the deployed SPA origin(s).
    origins: set[str] = {"http://localhost:5173", "http://frontend:5173"}

    # Optional: allow extra origins (comma-separated), e.g. custom domains.
    if CORS_ORIGINS.strip():
        for part in CORS_ORIGINS.split(","):
            normalized = _normalize_origin(part)
            if normalized:
                origins.add(normalized)

    # Always include the configured frontend URL origin.
    normalized_frontend = _normalize_origin(FRONTEND_URL)
    if normalized_frontend:
        origins.add(normalized_frontend)

    return sorted(origins)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_store_auth_me(request: Request, call_next):
    """Avoid cached 401/200 for credentialed GET /auth/me (CDN / browser / proxy)."""
    response = await call_next(request)
    if request.url.path == "/auth/me":
        response.headers["Cache-Control"] = "private, no-store, must-revalidate"
        existing = response.headers.get("vary")
        if existing and "Cookie" not in {p.strip().lower() for p in existing.split(",")}:
            response.headers["Vary"] = f"{existing}, Cookie"
        elif not existing:
            response.headers["Vary"] = "Cookie"
    return response


app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(conversations.router)
app.include_router(feed.router)
app.include_router(collections.router)
app.include_router(learning_topics.router)
app.include_router(notes.router)
app.include_router(users.router)
app.include_router(help.router)
app.include_router(reports.router)


@app.get("/health")
async def health():
    """Liveness/readiness: returns 200 with db status when DB is reachable, 503 when DB is not."""
    body = {"status": "ok"}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        body["db"] = "ok"
        return body
    except Exception:
        body["status"] = "degraded"
        body["db"] = "error"
        return JSONResponse(status_code=503, content=body)
