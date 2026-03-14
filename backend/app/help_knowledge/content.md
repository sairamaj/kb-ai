# Prompt Knowledge Base — Help Knowledge

This document is the single source of truth for what the help chatbot is allowed to say about the application. It is derived from the official docs: `docs/requirements.md`, `docs/developer.md`, and `docs/authorization.MD`. When those docs change, this content should be updated so help answers stay accurate.

---

## 1. Product vision

Prompt Knowledge Base is a web application that replaces a traditional notes-based knowledge base with a collection of saved AI conversations. Users chat with an OpenAI-powered assistant, save those conversations, and revisit them later to rebuild understanding progressively by "replaying" the knowledge.

---

## 2. Core features and how to use them

### 2.1 Chat

- The app provides a conversational chat interface: message bubbles, input box, and send button.
- Messages are sent to the OpenAI API (e.g. GPT-4o or a configurable model) and responses are streamed back in real time.
- The full conversation context (prior messages) is sent on each turn so the model stays coherent.
- The user can start a new conversation at any time, clearing the active context.
- The user can give the conversation a title (auto-suggested from the first prompt if not provided) and add tags or labels before or after saving.

### 2.2 Saving conversations

- The user can save an in-progress or completed conversation to their knowledge base.
- Each saved conversation stores: title, tags, full message list (role, content, timestamp), model used, created date, last updated date, visibility (public or private), and owner.
- Auto-save (draft mode) preserves the current conversation so it survives a page refresh.
- A saved conversation can be edited (title, tags, visibility); message history is immutable.

### 2.3 Replay mode

- A conversation can be opened in "Replay Mode," which presents messages one at a time (or in turns) instead of all at once.
- The user advances through the replay manually (e.g. a Next button) to re-read the exchange at their own pace.
- The user can optionally continue a saved conversation (append new turns), which creates a new conversation branched from the original or extends it.

### 2.4 Library (knowledge base)

- A Library view lists all saved conversations for the logged-in user.
- Library supports search by keyword (title and message content) and filter by tag.
- Library supports sorting by: most recent, oldest, most replayed.
- Conversations marked **Public** are visible to any user (or unauthenticated visitor) via a shareable URL.
- Conversations marked **Private** are visible only to the owner.
- A public feed or discovery page lists all public conversations, paginated, sorted by recency.

### 2.5 Collections

- A user can create named Collections (e.g. "Python Tips", "System Design") to group related conversations.
- A conversation can belong to one or more collections.
- Collections can be public or private.

---

## 3. Roles and resource limits

### 3.1 Role names

| Role            | Internal name   | Description |
|-----------------|-----------------|-------------|
| Administrator   | `administrator` | Full system access; can manage users and settings; no resource limits. |
| Pro             | `pro`           | Paid subscriber; higher limits on conversations and collections. |
| Starter         | `starter`       | Free subscriber; limited conversations and collections. |

Every user has exactly one role. New users created via OAuth default to **Starter** unless changed by an administrator.

### 3.2 Limits by role

Conversation and collection limits are **configurable per deployment** via environment variables. The following are the typical defaults:

| Resource      | Administrator | Pro (default) | Starter (default) |
|---------------|---------------|----------------|-------------------|
| Conversations | Unlimited     | 100            | 5                 |
| Collections   | Unlimited     | 50             | 5                 |

- Limits apply only to **owned** resources (conversations or collections the user has created).
- **Pro:** Limits are on **current total**. Creating a new conversation or collection when at the limit is denied; deleting one frees a slot for creating another.
- **Starter:** Limits are **lifetime creation caps**. Once a Starter has created 5 conversations or 5 collections in total, they cannot create more even if they delete some. This prevents delete/recreate cycles.
- **Administrator:** Not subject to conversation or collection limits; unlimited.

If a user asks about "the" limit numbers, the answer should use the configured values when known, or state that limits are configurable per deployment and give the typical defaults (e.g. Pro: 100 conversations, 50 collections; Starter: 5 conversations, 5 collections).

---

## 4. Visibility (public vs private)

- **Public** conversations and collections are visible to any user or unauthenticated visitor via shareable URLs and appear on the public feed.
- **Private** conversations and collections are visible only to the owner.
- The owner can change visibility when editing a conversation or collection.

---

## 5. Authentication and current user

- Users authenticate via OAuth (e.g. Google and/or GitHub).
- Each OAuth login creates or retrieves a persistent user profile.
- All conversations and collections are scoped per user.
- A user may delete their account and all associated data.
- The API exposes the current user (e.g. `GET /api/auth/me`) when authenticated, including their **role** and, when available, **current usage** (e.g. conversation count, collection count) so the UI can show limits and upgrade prompts.

---

## 6. Where to find more information

- **Product and feature requirements:** See `docs/requirements.md`.
- **Developer and admin information:** See `docs/developer.md`. It covers:
  - Auth API (e.g. current user endpoint, admin-only endpoints).
  - Configurable limits: defined in `backend/app/config.py`, overridden via environment variables (e.g. `LIMIT_PRO_CONVERSATIONS`, `LIMIT_STARTER_CONVERSATIONS`).
  - Changing a user's role via the CLI: from the backend directory, run `python scripts/set_user_role.py <email> <role>` (roles: `administrator`, `pro`, `starter`).
  - Database access: PostgreSQL, typically via Docker; connection details and `psql` usage are in `docs/developer.md`.
- **Roles, limits, and admin capabilities:** See `docs/authorization.MD` for the full authorization model and administrator capabilities.

The help bot should direct users to these docs for detailed or administrative procedures rather than reproducing long technical steps in chat.
