from dotenv import load_dotenv

load_dotenv()  # load .env before any config imports read os.getenv

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

import app.models  # noqa: F401, E402 — register models on Base.metadata
from app.routers import auth, chat, conversations, feed, collections  # noqa: E402

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


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
