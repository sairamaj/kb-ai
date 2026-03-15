---
name: Reports stories doc
overview: Add docs/reports_stories.md with phased, agent-ready implementation stories for administrator-only reports, derived from reports_requirements.md and following the same format as authorization_stories.md and chatbot_stories.md.
todos: []
isProject: false
---

# Reports phased stories document

## Objective

Create [docs/reports_stories.md](docs/reports_stories.md) containing phased implementation stories for the reports feature. Stories are derived from [docs/reports_requirements.md](docs/reports_requirements.md) and written in the same style as [docs/authorization_stories.md](docs/authorization_stories.md) and [docs/chatbot_stories.md](docs/chatbot_stories.md) so they can be handed to an agent for implementation. Each story has **Goal**, **Description**, **Behavior**, and **Acceptance Criteria** (Given/When/Then where applicable).

## Story ID convention

Use prefix **REP-** (e.g. REP-01, REP-02). Order stories by phase and dependency.

## Phase breakdown

### Phase 1 — Admin-only report access and scaffolding

- **REP-01 — Restrict report APIs to administrators**  
Reuse `CurrentAdmin` from [backend/app/auth.py](backend/app/auth.py). Add report routes under an admin scope (e.g. `/api/admin/reports/...` or a dedicated reports router that uses `CurrentAdmin`). Non-admins receive HTTP 403. No new auth mechanism.
- **REP-02 — Expose report entry to administrators in the frontend**  
Ensure the frontend can determine if the current user is an administrator (using existing `/auth/me` role). Add navigation or route(s) for “Reports” or “Admin reports” visible only to administrators. Unauthenticated or non-admin users do not see report links and receive 403 if they hit report URLs directly.

### Phase 2 — User report (backend)

- **REP-03 — User report: existing data (role, collections, conversations)**  
Implement an admin-only endpoint (e.g. `GET /api/admin/reports/users`) that returns one row per user with: user identifier (e.g. id, email, display_name), role, number of collections (count by `owner_id`), number of conversations (count by `owner_id`). Use existing [User](backend/app/models.py), [Collection](backend/app/models.py), [Conversation](backend/app/models.py) models; no new schema. Response shape is stable and documented.
- **REP-04 — User report: track last accessed time**  
Add optional tracking of “last accessed” per user (e.g. `last_accessed_at` on User, or equivalent). Update this timestamp when the user performs an authenticated action (e.g. on `/auth/me` or a defined set of endpoints). Include `last_accessed_at` in the user report API; if not yet implemented, return null. Migration and update strategy to be implemented in this story.
- **REP-05 — User report: track number of visits**  
Define “visit” (e.g. one per authenticated session or per successful auth check) and add tracking (e.g. `visit_count` on User incremented on login or middleware, or an activity table). Include visit count in the user report API. If deferred, return 0 or null and document. Implementation choice (field vs activity table) left to the agent with a clear acceptance criterion.

### Phase 3 — Model and costs report (backend)

- **REP-06 — Model report: list of models**  
Implement an admin-only endpoint (e.g. `GET /api/admin/reports/models`) that returns the list of models in use: distinct values from `Conversation.model` and, if applicable, models used by chat or help (from [backend/app/routers/chat.py](backend/app/routers/chat.py), [backend/app/routers/help.py](backend/app/routers/help.py)). Response includes at least model identifier/name per row.
- **REP-07 — Model report: current costs**  
Add a notion of “current cost” per model. Options: (a) config or env (e.g. cost per 1K tokens per model in [backend/app/config.py](backend/app/config.py) or a new config module), (b) a dedicated table or store. Include in the model report API a “cost” or “current cost” field per model (e.g. configured unit cost; optional: aggregated spend if usage is tracked). Document where cost values are defined and how to update them. If full cost aggregation is out of scope, “current cost” may be “configured unit cost” only.

### Phase 4 — Report pages (frontend)

- **REP-08 — User report page**  
Add an administrator-only page that displays the user report: table (or list) with columns for user (identifier), role, last accessed, number of visits, number of collections, number of conversations. Data comes from the user report API (REP-03, REP-04, REP-05). Read-only; no side effects. Optional: pagination, export (CSV), or filters noted as future scope or NFR.
- **REP-09 — Model and costs report page**  
Add an administrator-only page that displays the model report: table (or list) with model name and current cost. Data comes from the model report API (REP-06, REP-07). Read-only. Optional: sort, export, or date range as future scope.

## Document structure (reports_stories.md)

- **Intro paragraph:** State that the doc is derived from `docs/reports_requirements.md`, defines phased implementation stories for administrator-only reports, and is intended for agent-driven implementation. No code-level details; focus on behavior, inputs/outputs, and acceptance criteria.
- **Phases 1–4** as above, with each story in the same format as authorization_stories.md (Goal, Description, Behavior, Acceptance Criteria).
- **Optional:** Short “Story mapping” or “Dependencies” note linking REP-03/04/05 to the user report page and REP-06/07 to the model report page.

## Files to reference inside reports_stories.md

- [docs/reports_requirements.md](docs/reports_requirements.md) — source requirements
- [docs/authorization.MD](docs/authorization.MD) — FR-AUTHZ-09/10, admin capabilities
- [docs/developer.md](docs/developer.md) — `CurrentAdmin` usage
- [backend/app/auth.py](backend/app/auth.py) — `CurrentAdmin` / `require_admin`
- [backend/app/models.py](backend/app/models.py) — User, Conversation, Collection

## Out of scope for the stories doc

- Implementation code or file-level edits (the doc only specifies stories).
- Billing or payment integration; “current costs” remains display/configuration only.
- Exact URL paths (e.g. `/api/admin/reports/users`) can be suggested in stories but may be adjusted by the agent.

## Deliverable

Single new file: **docs/reports_stories.md** containing the intro and all phases/stories (REP-01 through REP-09) in the format used by authorization_stories.md and chatbot_stories.md.