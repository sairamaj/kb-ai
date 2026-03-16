from dotenv import load_dotenv

load_dotenv()  # load .env before any config imports read os.getenv

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from sqlalchemy import text  # noqa: E402

import app.models  # noqa: F401, E402 — register models on Base.metadata
from app.database import engine  # noqa: E402
from app.routers import auth, chat, conversations, feed, collections, users, help, reports  # noqa: E402

app = FastAPI(title="Prompt KB API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://frontend:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(conversations.router)
app.include_router(feed.router)
app.include_router(collections.router)
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
