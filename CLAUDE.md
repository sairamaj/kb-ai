# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Prompt Knowledge Base** — a web app that replaces traditional notes with saved AI conversations. Users chat with an OpenAI-powered assistant, save those conversations, and revisit them (including a "Replay Mode" that steps through messages one turn at a time).

## Development Commands

### Start everything (recommended)
```bash
docker-compose up
```
- Frontend (Vite dev server): http://localhost:5173
- Backend (FastAPI + uvicorn): http://localhost:8000
- PostgreSQL: localhost:5432

### Frontend only
```bash
cd frontend
npm install
npm run dev       # Vite dev server
npm run build     # tsc + vite build
npm run lint      # ESLint (zero warnings policy)
```

### Backend only
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Database migrations (Alembic)
```bash
# Apply all migrations
cd backend && alembic upgrade head

# Create a new migration
cd backend && alembic revision -m "describe change"

# Rollback one step
cd backend && alembic downgrade -1
```

## Environment Setup

Copy `backend/.env.example` to `backend/.env` and fill in:
- `OPENAI_API_KEY` — required for chat
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth (Google)
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — OAuth (GitHub)
- `SECRET_KEY` — JWT signing key (generate with `python -c "import secrets; print(secrets.token_hex(32))"`)

OAuth redirect URIs must be registered with providers as `http://localhost:5173/api/auth/{provider}/callback`.

## Architecture

```
Browser (React SPA :5173)
  └── /api/* → Vite proxy → FastAPI (:8000)
                               ├── /auth/*   — OAuth + JWT
                               ├── /chat/*   — OpenAI SSE streaming
                               └── /health   — liveness check
FastAPI → PostgreSQL (:5432)
FastAPI → OpenAI API
```

### Key architectural decisions

**Vite proxy as the single origin**: All `/api/*` frontend requests are proxied by Vite to `http://backend:8000`, stripping the `/api` prefix. This means OAuth redirect URIs and JWT cookies are all issued on `localhost:5173`, keeping the SPA and backend cookies on the same origin without CORS issues.

**JWT in httpOnly cookie**: After OAuth callback, the backend sets an `access_token` httpOnly cookie (7-day expiry). The `CurrentUser` FastAPI dependency (`app/auth.py`) reads this cookie on every protected request. Frontend never sees the raw token.

**SSE streaming**: `POST /chat/stream` returns `text/event-stream`. Each token is `data: {"token": "..."}\n\n`; the stream ends with `data: [DONE]\n\n`. The frontend reads this via `fetch` + `ReadableStream` (no EventSource) in `frontend/src/hooks/useChat.ts::streamChatReply`.

**Full conversation context on every turn**: The frontend sends the entire message history (including a system prompt) on each `POST /chat/stream` call. There is no server-side session state for chat.

**Cascade deletes**: All FK relationships use `ondelete="CASCADE"`. Deleting a User removes all their Conversations, Messages, and Collections.

## Backend Structure

- `app/main.py` — FastAPI app, CORS, router registration
- `app/config.py` — env var reads (OAuth credentials, JWT config, URLs)
- `app/database.py` — async SQLAlchemy engine + `AsyncSessionLocal` + `Base`
- `app/models.py` — ORM models: `User`, `Conversation`, `Message`, `Collection`, `ConversationCollection`
- `app/auth.py` — JWT creation/verification; `CurrentUser` dependency type alias
- `app/routers/auth.py` — OAuth login/callback for Google & GitHub, `/auth/me`, `/auth/logout`
- `app/routers/chat.py` — `POST /chat/stream` SSE endpoint
- `alembic/versions/0001_initial_schema.py` — full schema; enums are created idempotently via `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`

## Frontend Structure

- `src/App.tsx` — root: wraps in `<AuthProvider>`, renders `<LoginPage>` or `<ChatPage>` based on auth state
- `src/context/AuthContext.tsx` — React Query-backed auth context; `GET /api/auth/me` on load; `logout()` calls `POST /api/auth/logout`
- `src/hooks/useChat.ts` — `useChat()` hook (message state) + `streamChatReply()` (SSE fetch logic)
- `src/types/` — shared TypeScript types (`Message`, `AuthUser`)
- `src/components/` — UI components (`ChatPage`, `MessageBubble`, `ChatInput`, `TypingIndicator`, `EmptyState`)
- `src/pages/LoginPage.tsx` — OAuth login buttons

## Data Model

```
User ──< Conversation ──< Message
User ──< Collection
Conversation >──< Collection  (via ConversationCollection join table)
```

All PKs are UUID v4. `Conversation.tags` is a PostgreSQL `ARRAY(String)`. `Conversation.replay_count` (`BigInteger`) tracks how many times replay mode was started.

## Story Tracking

User stories are in `stories.md`, organized by phase. Requirements are in `requirements.md`. Implementation phases:
1. Foundation (INFRA, CHAT) — **done**
2. Auth & Save (AUTH, SAVE) — AUTH-01 done
3. Library (LIB) — LIB-01 done, LIB-02 done
4. Replay Mode (REPLAY) — REPLAY-01 done, REPLAY-02 done, REPLAY-03 done, REPLAY-04 done
5. Public Sharing (SHARE) — SHARE-01 done, SHARE-02 done
6. Collections (COL)
7. Search v2 (SEARCH — pgvector semantic search)
