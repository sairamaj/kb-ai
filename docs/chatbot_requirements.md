---
name: Chatbot requirements doc
overview: Define and document requirements for an in-app help chatbot that answers user questions about the application, usage, and options, and write them to docs/requirements_chatbot.md in the same style as the existing requirements.md.
todos: []
isProject: false
---

# Chatbot Requirements Document Plan

## Objective

Produce **[docs/requirements_chatbot.md](docs/requirements_chatbot.md)** with formal requirements for a **help chatbot** that answers user questions about:

- What the application does and how to use it
- Features (chat, save, replay, library, collections)
- Options and limits (roles, conversation/collection limits, visibility, tags)
- Where to find things (e.g. auth/me, library search, replay)

The document will follow the structure and style of [docs/requirements.md](docs/requirements.md) (sections, numbered FR/NFR IDs, tables where useful) so it can be implemented and tested later.

---

## Document Structure for `docs/requirements_chatbot.md`

### 1. Product vision / purpose

- **Purpose:** In-app assistant that answers questions about the Prompt Knowledge Base application (features, usage, roles, limits, navigation) so users can self-serve without leaving the app.
- **Distinction:** This is **not** the main AI chat (which is for building knowledge via conversations). The help chatbot is scoped to *application help* only.

### 2. Functional requirements

- **FR-CB-01** — The chatbot answers questions about: product vision and core features (chat, save, replay, library, collections); how to perform common tasks (e.g. save a conversation, use replay, create a collection, search the library); roles (administrator, Pro, Starter) and what they mean; resource limits (conversation/collection limits per role, where they are configured); visibility (public vs private) and sharing; and where to find documentation or admin tools (e.g. developer doc, role management).
- **FR-CB-02** — Answers are based on a defined **knowledge source** (e.g. curated content derived from [docs/requirements.md](docs/requirements.md), [docs/developer.md](docs/developer.md), [docs/authorization.MD](docs/authorization.MD), and optionally [docs/authorization_stories.md](docs/authorization_stories.md)), so the bot stays accurate and on-topic.
- **FR-CB-03** — The bot can optionally use **current user context** when the user is authenticated (e.g. role, usage counts such as “3/5 conversations”) to personalize answers (e.g. “With your Starter plan you can have up to 5 conversations; you currently have 3.”).
- **FR-CB-04** — The user interacts via a **chat-style UI** (messages, input, send). Whether the interaction is single-turn (one Q, one A) or multi-turn (follow-up questions) can be specified as a design choice in the requirements.
- **FR-CB-05** — The help chatbot is **available in-app** (e.g. floating button, dedicated “Help” page, or both). Optionally: available to unauthenticated visitors on a landing or public page, with answers limited to public/product overview (no user-specific limits).
- **FR-CB-06** — When the question is out of scope (e.g. general knowledge, other products, or clearly not about this app), the bot responds with a polite redirect (e.g. “I can only answer questions about this application. Try asking how to save a conversation or what the Pro plan includes.”).
- **FR-CB-07** — The bot does **not** perform actions (e.g. create conversation, change role); it only explains how to do things and where to find options.

### 3. Knowledge source and content

- **Knowledge base:** Define that the bot’s answers are grounded in:
  - Product/feature description and flows from `requirements.md`
  - Auth API, configurable limits, CLI role management, DB access from `developer.md`
  - Roles, limits table, and admin capabilities from `authorization.MD`
- **Format:** Requirements will state that the implementation must use this content (e.g. via RAG over these docs, or a curated prompt/knowledge bundle built from them). The exact mechanism (RAG vs static prompt) can be left as an implementation note.

### 4. Non-functional requirements

- **NFR-CB-01** — Responses must be **accurate and consistent** with the official docs; no invented limits or features.
- **NFR-CB-02** — **Latency:** Response time should be acceptable for help (e.g. first token within a few seconds); streaming is optional but recommended for consistency with the main chat.
- **NFR-CB-03** — **Security:** The bot must not expose sensitive implementation details (e.g. internal API paths not documented for users, secrets). When user context is used, only role and non-sensitive usage counts may be included.
- **NFR-CB-04** — **Scope:** The bot must refuse or redirect off-topic or harmful requests and stay within application-help scope.

### 5. User experience (summary)

- Where the chatbot appears (in-app only vs also on landing), how the user opens it (button, link, route), and whether it is single-turn or multi-turn will be stated clearly so UX and implementation can align.

### 6. Out of scope (v1)

- Billing or subscription flows (how to upgrade to Pro)
- Answering questions about the *content* of the user’s saved conversations (that remains the main chat’s role)
- Replacing or duplicating the main AI chat
- Support for multiple languages (if not already in scope for the app)

### 7. Architecture / implementation notes (brief)

- One or two sentences: help chatbot can be a separate endpoint (e.g. `/api/help/chat` or similar) that uses the same or a dedicated LLM call, with access to the knowledge source and optional `current_user`; frontend component(s) for the help UI. Reference existing stack (FastAPI, React, OpenAI) for consistency.

---

## Key references in the codebase


| Topic                                                    | Source                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Product vision, chat, save, replay, library, collections | [docs/requirements.md](docs/requirements.md)                                                                                  |
| Auth API, limits config, CLI role script, DB             | [docs/developer.md](docs/developer.md)                                                                                        |
| Roles, limits table, admin capabilities                  | [docs/authorization.MD](docs/authorization.MD)                                                                                |
| Limit values (Pro/Starter)                               | [backend/app/config.py](backend/app/config.py) (for implementation; doc can reference “configurable limits” per developer.md) |


---

## Deliverable

A single new file: **docs/requirements_chatbot.md**, containing the sections above, written in clear requirement form (FR-CB-xx, NFR-CB-xx) so it can be used for implementation and acceptance criteria. No code or config changes in this task—only the new doc.