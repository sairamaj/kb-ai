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

#### Help-chat API (CB-02)

The help chatbot is exposed via a dedicated endpoint so the frontend can send questions without using the main conversation chat.

- **URL:** `POST /api/help/chat` (from the frontend; backend path is `POST /help/chat` after proxy rewrite).
- **Authentication:** Optional. If the request includes a valid auth cookie, the user is recognized for future personalization (Phase 2). Unauthenticated requests receive only generic/product-level answers.
- **Request body (JSON):**
  - **message** (string, required) — The user’s question.
  - **session_id** (string, optional) — Reserved for multi-turn help sessions (CB-08); currently unused.
- **Response (JSON):**
  - **answer** (string) — The help bot’s reply, grounded in the help knowledge source.
- **Behaviour:** The endpoint does not create or update conversations, collections, or user records; it is read-only for help purposes.