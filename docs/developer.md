### Auth API — current user

`GET /api/auth/me` (requires authenticated cookie) returns the current user:

- **id** (string) — user UUID
- **email** (string)
- **display_name** (string)
- **avatar_url** (string | null)
- **role** (string) — one of `administrator`, `pro`, `starter`

Unauthenticated requests receive 401; no role is returned.

#### Admin-only endpoints (AUTHZ-05)

Admin-only operations use a shared dependency so behaviour is consistent. In the backend, inject `CurrentAdmin` from `app.auth`; it enforces the current user has role `administrator` and returns the full User—non-admins get HTTP 403.

```python
from app.auth import CurrentAdmin

@router.patch("/admin-only-action")
async def admin_only_action(_admin: CurrentAdmin, ...) -> ...:
    ...
```

Role management (e.g. `PATCH /users/{user_id}/role`) is already protected this way.

#### Configurable limits (AUTHZ-14)

Conversation and collection limits for **Pro** and **Starter** roles are defined in one place and can be changed without editing authorization logic.

- **Where they are defined:** `backend/app/config.py`. Values are read from environment variables with sensible defaults.
- **What to set (optional):**
  - `LIMIT_PRO_CONVERSATIONS` — max conversations a Pro user can own at once (default: 100)
  - `LIMIT_STARTER_CONVERSATIONS` — lifetime cap on conversations for Starter (default: 5)
  - `LIMIT_PRO_COLLECTIONS` — max collections a Pro user can own at once (default: 50)
  - `LIMIT_STARTER_COLLECTIONS` — lifetime cap on collections for Starter (default: 5)
- **How to adjust:** Set the variables in `backend/.env` or your deployment environment and restart the backend. Invalid or negative values fall back to the default. All limit checks (conversation creation, collection creation, and `/auth/me` usage) use these values.

#### Changing a user's role (CLI)

From the **backend** directory, run:

```powershell
python scripts/set_user_role.py <email> <role>
```

Roles: `administrator`, `pro`, `starter`. Example:

```powershell
python scripts/set_user_role.py admin@example.com administrator
```

When run on your machine (not in Docker), the script uses `localhost:5432` by default so it connects like `psql`. If you use a `backend/.env` that has `DATABASE_URL` with host `db`, set `DATABASE_HOST=localhost` before running the script. Ensure the DB is reachable (e.g. `docker-compose up`).

---

### Viewing the database data

This project uses PostgreSQL running in Docker, configured via `docker-compose.yml` and `backend/.env`.

- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `kb_db`
- **User**: `kb_user`
- **Password**: `kb_password`

#### 1. Start the stack

From the repo root:

```powershell
docker-compose up
```

Use `docker-compose up -d` to run in the background.

#### 2. Connect with `psql` from your machine

If the PostgreSQL client is installed:

```powershell
psql "postgresql://kb_user:kb_password@localhost:5432/kb_db"
```

Then, for example:

```sql
\dt;
SELECT * FROM users LIMIT 10;
SELECT * FROM conversations LIMIT 10;
SELECT * FROM messages LIMIT 10;
```

#### 3. Connect from inside the DB container

First, find the DB container name:

```powershell
docker ps
```

Then exec into it (replace `<db_container_name>` accordingly):

```powershell
docker exec -it <db_container_name> psql -U kb_user -d kb_db
```

The same `\dt` and `SELECT` queries work there as well.

* Install
  ```cmd
  choco install postgresql --params '/Password:postgres'
  ```

---

### Help chatbot — knowledge source (CB-01)

The in-app help chatbot uses a single, curated knowledge source so answers stay accurate and aligned with official documentation.

- **Location:** `backend/app/help_knowledge/content.md` (and `backend/app/help_knowledge/README.md` for full description).
- **Source docs:** Content is derived from `docs/requirements.md`, this file (`docs/developer.md`), and `docs/authorization.MD`.
- **Loading at runtime:** Use `from app.help_knowledge import get_help_knowledge` to get the full text; the help-chat API uses this to ground responses.
- **Updating:** When any of the source docs change, update `content.md` accordingly and restart the backend (or clear the in-memory cache). See `backend/app/help_knowledge/README.md` for the update process.

#### In-app help entry point (CB-06)

Users can open the help chatbot from anywhere in the main app:

- **Help button:** Click **Help** in the header (Chat, Library, or Conversation detail). The button is styled in amber to distinguish it from the main chat.
- **Route:** Navigating to `/help` opens the help page directly. The help UI is labeled **App help** and is visually distinct from the main knowledge-base chat (amber accent, question-mark icon, and copy that states it is for application questions only).
- **Chat UI (CB-07):** The help page provides a chat-style interface: message list (user and assistant bubbles), text input, and send. Only the help-chat endpoint is called; no main conversation or conversation endpoints are used.

#### Help-chat API (CB-02)

The help chatbot is exposed via a dedicated endpoint so the frontend can send questions without using the main conversation chat.

- **URL:** `POST /api/help/chat` (from the frontend; backend path is `POST /help/chat` after proxy rewrite).
- **Authentication:** Optional. Unauthenticated access is supported. See **Security and unauthenticated access** below for scope.
- **Request body (JSON):**
  - **message** (string, required) — The user’s question.
  - **history** (array, optional) — **CB-08 multi-turn:** Prior turns in this help session. Each element is `{ "role": "user" | "assistant", "content": string }`. The backend uses this as conversation context so follow-ups (e.g. “How do I open it?” after “What is replay mode?”) are answered in context. Stateless: no server-side session; the frontend sends the full history each time. Capped to the last 20 messages (10 turns) to avoid token overflow.
  - **session_id** (string, optional) — Unused; history is passed in the request body.
- **Response (JSON):**
  - **answer** (string) — The help bot’s reply, grounded in the help knowledge source.
- **Behaviour:** The endpoint does not create or update conversations, collections, or user records; it is read-only for help purposes. It does not receive or use the user’s main-app conversation history—only the help-session history sent in the request.

#### Grounding help answers (CB-03)

Every help response is grounded in the help knowledge source so the bot does not invent features, limits, or procedures.

- **Knowledge source:** The full content of `content.md` is injected into the system prompt as the single source of truth. The model is instructed to base answers only on this content.
- **Role names and limits:** Answers use the exact role names (Administrator, Pro, Starter) and correct limit semantics: Starter = lifetime creation caps; Pro = current total; Administrator = unlimited.
- **Limit values:** The backend injects the current configured limits from `backend/app/config.py` (e.g. `LIMIT_PRO_CONVERSATIONS`, `LIMIT_STARTER_CONVERSATIONS`) into the prompt so answers cite accurate numbers. The model is instructed to note that limits are configurable per deployment.
- **Out-of-scope:** Questions not about the application are handled by a polite redirect (see CB-04); the bot does not attempt to answer them from general knowledge.

#### Security and unauthenticated access (Phase 4 — CB-09, CB-10)

- **Unauthenticated access:** The help-chat endpoint can be called without authentication. Unauthenticated users receive only **public/product-level** answers: product vision, feature list, role names and general limits (e.g. “Starter has a limit of 5 conversations”), and where to find more info. They do **not** receive “your plan,” “your usage,” or any personalized data. For questions like “What are my limits?”, the response describes limits in general (by role) and does not include personalized counts.
- **Authenticated access:** When the request includes a valid auth cookie, the backend may attach the user’s role and usage (conversation/collection counts) and personalize answers (e.g. “With your Starter plan you currently have 3 of 5 conversations”) per CB-05.
- **Security (CB-09):** Responses are grounded in the help knowledge source and must not expose secrets, API keys, undocumented internal URLs or paths, or invented features/limits. The system prompt enforces this; the backend also runs a lightweight response check and, if sensitive-looking patterns are detected, returns a safe generic message instead of the raw model output.