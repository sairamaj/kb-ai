# Notes & Knowledge Base Enhancement — User Stories by Phase

This document breaks the Notes feature into small, testable stories that can be implemented and validated one by one by an agent. Stories follow the requirement codes from `notes_feature_requirements.md`.

---

## Phase NB1 — Core Notes: Backend (Model + API)

Goal: Introduce the `Note` entity with full CRUD — no frontend or topic integration yet. This unblocks all later phases.

### NB-01 — Note database model and migration

**As a developer**, I want a persisted `Note` entity, so that users can store markdown notes independently of conversations.

**Acceptance criteria:**
- Alembic migration creates the `notes` table with columns: `id` (UUID PK), `owner_id` (UUID FK → `users`, CASCADE delete), `title` (String 512), `content` (Text), `tags` (ARRAY String), `visibility` (enum `private`|`public`, default `private`), `is_pinned` (Boolean, default false), `source_url` (Text nullable), `embedding` (Vector(1536) nullable), `created_at`, `updated_at`.
- `visibility` enum is created idempotently (same pattern as existing enums in the codebase).
- Index exists on `(owner_id, updated_at DESC)` for performant listing.
- pgvector index on `notes.embedding` is created (HNSW or IVFFlat, matching `conversations` if that index exists).
- `users` table gains `lifetime_notes_created` (Integer, default 0) column.
- ORM model `Note` added to `backend/app/models.py`.
- Migration rolls back cleanly with `alembic downgrade -1`.

**Validation checklist:**
- Run `alembic upgrade head` on a clean DB — no errors.
- Inspect schema: all columns and constraints present.
- Run `alembic downgrade -1` — table and enum removed cleanly.
- Re-apply migration — idempotent enum creation does not error.

---

### NB-02 — Note CRUD API

**As a user**, I want to create, read, update, and delete my notes via API, so that my notes are persisted in the knowledge base.

**Acceptance criteria:**
- New router at `backend/app/routers/notes.py` registered in `backend/app/main.py`.
- `POST /notes` — creates a note; requires `title` and `content`; optional `tags`, `visibility`. Returns `NoteDetail`. Increments `user.lifetime_notes_created`.
- `GET /notes` — returns paginated list of the authenticated user's notes (`NoteSummary[]`). Supports query params: `tags` (filter), `q` (text search on title + content), `pinned_first` (default true).
- `GET /notes/{id}` — returns `NoteDetail` for owner.
- `PATCH /notes/{id}` — partial update of `title`, `content`, `tags`, `visibility`, `is_pinned`. Returns updated `NoteDetail`.
- `DELETE /notes/{id}` — deletes note. Returns `204`.
- All write endpoints require authentication (`CurrentUser` dependency).
- Non-owner read/write/delete returns `403` or `404` per API policy.
- Invalid payloads return `422` with clear field-level errors.

**Validation checklist:**
- Create a note and verify it appears in the list.
- Update title and content; verify `updated_at` changes.
- Pin a note; verify it appears first in list with `pinned_first=true`.
- Delete a note; verify it no longer appears in list.
- Attempt CRUD as a different user; verify `403`/`404`.
- Submit empty title on create; verify `422`.

---

## Phase NB2 — Core Notes: Frontend (Editor + Library Tab)

Goal: Surface notes in the UI — a standalone editor and a Notes tab in the Library page.

### NB-06 — Note editor component

**As a user**, I want a split-pane markdown editor with live preview, so that I can write and format notes comfortably.

**Acceptance criteria:**
- New component `frontend/src/components/NoteEditor.tsx`.
- New TypeScript types file `frontend/src/types/note.ts` with `NoteSummary`, `NoteDetail`, `CreateNotePayload`, `UpdateNotePayload` interfaces matching the API.
- Editor shows raw markdown on the left (or full-width on mobile) and rendered preview on the right; a toggle switches between panes on mobile.
- Toolbar provides: bold, italic, heading (H2/H3), inline code, code block, bullet list, link.
- Rendering uses `react-markdown` + `remark-gfm`.
- Auto-save triggers after 2 s of inactivity; a "Saved" / "Saving…" indicator is shown.
- Tag editor uses the same chip-based pattern as conversation tags.
- Visibility toggle (`Private` / `Public`) is present.
- Unsaved changes prompt a confirmation before navigating away.

**Validation checklist:**
- Create a new note, type markdown; verify preview renders correctly.
- Wait 2 s idle; verify auto-save fires and indicator shows "Saved".
- Add and remove tags; verify they persist after save.
- Toggle visibility; verify change persists.
- Resize to mobile width; verify single-pane toggle works.

---

### NB-07 — Notes tab in Library page

**As a user**, I want a Notes tab in the Library, so that I can browse, create, and open all my notes in one place.

**Acceptance criteria:**
- `frontend/src/components/LibraryPage.tsx` gains a "Notes" tab alongside Conversations / Collections / Topics.
- Notes tab shows a list of `NoteSummary` cards. Each card displays: title, tag chips, content preview (~150 chars), `updated_at`, pin indicator.
- Pinned notes appear at the top.
- A "New Note" button opens `NoteEditor` in a side-panel or modal.
- Clicking an existing note card opens it in `NoteEditor`.
- Search/filter bar (already present on other tabs) filters notes by title/content.
- Empty state is shown when the user has no notes.

**Validation checklist:**
- Create three notes; verify all three appear in the Notes tab.
- Pin one note; verify it sorts to the top.
- Search for a word in a note's content; verify card appears.
- Click "New Note" → editor opens; save → new card appears without page reload.
- Click existing card → editor opens with correct content.
- Delete all notes → empty state is shown.

---

## Phase NB3 — Notes in Learning Topics

Goal: Allow notes to be added to Learning Topics alongside conversations, with unified ordering and replay support.

### NB-03 — Note–LearningTopic join table

**As a developer**, I want a `learning_topic_notes` join table with shared position ordering, so that notes and conversations can coexist in a single topic sequence.

**Acceptance criteria:**
- Alembic migration creates `learning_topic_notes` with: `learning_topic_id` (UUID FK → `learning_topics`, CASCADE), `note_id` (UUID FK → `notes`, CASCADE), `position` (Integer), `created_at`, `updated_at`.
- Composite uniqueness constraint on `(learning_topic_id, note_id)`.
- Index on `(learning_topic_id, position)` for ordered queries.
- ORM model `LearningTopicNote` added to `models.py`.

**Validation checklist:**
- Migration applies and rolls back cleanly.
- Duplicate insert for same topic+note raises integrity error.
- Ordered query by `position` returns deterministic results.

---

### NB-04 — Add/remove note from learning topic API

**As a user**, I want to add and remove notes from a Learning Topic, so that my topic can contain both notes and conversations.

**Acceptance criteria:**
- `POST /learning-topics/{id}/notes` — body `{ note_id: UUID }`. Appends note to end of topic (next available position). Returns updated topic items summary.
- `DELETE /learning-topics/{id}/notes/{note_id}` — removes the note from the topic. Note itself is not deleted.
- `POST /learning-topics/{id}/reorder` accepts a unified list of `{ type: "conversation"|"note", id: UUID }` objects, persisting new positions transactionally.
- Non-owner access is blocked.
- Adding a note not owned by the user is blocked (`403`).

**Validation checklist:**
- Add a note to a topic; verify it appears in topic detail at the last position.
- Add a conversation; verify positions are consistent.
- Remove the note; verify conversation remains and note is gone.
- Reorder so note is first; verify order persists on refresh.
- Attempt add/remove as a non-owner; verify `403`.

---

### NB-05 — Unified topic item list in API response

**As a developer**, I want the `LearningTopicDetail` API response to return a merged, position-ordered `items` list, so that the frontend has a single collection to render.

**Acceptance criteria:**
- `GET /learning-topics/{id}` response includes `items: LearningTopicItem[]` sorted by `position`.
- Each item has a `type` field: `"conversation"` or `"note"`.
- Conversation items include: `conversation_id`, `title`, `position`, and summary fields.
- Note items include: `note_id`, `title`, `content_preview` (first 200 chars), `position`, `tags`, `updated_at`.
- Existing fields (`conversations` legacy array if present) can be removed or kept for backward compatibility during transition.

**Validation checklist:**
- Topic with 2 conversations and 2 notes returns all 4 items in position order.
- Content preview is correctly truncated at 200 chars.
- Type discriminator is correct for each item.

---

### NB-08 — Notes in Learning Topic detail UI

**As a user**, I want to see and manage notes alongside conversations in a topic, so that my topic detail view reflects all content.

**Acceptance criteria:**
- Topic detail view renders `items` from the unified API response.
- Conversation items use the existing conversation card style; note items use a distinct card style with a "Note" icon/badge.
- "Add to topic" panel has two tabs: "Add Conversation" and "Add Note" (lists user's existing notes to pick from).
- Drag-and-drop reorder works across both conversation and note items.
- Removing a note from the topic (not deleting it) is available via a context menu or remove button.

**Validation checklist:**
- Topic with mixed items renders both types with correct badges.
- Add a note via "Add Note" tab; verify it appears in the list.
- Drag a note card above a conversation card; verify reorder persists.
- Remove a note from topic; verify note still exists in Library > Notes.

---

### NB-09 — Note slides in Topic Replay Mode

**As a user**, I want notes to appear as content slides during topic replay, so that my full learning sequence is playable end-to-end.

**Acceptance criteria:**
- `frontend/src/components/TopicReplayMode.tsx` handles items of type `"note"` in the replay sequence.
- When the current replay step is a note, the full markdown-rendered content is displayed as a single "slide" (no chat turns).
- A "Note" badge and the note's title are shown as the step header.
- Notes count toward the total step count (renamed from `total_messages` to `total_items` if not already generic).
- Next / Previous navigation works seamlessly across note slides and conversation turns.

**Validation checklist:**
- Build a topic: conversation (3 messages) → note → conversation (2 messages). Verify replay shows 6 steps total.
- On the note step, verify markdown renders correctly.
- Verify navigation skips correctly between conversation turns and the note slide.
- Verify progress indicator reflects the correct current/total counts.

---

## Phase NB4 — Public Sharing & Unified Search

Goal: Allow public note sharing and cross-content search.

### NB-10 — Public note sharing

**As a user**, I want to share a note via a public link, so that others can read it without logging in.

**Acceptance criteria:**
- `GET /notes/{id}/public` returns `NoteDetail` when `visibility=public`; returns `404` (or `403`) when `private`.
- New page `frontend/src/components/PublicNotePage.tsx` renders the note at route `/notes/:id` (unauthenticated).
- Route is registered in `frontend/src/App.tsx`.
- Public page renders markdown content, title, and tags; no edit controls are shown.
- "Copy link" button on `NoteEditor` is present when `visibility=public`.
- Page mirrors the design of `PublicConversationPage`.

**Validation checklist:**
- Set note to public; visit `/notes/{id}` while logged out — content renders.
- Set note to private; visit URL while logged out — `404` or redirect.
- Copy link button appears only when visibility is public.
- Public page has no edit/delete controls.

---

### ENH-06 — Unified full-text and semantic search

**As a user**, I want to search across both conversations and notes in a single query, so that I can find knowledge regardless of which content type it's in.

**Acceptance criteria:**
- New endpoint `GET /search?q=...&type=all|conversation|note` returns ranked results combining both `conversations` and `notes`.
- Full-text search runs on `title` and `content`/`summary` fields.
- If `embedding` is populated on both tables, vector similarity can contribute to ranking.
- Results include a `type` field (`"conversation"` or `"note"`) and enough metadata to render a result card.
- Frontend search bar in Library page gains an "All" option that calls this unified endpoint.
- Results are paginated consistently with existing list APIs.

**Validation checklist:**
- Search for a term present only in a note → note result returned.
- Search for a term present only in a conversation → conversation result returned.
- Search for a term in both → both returned, sorted by relevance.
- Filter `type=note` → only notes returned.
- Empty query returns `422` or empty results, not a server error.

---

## Phase NB5 — Enrichment Features

Goal: Strengthen the knowledge management experience with AI-powered and productivity features. Prioritize based on user feedback.

### ENH-01 — AI note summarization

**As a user**, I want to summarize any note or conversation with AI, so that I can build compressed study cards quickly.

**Acceptance criteria:**
- A "Summarize with AI" button is present on `NoteEditor` and `ConversationDetailPage`.
- Clicking triggers a call to `POST /chat/stream` with a summarize system prompt and the note/conversation content.
- The streamed AI response is displayed in a sidebar panel or appended as a locked "AI Summary" block.
- The summary is not auto-saved unless the user explicitly saves it.

**Validation checklist:**
- Click summarize on a long note; verify streaming response appears.
- Click summarize on a conversation; verify it summarizes the full transcript.
- Verify existing note content is not overwritten automatically.

---

### ENH-02 — Flashcard / Quiz Mode

**As a user**, I want to generate Q&A flashcards from a Learning Topic, so that I can practice active recall.

**Acceptance criteria:**
- A "Generate Flashcards" button appears on the Learning Topic detail page.
- Backend makes a single AI call with structured output to produce an array of `{ question, answer }` pairs.
- Flashcards are stored in a `flashcards` JSON column on `LearningTopic` (migration required).
- New `FlashcardMode` component shows one question at a time with a "Reveal Answer" toggle and Next/Previous navigation.
- Previously generated flashcards can be regenerated or discarded.

**Validation checklist:**
- Generate flashcards for a topic with mixed notes and conversations.
- Verify at least one Q&A pair is produced.
- Navigate through all cards with Next/Previous.
- Regenerate flashcards; verify new set replaces old set.

---

### ENH-03 — Web clip / URL import

**As a user**, I want to paste a URL and import its article content as a note, so that I can save web reading to my knowledge base.

**Acceptance criteria:**
- "Import from URL" option is present in the "New Note" dialog.
- Backend endpoint `POST /notes/import-url` accepts `{ url: string }`.
- Backend fetches the page, extracts article text (using `trafilatura` or `readability-lxml`), and returns pre-filled `title` and `content` (markdown).
- `source_url` field is populated on the created note.
- User reviews and edits the imported content before saving.
- Errors (unreachable URL, no article content) return a user-friendly message.

**Validation checklist:**
- Import a public article URL; verify title and content are populated.
- Verify `source_url` is saved on the note.
- Import an invalid URL; verify error message shown.
- Import a URL with paywalled content; verify graceful fallback (partial content or error).

---

### ENH-04 — Progress / Mastery Tracking

**As a user**, I want to mark topic items as reviewed and see my progress, so that I know what I've studied and what remains.

**Acceptance criteria:**
- Migration adds `reviewed_at` (DateTime nullable) and `mastery_level` (Integer 0–5, default 0) to both `learning_topic_conversations` and `learning_topic_notes` join tables.
- A "Mark as reviewed" button is visible per item in the topic detail and in replay mode.
- `LearningTopicDetail` API response includes a progress summary: `{ reviewed: N, total: N }`.
- Topic detail UI shows a progress bar (X of N items reviewed).
- Replay mode offers a "Unreviewed only" filter that skips already-reviewed items.

**Validation checklist:**
- Mark two of four items reviewed; verify progress bar shows 2/4.
- Enable "Unreviewed only" in replay; verify only unreviewed items appear.
- Mark remaining items; verify progress bar reaches 100%.
- Verify `reviewed_at` timestamp is set on API response.

---

### ENH-05 — Note templates

**As a user**, I want to start from a pre-built template when creating a note, so that I don't have to format common note structures from scratch.

**Acceptance criteria:**
- "New Note" dialog offers a template picker with at minimum: Meeting Notes, Study Notes, Book Summary, Concept Explanation.
- Templates are stored as static JSON in `frontend/src/config/noteTemplates.ts`.
- Selecting a template pre-fills the editor with the template markdown.
- User can edit the template content freely before saving.
- Selecting "Blank" starts with an empty editor (default).

**Validation checklist:**
- Select "Meeting Notes" template; verify editor pre-populates with expected skeleton.
- Edit a template and save; verify saved content matches edits, not original template.
- Select "Blank"; verify editor is empty.

---

### ENH-07 — Export Learning Topic as Markdown or PDF

**As a user**, I want to export a Learning Topic as a single document, so that I can print or share it outside the app.

**Acceptance criteria:**
- `GET /learning-topics/{id}/export?format=md|pdf` returns a downloadable file.
- Markdown export assembles all items in position order: conversations as message transcripts, notes as-is.
- PDF export renders the markdown (using a server-side library such as `weasyprint` or `pdfkit`).
- Filename is derived from the topic title.
- Export button is present on the topic detail page.

**Validation checklist:**
- Export a topic with 2 conversations and 1 note as markdown; verify all content is present in order.
- Export as PDF; verify file downloads and is readable.
- Export a topic with no items; verify graceful empty document.

---

### ENH-08 — Bi-directional note linking (wiki-style)

**As a user**, I want to link notes to each other using `[[Note Title]]` syntax, so that I can navigate my knowledge graph.

**Acceptance criteria:**
- Migration creates a `note_links` join table (`source_note_id`, `target_note_id`, both FK → `notes` CASCADE).
- On save, backend parses `[[...]]` tokens and resolves them to existing note IDs by title (case-insensitive, owner-scoped). Unresolved links are ignored.
- `note_links` are updated transactionally on each save.
- Rendered note (in `NoteEditor` preview and `PublicNotePage`) converts `[[Note Title]]` to a clickable internal link.
- `GET /notes/{id}` response includes `backlinks: NoteSummary[]` (notes that link to this note).
- A "Linked from" backlinks panel is shown at the bottom of `NoteEditor` and `PublicNotePage`.

**Validation checklist:**
- Create Note A and Note B. In Note A, type `[[Note B]]`. Save Note A.
- Verify `[[Note B]]` renders as a clickable link in preview.
- Open Note B; verify Note A appears in the backlinks panel.
- Rename Note B title and re-save Note A; verify link resolves or falls back gracefully.
- Delete Note A; verify `note_links` rows are removed (CASCADE).

---

## Definition of Done (per story)

- Story acceptance criteria pass end-to-end.
- Relevant automated tests are added or updated (unit + integration where applicable).
- Manual validation checklist is completed.
- No regressions in existing conversation, replay, library, or learning topic flows.
- Linter passes with zero warnings (`npm run lint` for frontend).
- If API shape changed, response types in `frontend/src/types/` are updated to match.
- Documentation updated if API or UX behavior changed.
