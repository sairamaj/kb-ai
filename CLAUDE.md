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

### Integration tests (Z4-03)
Tests verify container images and deployed environments:
```bash
# Run all (build, start containers, test, tear down)
./scripts/run-integration-tests.sh

# Run tests only (containers already running on port 8010/8081)
BACKEND_URL="http://localhost:8010" FRONTEND_URL="http://localhost:8081" \
  python -m pytest tests/deployment/ -v -m integration
```
Tests live in `tests/deployment/`. See `docs/developer.md` for deployed environment test setup.

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

**Cascade deletes**: All FK relationships use `ondelete="CASCADE"`. Deleting a User removes all their Conversations, Messages, Collections, and LearningTopics.

**Public sharing**: Conversations, Collections, and LearningTopics can be marked `is_public` to enable read-only access via unauthenticated public pages. Shared items have non-sequential UUIDs to prevent enumeration.

**Multi-LLM support**: Users can choose between OpenAI (default) and Gemini for chat. The `POST /chat/stream` endpoint routes to the appropriate AI client (`openai_client.py` or `gemini_client.py`) based on `user.preferred_model`.

**Rate limiting & quotas**: The `limits.py` module enforces per-user monthly token budgets, request rate limits, and conversation limits. `provider_costs.py` tracks spending. `LimitReachedDialog` on frontend notifies when quotas are hit.

**Vite watch config for Windows Docker**: The frontend vite config uses polling with a 2s interval and `awaitWriteFinish` to work around inotify limitations in Docker on Windows; prevents HMR thrashing and state loss.

## Backend Structure

### Core infrastructure
- `app/main.py` — FastAPI app, CORS, router registration, `GET /health`
- `app/config.py` — env var reads (OAuth credentials, JWT config, URLs, OpenAI/Gemini keys)
- `app/database.py` — async SQLAlchemy engine + `AsyncSessionLocal` + `Base`
- `app/models.py` — ORM models: `User`, `Conversation`, `Message`, `Collection`, `ConversationCollection`, `LearningTopic`
- `app/auth.py` — JWT creation/verification; `CurrentUser` dependency type alias

### API routers
- `app/routers/auth.py` — OAuth login/callback (Google & GitHub), `/auth/me`, `/auth/logout`
- `app/routers/chat.py` — `POST /chat/stream` SSE streaming (OpenAI or Gemini)
- `app/routers/conversations.py` — CRUD for conversations + replay tracking
- `app/routers/feed.py` — feed/activity endpoints
- `app/routers/collections.py` — CRUD for collections (grouping conversations)
- `app/routers/users.py` — user profile, preferences, usage tracking
- `app/routers/help.py` — help/documentation endpoints
- `app/routers/reports.py` — analytics/reports endpoints
- `app/routers/learning_topics.py` — learning topics CRUD and public sharing

### AI & utilities
- `app/openai_client.py` — OpenAI SDK wrapper (streaming, token counting)
- `app/gemini_client.py` — Gemini API integration
- `app/export_utils.py` — conversation export (JSON, markdown, etc.)
- `app/provider_costs.py` — cost calculation for OpenAI/Gemini tokens
- `app/limits.py` — rate limits, usage quotas, token budgets

### Database
- `alembic/versions/` — migration files; enums created idempotently via `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`

## Frontend Structure

### Core
- `src/App.tsx` — root: wraps in `<AuthProvider>` + `<ThemeProvider>`, routes to `LoginPage`, `ChatPage`, etc.
- `src/main.tsx` — React 18 entry point with React Query `QueryClientProvider`

### Context & hooks
- `src/context/AuthContext.tsx` — React Query-backed auth; `GET /api/auth/me` on load; logout calls `POST /api/auth/logout`
- `src/context/ThemeContext.tsx` — light/dark mode state
- `src/hooks/useChat.ts` — `useChat()` (message state) + `streamChatReply()` (SSE via fetch + ReadableStream)

### Pages & routing
- `src/pages/LoginPage.tsx` — OAuth login buttons (Google, GitHub)
- `src/components/ChatPage.tsx` — main chat interface
- `src/components/LibraryPage.tsx` — saved conversations list/search
- `src/components/FeedPage.tsx` — activity feed
- `src/components/ReportsPage.tsx` — analytics/reports
- `src/components/HelpPage.tsx` — help & documentation
- `src/components/ConversationDetailPage.tsx` — view/edit saved conversation
- `src/components/PublicConversationPage.tsx` — publicly shared conversation view (no login)
- `src/components/PublicCollectionPage.tsx` — publicly shared collection view
- `src/components/PublicLearningTopicPage.tsx` — publicly shared learning topic

### Components
- `src/components/MessageBubble.tsx` — message display (user/assistant)
- `src/components/ChatInput.tsx` — input textarea + send button
- `src/components/TypingIndicator.tsx` — "..." animation while waiting for reply
- `src/components/EmptyState.tsx` — no conversations UI
- `src/components/ReplayMode.tsx` — step-through saved conversation
- `src/components/TopicReplayMode.tsx` — replay for learning topics
- `src/components/SaveDialog.tsx` — save/update conversation to library
- `src/components/HelpChat.tsx` — embedded help chat
- `src/components/HelpPopup.tsx` — help popup overlay
- `src/components/ThemeToggle.tsx` — light/dark mode button
- `src/components/UsageDisplay.tsx` — user's token usage stats
- `src/components/LimitReachedDialog.tsx` — quota/limit exceeded notification

### API & types
- `src/api/base.ts` — Axios client, API call helpers
- `src/api/errors.ts` — error handling
- `src/types/` — TypeScript types (`Message`, `AuthUser`, `Conversation`, `Collection`, `LearningTopic`, `Reports`, etc.)
- `src/config/features.ts` — feature flags

### V2 UI shell (`src/v2/`)
A redesigned UI mounted at `/v2` that coexists with the classic shell at `/`.
`App.tsx` lazy-loads `AppShellV2` when `isV2Path(location.pathname)` matches;
public share routes (`/c/:id`, `/collections/public/:id`, `/learning-topics/public/:id`)
continue to render in the classic shell.

- `AppShellV2.tsx` — root v2 layout; renders `IconRail`, active section view, `UserMenu`, `HelpPopup`, and `CommandPalette`. Enforces admin-only Reports. Wires global shortcuts: Ctrl/Cmd+K (palette), Ctrl/Cmd+B (collapse context column), Ctrl/Cmd+N (context-aware new), `/` (focus search / chat input).
- `routing.ts` + `hooks/useV2Route.ts` — v2 URL parsing / generation (`V2Route` discriminated union) and state sync with `pushState`/`popstate`.
- `components/shell/` — shell primitives: `IconRail` (primary nav + theme/help/avatar), `ContextColumn` (collapsible contextual sidebar), `UserMenu` (account popover with usage, plan, sign out, delete, link back to classic), `CommandPalette` (Ctrl/Cmd+K palette with sections + recents + actions), `Placeholder`, `icons.tsx`.
- `components/chat/` — `ChatView` (reuses `useChat` + `streamChatReply` + classic `MessageBubble`/`ChatInput`/`TypingIndicator`/`SaveDialog`), `RecentChatsList`, `CustomizePopover`, `ChatSettings.ts`.
- `components/library/` — master-detail `LibraryView` with tabs (Conversations / Notes / Topics), `FilterDrawer` (search mode, scope, sort, tags), result cards (`ConversationResultCard`, `NoteResultCard`, `TopicResultCard`), detail panes (`ConversationDetailPane`, `NoteDetailPane`).
- `components/notes/` — `NotesView` with pinned/recent grouping, tag filter, and the classic `NoteEditor` embedded as the detail pane.
- `components/topics/` — `TopicsView` with inline progress bars, `TopicDetailPane` (replay / flashcards / export / visibility / share / delete), `TopicProgressStrip`.
- `components/feed/` — v2-native `FeedView` that calls `/api/feed` and `/api/learning-topics/public` directly and renders without the classic header chrome.
- `components/reports/` — v2-native `ReportsView` that embeds the admin user and model/cost tables within the v2 shell.
- `components/TryV2Banner.tsx` — dismissible bottom-right toast shown in the classic shell inviting users to try `/v2`; dismissal persisted in `localStorage`.
- `hooks/` — `useV2Route`, `useRecentChats`, `useDebounce`.

## Data Model

```
User ──< Conversation ──< Message
User ──< Collection
Conversation >──< Collection        (via ConversationCollection join table)
User ──< LearningTopic ──< Message
LearningTopic >──< Collection        (some topics are grouped in collections)
```

- All PKs are UUID v4.
- `Conversation.tags` — PostgreSQL `ARRAY(String)` for search/filter
- `Conversation.replay_count` — `BigInteger` tracking replay mode starts
- `Conversation.is_public` — boolean for public sharing
- `LearningTopic.is_public` — boolean for public learning topics
- `Collection.is_public` — boolean for public collections
- `User.preferred_model` — "openai" or "gemini" (default: openai)
- Token usage tracked per user for rate limiting and cost reporting

## Story Tracking & Documentation

User stories, requirements, and implementation status are tracked in `docs/`:
- `docs/stories.md` — main user stories by phase
- `docs/requirements.md` — formal requirements with FR codes
- `docs/stories2.md`, `docs/chatbot_stories.md`, `docs/learning_stories.md`, etc. — feature-specific stories
- `docs/deployment_stories.md`, `docs/deployment_requirements.md` — deployment phases (Z4-01..04, etc.)
- `docs/authorization_stories.md` — public sharing & access control features
- `docs/developer.md` — development setup, deployment, testing

Implementation phases (from recent commits):
1. Foundation (INFRA, CHAT) — **done**
2. Auth & Save (AUTH, SAVE) — **done**
3. Library (LIB) — **done**
4. Replay Mode (REPLAY) — **done**
5. Public Sharing (SHARE) — **done** (conversations, collections, learning topics)
6. Collections (COL) — **in progress** (collections UI visible)
7. Learning Topics — **in progress** (LearningTopic model, public sharing)
8. Reports & Analytics — **in progress** (ReportsPage, usage tracking)
9. Help & Documentation — **in progress** (HelpPage, embedded help chat)
10. Deployment (Z4) — **in progress** (Docker, integration tests, Azure CI/CD)
