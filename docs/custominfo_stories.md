## Custom Info — Phased User Stories

This document defines a phased set of implementation stories for custom info (URL links, practiced samples, tips), derived from [docs/custominfo_requirements.md](custominfo_requirements.md). Each story is written so it can be handed to an agent for implementation. No code-level details are included; each story focuses on behavior, inputs/outputs, and acceptance criteria.

---

## Phase 1 — Data model and backend foundation

### CI-01 — Add custom info data model and migrations

**Goal:** Persist URL links, practiced samples, and tips per user with a clear schema so all custom info features can be built on top.

**Description:**
- Introduce Link, PracticedSample, and Tip entities (or equivalent) with fields as in custominfo_requirements (owner_id, url/title/content, tags, optional conversation_id, visibility, timestamps).
- Use the same PostgreSQL backend and auth; scope all by owner_id.
- Add Alembic migration(s).

**Behavior:**
- Each custom info type has a dedicated table or discriminated type; every row has owner_id.
- created_at and updated_at are set on create/update.

**Acceptance Criteria:**
- Given the schema, Link has url, title, optional description, tags, owner_id, visibility, timestamps.
- Given the schema, PracticedSample has title, content, tags, optional conversation_id, owner_id, visibility, timestamps.
- Given the schema, Tip has title, content, tags, optional conversation_id, owner_id, visibility, timestamps.
- Given the migrations, they run cleanly and are reversible.

---

### CI-02 — CRUD API for URL links

**Goal:** Allow authenticated users to create, read, update, and delete their URL links via the backend.

**Description:**
- Add REST (or equivalent) endpoints for links: create (POST), get one (GET), list (GET with optional filters), update (PATCH/PUT), delete (DELETE).
- All require auth; all operations are scoped to the current user's links only.

**Behavior:**
- Creating a link requires url and optionally title, description, tags.
- Listing supports pagination.
- Update/delete only on own links; 403 for others.

**Acceptance Criteria:**
- Given an authenticated user, they can create a link with url and optional title/description/tags and receive a persisted link.
- Given an authenticated user, they can list, get by id, update, and delete their links.
- Given a request for another user's link (by id), the API returns 403 or 404.

---

### CI-03 — CRUD API for practiced samples

**Goal:** Allow authenticated users to create, read, update, and delete their practiced samples.

**Description:**
- Same pattern as CI-02: create, get one, list, update, delete for practiced samples.
- Fields: title, content, optional tags, optional conversation_id. Scoped by owner.

**Behavior:**
- Content is text (or markdown); conversation_id, if present, links the sample to a conversation for later AI context.

**Acceptance Criteria:**
- Given an authenticated user, they can CRUD practiced samples with title, content, optional tags and conversation_id.
- Operations are scoped to the current user; other users' samples are not accessible.

---

### CI-04 — CRUD API for tips

**Goal:** Allow authenticated users to create, read, update, and delete their tips.

**Description:**
- Same pattern as CI-02/CI-03: create, get one, list, update, delete for tips.
- Fields: title, content, optional tags, optional conversation_id. Scoped by owner.

**Behavior:**
- Tips are short nuggets; same auth and scoping as links and samples.

**Acceptance Criteria:**
- Given an authenticated user, they can CRUD tips.
- Only the owner can list, update, or delete their tips; other users receive 403/404.

---

### CI-05 — Enforce custom info scoped per user

**Goal:** Ensure every custom info operation is tied to the authenticated user; no cross-user access.

**Description:**
- Reuse existing auth (JWT/session).
- All create operations set owner_id from current user.
- All read/update/delete operations filter by owner_id and reject access to other users' items.

**Behavior:**
- Unauthenticated requests to custom info endpoints receive 401.
- Authenticated users see only their own links, samples, and tips unless a future story adds public visibility.

**Acceptance Criteria:**
- Given an unauthenticated request to any custom info endpoint, the API returns 401.
- Given an authenticated user, list/get only return items where owner_id matches the current user.
- Given a valid token for user A, requesting user B's item by id returns 403 or 404.

---

## Phase 2 — Search and filter

### CI-06 — Search custom info by keyword

**Goal:** Users can search their links, samples, and tips by keyword over title, content, and tags.

**Description:**
- Add a search parameter (e.g. `q` or `search`) to the list endpoints for links, samples, and tips.
- Match using ILIKE (or tsvector when available) on title, content, and tags. Respect owner scope.

**Behavior:**
- When the user provides a search term, the list result includes only items that match the term in any of the searchable fields.
- Empty search returns all (subject to pagination).

**Acceptance Criteria:**
- Given a user with links/samples/tips, when they list with a search term, only matching items are returned.
- Given a search term that matches no items, an empty list is returned.
- Search is case-insensitive and scoped to the current user.

---

### CI-07 — Filter custom info by type and tag

**Goal:** Users can filter their custom info by type (link / sample / tip) and by tag so they can narrow results in the Library or dedicated custom-info views.

**Description:**
- List endpoints accept optional query params: `type` (link | sample | tip) and `tag` (one or more).
- If a unified "custom info" list endpoint exists, type filter restricts to that kind; tag filter restricts to items that have any of the given tags.

**Behavior:**
- Omitting filters returns all types / all tags.
- Combining search (CI-06) with type and tag filters narrows results accordingly.

**Acceptance Criteria:**
- Given a request with `type=link`, only links are returned.
- Given a request with `tag=python`, only items (of the requested type or all types) that have the tag "python" are returned.
- Filters are applied in addition to owner scope and optional search.

---

## Phase 3 — Association with conversations and collections

### CI-08 — Associate custom info with a conversation

**Goal:** Allow the user to attach a link, sample, or tip to a conversation so it can be used when continuing or replaying that conversation and for AI context.

**Description:**
- Support optional `conversation_id` on create/update for links, practiced samples, and tips.
- Validate that the conversation exists and is owned by the current user.
- Expose conversation_id in get/list responses so the UI can show "attached to conversation X".

**Behavior:**
- Attaching is optional. If conversation_id is set, it must refer to a conversation owned by the user.
- Listing a conversation's "attached" custom info can be done by filtering custom info by conversation_id.

**Acceptance Criteria:**
- Given an authenticated user who owns a conversation, they can create or update a link/sample/tip with that conversation_id.
- Given a conversation_id that does not exist or is not owned by the user, the API returns 400 or 404.
- Given a get or list response, conversation_id is included when set.

---

### CI-09 — Associate custom info with collections (optional)

**Goal:** Allow the user to attach custom info items to one or more collections so they appear in a collection context and can be used for AI context by collection.

**Description:**
- Add a many-to-many relationship between custom info (links, samples, tips) and collections (e.g. join table CustomInfoCollection or per-type link tables).
- Provide endpoints or payload fields to add/remove a custom info item from a collection.
- Only allow attaching to collections owned by the user.

**Behavior:**
- A link/sample/tip can belong to zero or more collections.
- Listing by collection returns both conversations and custom info in that collection. Scope all by owner.

**Acceptance Criteria:**
- Given a user's collection, they can attach their links/samples/tips to that collection.
- Given a list request for a collection, the response includes both conversations and custom info in that collection (or a documented way to fetch custom info for a collection).
- Attaching to another user's collection is rejected.

---

## Phase 4 — Library / unified "My knowledge" view

### CI-10 — Show custom info in Library or My knowledge view

**Goal:** Users see their custom info (links, samples, tips) alongside or within the same knowledge surface as their saved conversations.

**Description:**
- Extend the Library (or add a "My knowledge" view) to include custom info items.
- Display type (link/sample/tip), title, snippet or preview, and optional tags. Link to detail/edit for each item.
- Keep conversations as the primary object (e.g. conversations first, or a clear tab/section for custom info).

**Behavior:**
- The Library (or equivalent) shows both saved conversations and custom info.
- Custom info items have a clear type indicator and open to a detail or edit view. Navigation and entry points are documented.

**Acceptance Criteria:**
- Given a logged-in user, they can open Library (or My knowledge) and see their links, samples, and tips in addition to conversations.
- Each custom info item is identifiable by type and title and can be opened.
- The UX does not demote or hide conversations; AI-assisted content remains prominent.

---

### CI-11 — Filter Library view: Conversations only / Custom info only / All

**Goal:** Users can filter the unified view to show only conversations, only custom info, or both, with consistent search and sort.

**Description:**
- Add a filter (tabs, dropdown, or toggle) for "Conversations only", "Custom info only", and "All".
- When "Custom info only" is selected, apply the same search (and tag/type filters) as in Phase 2.
- Sorting options (e.g. most recent, oldest) apply to the current view.

**Behavior:**
- Changing the filter updates the list without leaving the page.
- Search and sort apply to the filtered set. Default can be "All" or "Conversations only" per product choice.

**Acceptance Criteria:**
- Given the Library (or My knowledge) view, the user can select Conversations only, Custom info only, or All.
- Given Custom info only, search and tag/type filters narrow the custom info list.
- Sort by date (or other supported sort) works for the active filter.

---

## Phase 5 — AI context integration (primary focus)

### CI-12 — Include relevant custom info in chat context

**Goal:** When the user is in an active chat, the system can include relevant custom info (links, tips, sample summaries) in the context sent to the AI assistant so the assistant can reference the user's own material.

**Description:**
- Before or when building the request to the chat API, optionally retrieve custom info that is "relevant" to the current conversation.
- Relevance can be: (a) custom info attached to the current conversation (conversation_id), (b) custom info in a collection that the user has associated with this conversation or selected for this chat, or (c) by tag match.
- Format a short summary or excerpt for each item and inject it into the system prompt or a context block. Do not exceed a reasonable context size (e.g. configurable limit).

**Behavior:**
- If the user has attached links/tips/samples to the conversation (or selected a collection), those items are included in the context.
- Optionally, tags or a "use my custom info" scope can further narrow or expand what is included.
- The assistant's responses can reference these items (e.g. "Based on your tip …", "You have a link …").

**Acceptance Criteria:**
- Given a conversation with attached custom info, when the user sends a message in that conversation, the backend includes the attached custom info (or a summary) in the context sent to the AI.
- Given no attached custom info and no selection, the chat behaves as today (no custom info).
- Given documentation, the mechanism (conversation attachment, collection, or tag) and context size limits are described.

---

### CI-13 — Let user choose to use custom info in this conversation

**Goal:** Give the user explicit control over whether their custom info is used in the current chat so they can turn it on when they want the assistant to use their links/tips/samples.

**Description:**
- Add a toggle or scope selector in the chat UI (e.g. "Use my custom info", "Include: this conversation's links & tips", or "Include: collection X").
- Persist the choice for the current conversation (draft or saved). When enabled, the backend applies the logic from CI-12; when disabled, no custom info is injected.

**Behavior:**
- Default can be "off" for new conversations.
- User can enable "use my custom info" and optionally narrow by "this conversation only" or "this collection".
- The assistant's context is updated accordingly on the next turn.

**Acceptance Criteria:**
- Given the chat UI, the user can turn "Use my custom info" on or off (and optionally select scope).
- Given it is on, the next message sent uses custom info in context per CI-12.
- Given it is off, no custom info is sent to the AI.
- The choice is persisted with the conversation when saved.

---

## Phase 6 — Visibility (optional for v1)

### CI-14 — Public/private visibility for custom info

**Goal:** Custom info items can be marked public or private so they can be shared via a link or kept private, aligned with conversation visibility.

**Description:**
- Add a `visibility` field (public | private) to links, practiced samples, and tips.
- Private items are visible only to the owner (current behavior).
- Public items are visible to anyone with the link (or listed in a public "custom info" feed if such a feed exists).
- Enforce visibility in all read endpoints: owner always sees their items; non-owners see only public items when explicitly requested (e.g. by id or public feed).

**Behavior:**
- Create/update accepts visibility; default is private.
- List endpoints for the owner return all their items; public feed or shared link returns only public items.
- Unauthenticated or other users cannot list or fetch private items.

**Acceptance Criteria:**
- Given a private custom info item, only the owner can read it via API or UI.
- Given a public item, a shareable URL or public feed can expose it to others.
- Given a non-owner requesting a private item by id, the API returns 403 or 404.
- Visibility is documented in the API and data model.

---

## Story mapping (quick reference)

| Phase | Story   | Focus |
|-------|---------|--------|
| 1     | CI-01   | Data model and migrations for Link, PracticedSample, Tip |
| 1     | CI-02   | CRUD API for URL links |
| 1     | CI-03   | CRUD API for practiced samples |
| 1     | CI-04   | CRUD API for tips |
| 1     | CI-05   | Custom info scoped per user (auth) |
| 2     | CI-06   | Search custom info by keyword |
| 2     | CI-07   | Filter by type and tag |
| 3     | CI-08   | Associate custom info with conversation |
| 3     | CI-09   | Associate custom info with collections (optional) |
| 4     | CI-10   | Show custom info in Library / My knowledge |
| 4     | CI-11   | Filter view: Conversations / Custom info / All |
| 5     | CI-12   | Include relevant custom info in chat context |
| 5     | CI-13   | User toggle: use custom info in this conversation |
| 6     | CI-14   | Public/private visibility for custom info (optional v1) |
