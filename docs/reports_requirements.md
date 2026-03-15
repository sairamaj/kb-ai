---
name: Reports requirements doc
overview: "Add a new requirements document in docs that defines administrator-only report pages: (1) user report with role, last accessed, visits, collections, conversations, and (2) model report with models and current costs, aligned with existing auth and data models."
todos: []
isProject: false
---

# Reports requirements document

## Objective

Create [docs/reports_requirements.md](docs/reports_requirements.md) that specifies requirements for administrator-only report pages. The doc will align with existing authorization ([docs/authorization.MD](docs/authorization.MD)), the shared `CurrentAdmin` pattern ([backend/app/auth.py](backend/app/auth.py)), and current data models ([backend/app/models.py](backend/app/models.py)).

## Document structure

- **Access control:** Report pages and any report APIs are administrator-only. Reference FR-AUTHZ-09/10 and the existing pattern: protect routes with `CurrentAdmin` (non-admins get HTTP 403). No new auth mechanism—reuse existing admin check.
- **Report 1 — Users:** Define the “User report” page with required columns/data:
  - User (identifier: e.g. id, email, display_name as appropriate).
  - Role (from `User.role`: administrator, pro, starter).
  - Last accessed (timestamp; not present today—call out that tracking may need to be added, e.g. `last_accessed_at` on User or from activity log).
  - Number of visits (count; not present today—define as “sessions” or “authenticated requests” and note that implementation may need new tracking or an activity table).
  - Number of collections (count of collections owned by user; derivable from `Collection` where `owner_id = user.id`).
  - Number of conversations (count of conversations owned by user; derivable from `Conversation` where `owner_id = user.id`).
- **Report 2 — Models and costs:** Define the “Model and costs” report:
  - List of models (e.g. distinct `Conversation.model` plus any models used by chat/help; today: gpt-4o, gpt-4o-mini, gemini-2.0-flash, etc.).
  - Current costs: define as “cost per model” (e.g. configured or stored unit cost) and/or “current period spend” if usage is tracked. Call out that the codebase does not yet have a cost/pricing store—requirements should state what “current costs” means (e.g. configured price per 1K tokens, or aggregated spend) so implementation can add config or tables as needed.
- **Non-functional:** Keep reports read-only; no side effects. Optional: pagination, export (CSV), or date filters can be noted as future scope or NFRs.
- **Data model / implementation notes:** Briefly note which existing fields support the reports today (User.role, Conversation/Collection counts by owner, Conversation.model) and which require new tracking (last accessed, visits, model cost configuration or usage aggregation).

## Key files to reference in the doc

- [docs/authorization.MD](docs/authorization.MD) — Administrator capabilities and FR-AUTHZ-09/10.
- [docs/developer.md](docs/developer.md) — How to protect admin-only endpoints with `CurrentAdmin`.
- [backend/app/models.py](backend/app/models.py) — User, Conversation, Collection (and that User has no last_accessed or visit count; Conversation has `model`).
- [backend/app/config.py](backend/app/config.py) — Exists for limits; no model-cost config yet.

## Out of scope for the requirements doc

- Actual implementation (backend routes, frontend pages, migrations).
- Exact definition of “visit” (e.g. per-session vs per-request)—to be decided in stories; the doc will state the requirement and that tracking may be new.
- Billing or payment integration; “current costs” is limited to what the report displays (configured or computed cost per model).

## Deliverable

Single new file: **docs/reports_requirements.md** (or .MD to match authorization.MD if you prefer). No code or schema changes in this task.
