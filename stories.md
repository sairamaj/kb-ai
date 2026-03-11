# Prompt Knowledge Base — User Stories by Phase

---

## Phase 1 — Foundation (Working Skeleton)

Goal: Stand up the project infrastructure and get a basic end-to-end chat working with no persistence.
After this phase a user can open the app and have a streamed conversation with OpenAI.

---

### INFRA-01 — Project scaffold
**As a developer**, I want a monorepo with a React frontend and FastAPI backend wired up via Docker Compose,
so that I can develop both ends locally with a single command.

**Acceptance criteria:**
- `docker-compose up` starts frontend (Vite dev server), backend (FastAPI + uvicorn), and PostgreSQL
- Frontend proxies API calls to the backend
- A `GET /health` endpoint on the backend returns `{ "status": "ok" }`

---

### INFRA-02 — Database schema & migrations
**As a developer**, I want the core PostgreSQL schema managed by Alembic migrations,
so that schema changes are versioned and repeatable.

**Acceptance criteria:**
- Alembic is configured and `alembic upgrade head` creates all tables
- Tables created: `users`, `conversations`, `messages`, `collections`, `conversation_collections`
- Each table has the columns defined in the data model (see `requirements.md` §5)

---

### CHAT-01 — Basic chat UI
**As a user**, I want a chat interface with a message input and conversation thread,
so that I can type prompts and read responses in a familiar chat layout.

**Acceptance criteria:**
- Input box at the bottom, message bubbles above (user right-aligned, assistant left-aligned)
- Send on Enter or button click
- Empty state shown when no messages exist

---

### CHAT-02 — Streamed OpenAI responses
**As a user**, I want assistant responses to appear word-by-word as they are generated,
so that I do not have to wait for the full response before reading.

**Acceptance criteria:**
- Backend proxies the request to OpenAI using SSE streaming
- Frontend renders each token incrementally as it arrives
- A typing indicator is shown while the stream is in progress
- OpenAI API key is never sent to or visible in the browser

---

### CHAT-03 — Multi-turn context
**As a user**, I want the assistant to remember what I said earlier in the conversation,
so that I can ask follow-up questions without repeating myself.

**Acceptance criteria:**
- All prior messages in the session are included in each OpenAI request
- The conversation thread in the UI shows the full history

---

### CHAT-04 — New conversation
**As a user**, I want to start a fresh conversation at any time,
so that I can change topic without old context interfering.

**Acceptance criteria:**
- A "New Chat" button clears the message thread and resets the context sent to OpenAI

---

## Phase 2 — Authentication & Saving

Goal: Users can log in and save conversations. The knowledge base starts to be populated.

---

### AUTH-01 — OAuth login
**As a user**, I want to sign in with my Google or GitHub account,
so that I do not have to manage a separate username and password.

**Acceptance criteria:**
- Login page offers "Sign in with Google" and "Sign in with GitHub" buttons
- Successful OAuth callback creates or retrieves the user record in the database
- A JWT access token is issued and stored in an httpOnly cookie or localStorage
- Protected API routes return HTTP 401 when no valid token is present

---

### AUTH-02 — User profile
**As a user**, I want to see my name and avatar in the app header,
so that I know I am signed in.

**Acceptance criteria:**
- Header shows display name and avatar fetched from the OAuth provider
- A sign-out button clears the session and redirects to the login page

---

### SAVE-01 — Save a conversation
**As a user**, I want to save the current conversation to my knowledge base,
so that I can return to it later.

**Acceptance criteria:**
- A "Save" button is available during or after a conversation
- Saving stores the title (auto-generated from first prompt if blank), tags, all messages, model used, and visibility (default: private)
- Confirmation is shown after a successful save
- Saving is scoped to the logged-in user

---

### SAVE-02 — Auto-save draft
**As a user**, I want my in-progress conversation to survive a page refresh,
so that I do not lose work if I accidentally close the tab.

**Acceptance criteria:**
- The current unsaved conversation is persisted as a draft automatically as messages are added
- On returning to the app, the draft is restored and the conversation continues

---

### SAVE-03 — Edit conversation metadata
**As a user**, I want to edit the title, tags, and visibility of a saved conversation,
so that I can organise and re-label them after the fact.

**Acceptance criteria:**
- Inline editing of title and tags on the conversation detail page
- Visibility toggle (public / private)
- Message history cannot be edited or deleted

---

## Phase 3 — Library

Goal: Users can browse, find, and manage their saved conversations.

---

### LIB-01 — Library view
**As a user**, I want a Library page that lists all my saved conversations,
so that I have one place to manage my knowledge base.

**Acceptance criteria:**
- Each row shows title, tags, date saved, and visibility badge (public / private)
- Default sort is most recent first
- Clicking a row opens the conversation detail

---

### LIB-02 — Search & filter
**As a user**, I want to search my library by keyword and filter by tag,
so that I can quickly find a specific conversation.

**Acceptance criteria:**
- Keyword search matches against title and message content (PostgreSQL full-text search)
- Tag filter shows a selectable list of all tags used
- Search and filter can be combined
- Results update as the user types (debounced)

---

### LIB-03 — Sort conversations
**As a user**, I want to sort my library by different criteria,
so that I can surface the most relevant conversations.

**Acceptance criteria:**
- Sort options: Most Recent, Oldest, Most Replayed
- Selected sort persists within the session

---

### LIB-04 — Delete a conversation
**As a user**, I want to delete a saved conversation,
so that I can remove content I no longer need.

**Acceptance criteria:**
- Delete option available from the library row and conversation detail page
- Confirmation dialog before permanent deletion
- Deleted conversation and all its messages are removed from the database

---

### LIB-05 — Delete account
**As a user**, I want to permanently delete my account and all my data,
so that I have full control over my information.

**Acceptance criteria:**
- Account deletion option in user settings
- All conversations, messages, collections, and the user record are deleted
- User is signed out and redirected to the landing page

---

## Phase 4 — Replay Mode

Goal: Users can step through saved conversations to review knowledge at their own pace.

---

### REPLAY-01 — Replay a conversation
**As a user**, I want to open a conversation in Replay Mode,
so that I can re-read the exchange step by step rather than all at once.

**Acceptance criteria:**
- A "Replay" button on the conversation detail opens Replay Mode
- Replay Mode shows messages one turn at a time (user prompt → assistant response = one turn)
- A progress indicator shows current turn out of total turns

---

### REPLAY-02 — Manual advancement
**As a user**, I want to advance through the replay at my own pace,
so that I can spend as long as needed on each part.

**Acceptance criteria:**
- "Next" and "Previous" buttons navigate between turns
- Keyboard arrow keys also work for navigation
- The replay can be restarted from the beginning

---

### REPLAY-03 — Replay count tracked
**As a user**, I want the app to record how many times I have replayed a conversation,
so that I can see which topics I have reviewed most.

**Acceptance criteria:**
- Each time Replay Mode is started, the replay count for that conversation increments
- Replay count is shown on the library card and used for "Most Replayed" sort

---

### REPLAY-04 — Continue from a saved conversation
**As a user**, I want to continue chatting from where a saved conversation left off,
so that I can deepen my understanding of a topic without starting from scratch.

**Acceptance criteria:**
- A "Continue" button on the conversation detail loads the message history into the chat interface
- New messages are appended and the extended conversation can be saved as a new conversation

---

## Phase 5 — Public Sharing & Discovery

Goal: Users can share conversations publicly and discover others' public conversations.

---

### SHARE-01 — Public shareable link
**As a user**, I want to mark a conversation as public and share a link to it,
so that others can read it without logging in.

**Acceptance criteria:**
- Conversations marked public have a stable URL (e.g. `/c/{id}`)
- The URL is accessible by unauthenticated visitors
- Private conversations return HTTP 403 for non-owners

---

### SHARE-02 — Public discovery feed
**As any visitor**, I want a page that lists all public conversations,
so that I can discover knowledge shared by other users.

**Acceptance criteria:**
- Feed is paginated (20 items per page)
- Default sort is most recent
- Each card shows title, author, tags, and date
- No login required to browse the feed

---

## Phase 6 — Collections

Goal: Users can organise conversations into named groups for structured learning.

---

### COL-01 — Create a collection
**As a user**, I want to create a named collection (e.g. "Python Tips"),
so that I can group related conversations together.

**Acceptance criteria:**
- Create collection from the Library sidebar or a dedicated Collections page
- Collection has a name and optional visibility (public / private)

---

### COL-02 — Add conversations to a collection
**As a user**, I want to add one or more saved conversations to a collection,
so that I can organise my knowledge base by topic or project.

**Acceptance criteria:**
- A conversation can belong to multiple collections
- Collections can be assigned from the conversation detail page or library
- Filtering the library by collection shows only conversations in that collection

---

### COL-03 — Share a public collection
**As a user**, I want to mark a collection as public,
so that others can browse a curated set of my conversations.

**Acceptance criteria:**
- Public collections have a shareable URL
- The collection page lists all public conversations within it
- Accessible without login

---

## Phase 7 — Search Enhancement (v2)

Goal: Upgrade search from keyword-based to semantic similarity search.

---

### SEARCH-01 — Full-text search index
**As a developer**, I want a PostgreSQL `tsvector` GIN index on conversations,
so that keyword search is fast and supports stemming and ranking.

**Acceptance criteria:**
- `search_vector` generated column exists on the `conversations` table
- Library search query uses `to_tsquery` and ranks results by relevance

---

### SEARCH-02 — Semantic search via embeddings
**As a user**, I want to search for conversations by meaning rather than exact keywords,
so that I can find relevant conversations even when I do not remember the exact wording.

**Acceptance criteria:**
- An OpenAI embedding is generated and stored (`pgvector` column) when a conversation is saved
- A "Semantic Search" mode in the Library queries by cosine similarity
- Results are ranked by similarity score

---

## Story Summary by Phase

| Phase | Stories | Deliverable |
|-------|---------|-------------|
| 1 — Foundation | INFRA-01, INFRA-02, CHAT-01, CHAT-02, CHAT-03, CHAT-04 | Working streamed chat, no login |
| 2 — Auth & Save | AUTH-01, AUTH-02, SAVE-01, SAVE-02, SAVE-03 | Login, save conversations |
| 3 — Library | LIB-01, LIB-02, LIB-03, LIB-04, LIB-05 | Browse, search, manage KB |
| 4 — Replay | REPLAY-01, REPLAY-02, REPLAY-03, REPLAY-04 | Step-through review mode |
| 5 — Public Sharing | SHARE-01 done, SHARE-02 done | Public links and discovery feed |
| 6 — Collections | COL-01, COL-02, COL-03 | Grouped, curated knowledge sets |
| 7 — Search v2 | SEARCH-01, SEARCH-02 | Semantic similarity search |
