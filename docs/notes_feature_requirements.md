---
name: Notes Feature Requirements
overview: Add a first-class Notes entity (markdown-based) to the knowledge base, allow notes to be added to Learning Topics alongside chat sessions, and introduce several complementary features to strengthen the app as a personal knowledge management tool.
todos:
  - id: save-requirements-doc
    content: Save the plan as docs/requirements_notes.md
    status: pending
isProject: false
---

# Notes & Knowledge Base Enhancement — Requirements Plan

## Goal

Extend Prompt KB from a chat-only knowledge base into a full personal knowledge management system. Users should be able to write their own markdown notes, attach them to Learning Topics alongside saved conversations, and have unified search and replay across both content types.

---

## Current Architecture (Relevant)

- `LearningTopic` links to `Conversation` via `LearningTopicConversation` join table (with `position` ordering).
- No `Note` model exists. Notes are referenced only in product copy and as the `description` field on topics.
- Conversations = saved AI chats (multi-message). There is no simpler "single document" content type.

---

## Core Feature: Markdown Notes (NB-01 – NB-10)

### NB-01 — Note Model (Backend)

New `notes` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `owner_id` | UUID FK → `users` | CASCADE delete |
| `title` | String(512) | |
| `content` | Text | Markdown body |
| `tags` | ARRAY(String) | Same as Conversation |
| `visibility` | Visibility enum | `private` \| `public` |
| `is_pinned` | Boolean | default false |
| `source_url` | Text nullable | For web-clipped notes |
| `embedding` | Vector(1536) nullable | For semantic search (matches Conversation) |
| `created_at` | DateTime | |
| `updated_at` | DateTime | auto-updated |

New `User.lifetime_notes_created` counter (Integer, default 0) for Starter-plan caps.

### NB-02 — Note CRUD API

New router at [`backend/app/routers/notes.py`](backend/app/routers/notes.py):

- `POST /notes` — create note (title + markdown content)
- `GET /notes` — list user's notes (paginated, filter by tags, search by text/semantic, pin first)
- `GET /notes/{id}` — get full note detail
- `PATCH /notes/{id}` — update title, content, tags, visibility, is_pinned
- `DELETE /notes/{id}` — delete note
- `GET /notes/{id}/public` — unauthenticated public read (when `visibility=public`)

### NB-03 — Note–LearningTopic Join Table

New `learning_topic_notes` table:

| Column | Type | Notes |
|--------|------|-------|
| `learning_topic_id` | UUID FK → `learning_topics` | CASCADE |
| `note_id` | UUID FK → `notes` | CASCADE |
| `position` | Integer | shared position space with conversations |
| `created_at` / `updated_at` | DateTime | |

This mirrors the existing `LearningTopicConversation` join table pattern.

### NB-04 — Add/Remove Note from Learning Topic

New endpoints on the learning topics router ([`backend/app/routers/learning_topics.py`](backend/app/routers/learning_topics.py)):

- `POST /learning-topics/{id}/notes` — add note (body: `{ note_id }`)
- `DELETE /learning-topics/{id}/notes/{note_id}` — remove note from topic
- Extend `POST /learning-topics/{id}/reorder` to accept a unified list of `{ type: "conversation"|"note", id: UUID }` items.

### NB-05 — Unified Topic Item in API Responses

Update `LearningTopicDetail` response to return a merged, position-ordered `items` list:

```json
{
  "items": [
    { "type": "conversation", "position": 0, "conversation_id": "...", "title": "...", ... },
    { "type": "note", "position": 1, "note_id": "...", "title": "...", "content_preview": "first 200 chars", ... }
  ]
}
```

### NB-06 — Note Editor (Frontend)

New `NoteEditor` component in [`frontend/src/components/NoteEditor.tsx`](frontend/src/components/NoteEditor.tsx):

- Split-pane editor: raw markdown on left, rendered preview on right (toggle on mobile).
- Toolbar: bold, italic, heading, code block, bullet list, link.
- Auto-save (debounced 2s) with saved-indicator.
- Tag editor (same chip-based pattern as conversation tags).
- Library: use `react-markdown` + `remark-gfm` for rendering; `@uiw/react-md-editor` or a lightweight textarea for editing.

### NB-07 — Notes in Library Page

Extend [`frontend/src/components/LibraryPage.tsx`](frontend/src/components/LibraryPage.tsx):

- Add "Notes" tab alongside Conversations/Collections/Topics.
- Note card shows: title, tag chips, content preview (first ~150 chars), updated_at, pin indicator.
- Create note button opens `NoteEditor` in a panel/modal.
- Clicking a note opens it in `NoteEditor` for read/edit.

### NB-08 — Notes in Learning Topic Detail

Update Learning Topic detail view and [`frontend/src/components/TopicReplayMode.tsx`](frontend/src/components/TopicReplayMode.tsx):

- Topic item list shows both conversation cards and note cards (distinguished by icon/badge).
- "Add to topic" panel has two tabs: "Add Conversation" and "Add Note".
- Reorder drag-and-drop works across both types.

### NB-09 — Notes in Replay Mode

Update `TopicReplayMode` to handle note items:

- When a replay step is a `note`, display the full markdown-rendered content as a single "slide" instead of a chat turn.
- Show a "Note" badge and the note title as the step header.
- Notes count toward `total_messages` (or rename to `total_items`).

### NB-10 — Public Note Sharing

- `GET /notes/{id}/public` returns note for unauthenticated users when `visibility=public`.
- New `PublicNotePage` component mirrors `PublicConversationPage`.
- Shareable link format: `/notes/{id}` (public route in `App.tsx`).

---

## Type Definitions (Frontend)

New file [`frontend/src/types/note.ts`](frontend/src/types/note.ts):

```typescript
export interface NoteSummary {
  id: string; title: string; tags: string[];
  content_preview: string; visibility: 'public'|'private';
  is_pinned: boolean; source_url: string | null;
  created_at: string; updated_at: string;
}
export interface NoteDetail extends NoteSummary { content: string; }
export interface CreateNotePayload { title: string; content: string; tags?: string[]; visibility?: 'public'|'private'; }
export interface UpdateNotePayload { title?: string; content?: string; tags?: string[]; visibility?: 'public'|'private'; is_pinned?: boolean; }
```

Update [`frontend/src/types/learningTopic.ts`](frontend/src/types/learningTopic.ts) to add `LearningTopicNoteItem` and a union `LearningTopicItem`.

---

## Database Migration

New Alembic migration:
- Create `notes` table and `learning_topic_notes` join table.
- Add `lifetime_notes_created` column to `users`.
- Create pgvector index on `notes.embedding`.

---

## Suggested Additional Enhancements

These extend the core notes feature to make the app a stronger knowledge management tool:

### ENH-01 — AI Note Summarization
Button on any note or conversation: "Summarize with AI" → calls `/chat/stream` with a summarize prompt → appended as a locked "AI Summary" note or shown as a sidebar panel. Helps users build compressed study cards.

### ENH-02 — Flashcard / Quiz Mode
From any Learning Topic, generate Q&A flashcard pairs via AI (one API call, structured output). Store as a `flashcards` JSON column on `LearningTopic`. New `FlashcardMode` component for active recall practice (show question → reveal answer).

### ENH-03 — Web Clip / URL Import
Input a URL in the "Create Note" dialog → backend fetches page HTML, strips to article text (using `trafilatura` or `readability-lxml`) → pre-fills note content as markdown. Populates `source_url` field. Allows saving web articles to topics.

### ENH-04 — Progress / Mastery Tracking
Add `reviewed_at` and `mastery_level` (0–5) to both `LearningTopicConversation` and `LearningTopicNote`. A "Mark as reviewed" button per item. `LearningTopicDetail` shows a progress bar (X of N items reviewed). Replay mode can filter to "unreviewed only".

### ENH-05 — Note Templates
Pre-built markdown templates (Meeting Notes, Study Notes, Book Summary, Concept Explanation). Shown as options when creating a new note. Templates stored as static JSON in frontend config.

### ENH-06 — Unified Full-Text + Semantic Search
Extend the library search bar to query across both `conversations` and `notes` in a single endpoint (`GET /search?q=...&type=all|conversation|note`). Both tables already have `embedding` columns — vector similarity can be computed together.

### ENH-07 — Export Learning Topic as Markdown / PDF
`GET /learning-topics/{id}/export?format=md|pdf` — backend assembles all conversations (as transcript) and notes (as-is) into a single ordered document. Useful for printing or sharing outside the app.

### ENH-08 — Bi-directional Linking (Wiki-Style)
Markdown syntax `[[Note Title]]` auto-resolves to internal links between notes. Backend keeps a `note_links` join table. Rendered notes show a "Linked from" backlinks panel.

---

## Implementation Phases

### Phase 1 — Core Notes (NB-01 to NB-07)
Backend model, migration, CRUD API, frontend Notes tab with editor. No topic integration yet.

### Phase 2 — Notes in Learning Topics (NB-03 to NB-05, NB-08, NB-09)
Join table, add/remove/reorder API, unified topic item list, replay mode note slides.

### Phase 3 — Public Sharing & Search (NB-10, ENH-06)
Public note page, unified search.

### Phase 4 — Enrichment (ENH-01 to ENH-08)
AI summarization, flashcards, web clip, progress tracking — prioritize based on user feedback.

---

## Files to Create / Modify

**New files:**
- [`backend/app/routers/notes.py`](backend/app/routers/notes.py)
- [`backend/alembic/versions/xxxx_add_notes.py`](backend/alembic/versions/)
- [`frontend/src/types/note.ts`](frontend/src/types/note.ts)
- [`frontend/src/components/NoteEditor.tsx`](frontend/src/components/NoteEditor.tsx)
- [`frontend/src/components/PublicNotePage.tsx`](frontend/src/components/PublicNotePage.tsx)

**Modified files:**
- [`backend/app/models.py`](backend/app/models.py) — add `Note`, `LearningTopicNote`, update `User`
- [`backend/app/main.py`](backend/app/main.py) — register notes router
- [`backend/app/routers/learning_topics.py`](backend/app/routers/learning_topics.py) — add note endpoints, unified item list
- [`frontend/src/types/learningTopic.ts`](frontend/src/types/learningTopic.ts) — add unified item types
- [`frontend/src/components/LibraryPage.tsx`](frontend/src/components/LibraryPage.tsx) — Notes tab
- [`frontend/src/components/TopicReplayMode.tsx`](frontend/src/components/TopicReplayMode.tsx) — note slide support
- [`frontend/src/App.tsx`](frontend/src/App.tsx) — public note route
