# Prompt Knowledge Base — Formal Requirements

## 1. Product Vision

A web application that replaces a traditional notes-based knowledge base with a collection of saved AI conversations. Users chat with an OpenAI-powered assistant, save those conversations, and revisit them later to rebuild understanding progressively ("replaying" the knowledge).

---

## 2. Functional Requirements

### 2.1 Authentication & Users

- **FR-AUTH-01** Users authenticate via OAuth (Google and/or GitHub).
- **FR-AUTH-02** Each OAuth login creates or retrieves a persistent user profile.
- **FR-AUTH-03** All conversations and collections are scoped per user.
- **FR-AUTH-04** A user may delete their account and all associated data.

### 2.2 Chat Interface

- **FR-CHAT-01** The UI provides a conversational chat interface (message bubbles, input box, send button).
- **FR-CHAT-02** Messages are sent to the OpenAI API (GPT-4o or configurable model) and responses streamed back in real time.
- **FR-CHAT-03** The full conversation context (prior messages) is sent on each turn so the model maintains coherence.
- **FR-CHAT-04** The user can start a new conversation at any time, clearing the active context.
- **FR-CHAT-05** The user can give the conversation a title (auto-suggested from the first prompt if not provided).
- **FR-CHAT-06** The user can add tags/labels to a conversation before or after saving.

### 2.3 Saving & Storage

- **FR-SAVE-01** The user can save an in-progress or completed conversation to their knowledge base.
- **FR-SAVE-02** Each saved conversation stores: title, tags, full message list (role + content + timestamp), model used, created date, last updated date, visibility (public/private), and owner.
- **FR-SAVE-03** Auto-save (draft mode) preserves the current conversation so it survives a page refresh.
- **FR-SAVE-04** A saved conversation can be edited (title, tags, visibility) but message history is immutable.

### 2.4 Conversation Replay / Review Mode

- **FR-REPLAY-01** A conversation can be opened in "Replay Mode" which presents messages one at a time (or in turns) instead of all at once.
- **FR-REPLAY-02** The user advances through the replay manually (Next button) to re-read the exchange at their own pace.
- **FR-REPLAY-03** The user can optionally continue a saved conversation (append new turns) which creates a new conversation branched from the original or extends it.

### 2.5 Knowledge Base (Library)

- **FR-LIB-01** A Library view lists all saved conversations for the logged-in user.
- **FR-LIB-02** Library supports search by keyword (title and message content) and filter by tag.
- **FR-LIB-03** Library supports sorting by: most recent, oldest, most replayed.
- **FR-LIB-04** Conversations marked **Public** are visible to any user (or unauthenticated visitor) via a shareable URL.
- **FR-LIB-05** Conversations marked **Private** are visible only to the owner.
- **FR-LIB-06** A public feed/discovery page lists all public conversations, paginated, sorted by recency.

### 2.6 Collections (optional grouping)

- **FR-COL-01** A user can create named Collections (e.g., "Python Tips", "System Design") to group related conversations.
- **FR-COL-02** A conversation can belong to one or more collections.
- **FR-COL-03** Collections can themselves be public or private.

---

## 3. Non-Functional Requirements

- **NFR-PERF-01** OpenAI responses must be streamed (SSE or WebSocket) to the UI — no waiting for full response.
- **NFR-SEC-01** OpenAI API key is stored server-side only, never exposed to the browser.
- **NFR-SEC-02** JWT (or session cookie) issued after OAuth login; all API routes require valid token.
- **NFR-SEC-03** Private conversations reject requests from non-owners with HTTP 403.
- **NFR-SCALE-01** The backend is stateless (except for DB) so it can be horizontally scaled.
- **NFR-UX-01** The UI is responsive and usable on both desktop and mobile.
- **NFR-DATA-01** Conversations are stored in a relational database (PostgreSQL).

---

## 4. Architecture

```
Browser (React SPA)
    |-- OAuth callback      --> FastAPI Auth Service     --> PostgreSQL
    |-- Stream chat (SSE)   --> FastAPI Chat Service     --> OpenAI API
    |-- Save / list / replay --> FastAPI KB Service      --> PostgreSQL
```

---

## 5. Data Model (core entities)

- **User** — id, oauth_provider, oauth_sub, email, display_name, avatar_url, created_at
- **Conversation** — id, owner_id (FK User), title, model, visibility (public/private), tags[], created_at, updated_at
- **Message** — id, conversation_id (FK Conversation), role (user/assistant/system), content, created_at
- **Collection** — id, owner_id (FK User), name, visibility, created_at
- **ConversationCollection** — conversation_id, collection_id (join table)

---

## 6. Tech Stack

- **Frontend** — React (Vite), TailwindCSS, React Query for data fetching
- **Backend** — Python 3.12, FastAPI, SQLAlchemy (async), Alembic migrations
- **Database** — PostgreSQL
- **Auth** — OAuth 2.0 (Google / GitHub) via Authlib; JWT access tokens
- **AI** — OpenAI Python SDK, streaming via Server-Sent Events (SSE)
- **Deployment** — Docker Compose (local dev); production-ready Dockerfiles per service

---

## 7. Search Capability Roadmap

PostgreSQL enables a progressive search upgrade path — no database migration required at any level.

### Level 1 — v1 start (no extra setup)
Simple `ILIKE` queries on title and tags. Sufficient for small datasets.

### Level 2 — v1 target (built into PostgreSQL)
`tsvector` generated column + GIN index on `conversations`. Covers full-text search across
title, tags, and message content with stemming, ranking, and stop-word removal.

```sql
ALTER TABLE conversations
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(array_to_string(tags,' '),''))
) STORED;

CREATE INDEX idx_conv_search ON conversations USING GIN(search_vector);
```

### Level 3 — v2 (semantic / AI-powered search)
Generate an OpenAI embedding per saved conversation and store it in a `pgvector` column
(PostgreSQL extension — same DB, no new infrastructure). Query by cosine similarity to find
conversations similar in meaning rather than by exact keyword.

### Level 4 — large scale
Sync PostgreSQL to Elasticsearch/OpenSearch via CDC for faceted search, autocomplete, and
analytics at high volume. The relational schema requires no changes to enable this.

---

## 8. Out of Scope (v1)

- Mobile native apps
- Multiple AI providers (Anthropic, Gemini, etc.) — can be added in v2
- Real-time collaborative editing of conversations
- Fine-tuning or RAG over saved conversations
- Billing / usage caps per user
- Semantic search (planned for v2 via pgvector)
