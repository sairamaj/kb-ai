---
name: New features and stories2
overview: Suggest new features for the Prompt Knowledge Base app (derived from requirements.md and stories.md) and define a stories2.md file containing user stories for those features.
todos: []
isProject: false
---

# New Features and stories2.md Plan

## Application summary

**Prompt Knowledge Base** is a web app where users chat with an OpenAI assistant, save conversations to a personal knowledge base, replay them step-by-step for review, organize with tags and collections, and share or discover public conversations. Stack: React (Vite) + FastAPI + PostgreSQL; auth via OAuth (Google/GitHub); search progresses from keyword (tsvector) to semantic (pgvector).

Existing [stories.md](stories.md) covers Phases 1–7: infra, auth, save, library, replay, public sharing, collections, and search v2. [requirements.md](requirements.md) §8 marks as out of scope for v1: mobile apps, multiple AI providers, real-time collaboration, fine-tuning/RAG, billing, and semantic search (later v2).

---

## Suggested new features (not in stories.md)

These add clear value and fit the existing product vision without duplicating current stories.


| Area                       | Feature                                                                          | Rationale                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Export**                 | Export conversation or collection as Markdown/PDF                                | Use content offline, in other tools, or for printing; natural for a “knowledge base”.       |
| **Import**                 | Import a conversation (paste or file upload)                                     | Grow KB from ChatGPT exports or other sources; no story covers ingestion.                   |
| **Model choice**           | Select model per conversation or in settings                                     | FR-CHAT-02 says “configurable model”; no story implements it.                               |
| **Custom instructions**    | Per-conversation or global system prompt / instructions                          | Align assistant behavior (tone, format, domain) without new UI surface beyond a text field. |
| **Duplicate**              | Duplicate a saved conversation                                                   | Branch or reuse as template; complements “Continue” (REPLAY-04).                            |
| **Favorites / pin**        | Star or pin conversations in Library                                             | Quick access and “pinned” section; LIB-03 only has sort, not prominence.                    |
| **Bulk actions**           | Multi-select in Library → bulk tag, add to collection, delete                    | Scale management when the library grows; only single-conversation actions exist.            |
| **Keyboard shortcuts**     | Global shortcuts (e.g. New chat, Search, Replay)                                 | Power users and accessibility; not covered today.                                           |
| **In-conversation search** | Find text within a single conversation (e.g. Ctrl+F)                             | Essential for long threads; library search is cross-conversation only.                      |
| **Templates**              | Start from a template (e.g. “Code review”, “Learning”) with preset system prompt | Faster, consistent starting points; extends custom instructions.                            |
| **Theme**                  | Dark/light (and optionally system) theme toggle                                  | NFR-UX-01 implies good UX; theme is a common ask.                                           |
| **RAG over KB (v2)**       | “Answer using my saved conversations”                                            | Explicitly out of scope for v1 in requirements but a natural v2 story to capture.           |


No new features suggested for: auth flow, core chat streaming, replay mechanics, or public sharing URLs — those are already specified.

---

## Proposed stories2.md structure

Create **stories2.md** in the repo root with the same format as [stories.md](stories.md): phased sections, story IDs, “As a … I want … so that …”, and acceptance criteria. Suggested grouping:

- **Phase 8 — Export & Import**  
  - Export conversation (Markdown + optional PDF).  
  - Export collection as Markdown (or ZIP of Markdown files).  
  - Import conversation from pasted text or file (e.g. OpenAI-style JSON/Markdown).
- **Phase 9 — Customization & Model**  
  - Model selection (per conversation or user default; list from config).  
  - Custom instructions / system prompt (per conversation and/or global default).  
  - Conversation templates (named templates with optional system prompt; “New from template” in UI).
- **Phase 10 — Library UX**  
  - Favorites / pin (toggle on conversation; pinned section or sort in Library).  
  - Bulk actions (select multiple → add tags, add to collection, delete; confirmation for destructive ops).  
  - Search within conversation (in-conversation find, e.g. Ctrl+F or dedicated field).
- **Phase 11 — Duplicate & Theme**  
  - Duplicate conversation (copy metadata + messages into new draft or saved conversation).  
  - Theme toggle (light / dark / system) with persistence.
- **Phase 12 — Keyboard shortcuts**  
  - Global shortcuts (New chat, Open search, Replay from detail; document in UI or help).
- **Phase 13 — Future (v2)**  
  - RAG over my KB: “Answer using my saved conversations” (semantic search over embeddings + inject into context).  
  - Optional: multiple AI providers (Anthropic, Gemini) as separate story.

Story IDs can follow the same pattern: **EXP-01**, **IMP-01**, **MOD-01**, **CUST-01**, **TMPL-01**, **FAV-01**, **BULK-01**, **SEARCH-03** (in-conversation), **DUP-01**, **THEME-01**, **KBD-01**, **RAG-01**, **PROV-01**. Each story will have 3–5 acceptance criteria in the style of stories.md.

---

## Deliverable

- **Single artifact:** [stories2.md](stories2.md) (new file in repo root).
- **Content:** Phases 8–13 as above, each story with title, user story sentence, and acceptance criteria. Story summary table at the end (optional but consistent with stories.md).

---

## Optional clarification

If you want **stories2.md** to be only “quick wins” (e.g. theme, shortcuts, duplicate, favorites) and keep export/import and RAG for a separate roadmap file, say so and the plan can split into “stories2.md — quick wins” and “backlog.md” or “roadmap.md” for the rest.