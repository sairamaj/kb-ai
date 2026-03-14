# Help knowledge source (CB-01)

This directory contains the **help knowledge** used by the in-app help chatbot. It is the single place that defines what the bot is allowed to say about the application.

## Relationship to documentation

The content in `content.md` is derived from the project’s official docs:

| Source | What it contributes |
|--------|----------------------|
| `docs/requirements.md` | Product vision, core features (chat, save, replay, library, collections), data model, tech stack. |
| `docs/developer.md` | Auth API, configurable limits, CLI role script, database access. |
| `docs/authorization.MD` | Role names, resource limits by role, administrator capabilities. |

The help knowledge does not replace these docs; it provides a curated, bot-friendly summary so that answers stay accurate and aligned with them.

## What the knowledge covers

- **Product vision** — What the app is and why it exists.
- **Core features** — How to use chat, save, replay, library, and collections.
- **Roles and limits** — Role names (Administrator, Pro, Starter), conversation/collection limits (including that they are configurable per deployment), and semantics (e.g. Starter lifetime cap vs Pro current total).
- **Visibility** — Public vs private conversations and collections.
- **Pointers to developer/admin docs** — Where to find detailed or administrative information.

## How to update when docs change

1. **Edit `content.md`** — When `docs/requirements.md`, `docs/developer.md`, or `docs/authorization.MD` change, update the corresponding sections in `content.md` so help answers remain accurate.
2. **Keep limits in sync** — If limit defaults or config names change in `backend/app/config.py` or the authorization doc, update the limits section in `content.md` (and note when values are configurable).
3. **Restart or clear cache** — The backend caches the content in memory after first load. Restart the backend to pick up file changes, or call `app.help_knowledge.clear_help_knowledge_cache()` if you need to reload without restarting.

## How the backend uses it

- **Load at runtime:** `from app.help_knowledge import get_help_knowledge` returns the full markdown string.
- **Path for tooling:** `get_help_knowledge_path()` returns the path to `content.md` for build-time steps or RAG ingestion if you add them later.

The help-chat API (CB-02) and answer-generation logic (CB-03) use this content to ground responses; they must not invent features or limits that are not in this knowledge source.
