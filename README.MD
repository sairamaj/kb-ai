# Prompt Knowledge Base

Prompt Knowledge Base is a web app where you can chat with an AI assistant, save conversations to your personal knowledge base, replay them step-by-step for review, and organize content with tags and collections.

## Running the application

### Prerequisites

- **Docker & Docker Compose** (recommended), or
- **Node.js** (frontend) and **Python 3.11+** (backend) if you run services manually

### Option 1: Run everything with Docker (recommended)

From the project root:

```bash
docker-compose up
```

- **Frontend:** http://localhost:5173  
- **Backend API:** http://localhost:8000  
- **PostgreSQL:** localhost:5432  

### Option 2: Run frontend only

```bash
cd frontend
npm install
npm run dev
```

Frontend will be at http://localhost:5173. It expects the backend at the URL configured by the Vite proxy (e.g. `http://localhost:8000` when running backend separately).

### Option 3: Run backend only

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend runs at http://localhost:8000. Ensure PostgreSQL is running and migrations are applied (see below).

### Environment and database

1. **Environment variables**  
   Copy `backend/.env.example` to `backend/.env` and set at least:
   - `OPENAI_API_KEY` — required for chat
   - `SECRET_KEY` — JWT signing (e.g. `python -c "import secrets; print(secrets.token_hex(32))"`)
   - Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` for OAuth.

2. **Database migrations**  
   See [Database upgrade instructions](#database-upgrade-instructions) below.

---

### Database upgrade instructions

When the schema changes (e.g. after pulling new code or adding a migration), apply migrations so the database stays in sync.

**With Docker (recommended)**  
- Migrations run **automatically** when the backend container starts: the backend image runs `alembic upgrade head` before starting uvicorn.
- After pulling changes that include a new migration, **restart the backend** so it runs again:
  ```bash
  docker-compose restart backend
  ```
- If you already restarted and the app still errors (e.g. missing column), run migrations manually inside the container:
  ```bash
  docker-compose exec backend alembic upgrade head
  ```
- You do **not** need to rebuild the image; migration files are on the host and mounted into the container.

**Without Docker**  
- Run migrations yourself after starting PostgreSQL:
  ```bash
  cd backend && alembic upgrade head
  ```
- Run this again whenever you pull or add a new migration.

**Useful commands**  
- Apply all pending migrations: `cd backend && alembic upgrade head`
- Create a new migration: `cd backend && alembic revision -m "describe change"`
- Rollback one migration: `cd backend && alembic downgrade -1`

### Production backend image (Z4-01)

The backend Dockerfile is multi-stage. Use the **production** image (no `--reload`) for deployment (e.g. Azure App Service).

- **Build production image** (from repo root):
  ```bash
  docker build --target prod -t promptkb-api ./backend
  ```
  Omitting `--target prod` also builds the production stage (it is the default).

- **Run production container** (requires a running PostgreSQL and env):
  ```bash
  docker run --rm -p 8000:8000 \
    -e DATABASE_URL="postgresql+asyncpg://user:pass@host:5432/dbname" \
    -e SECRET_KEY="your-secret" \
    -e OPENAI_API_KEY="sk-..." \
    promptkb-api
  ```
  The container runs `alembic upgrade head` then `uvicorn app.main:app --host 0.0.0.0 --port 8000` (no reload). File changes on the host do not trigger restarts.

- **Health and readiness:** `GET http://<container>:8000/health` returns HTTP 200 with `{"status": "ok", "db": "ok"}` when the app and database are healthy, or HTTP 503 with `{"status": "degraded", "db": "error"}` when the database is unreachable. Use this for platform health/readiness probes.

- **Development image** (with `--reload`): `docker-compose` builds the backend with `target: dev`. To build the dev image manually: `docker build --target dev -t promptkb-api:dev ./backend`.

**How to test the production backend image locally**

1. **Start a database** (e.g. `docker-compose up -d db` from repo root).
2. **Build the production image:**  
   `docker build --target prod -t promptkb-api ./backend`
3. **Run the container** with the same `DATABASE_URL` as your running DB (e.g. if using compose's `db` service, use `postgresql+asyncpg://kb_user:kb_password@host.docker.internal:5432/kb_db` on Docker Desktop, or run the backend on the same Docker network as `db` and use `postgresql+asyncpg://kb_user:kb_password@db:5432/kb_db`).
4. **Check health:**  
   `curl http://localhost:8000/health`  
   Expect HTTP 200 and `{"status":"ok","db":"ok"}` when the DB is reachable. If the DB is down or unreachable, expect HTTP 503 and `{"status":"degraded","db":"error"}`.
5. **Confirm no reload:** Change a file in `backend/` (e.g. add a comment in `main.py`) and confirm the running container does **not** restart or reload.

Example (backend on same network as compose `db`; replace `kb_default` with your project’s network name from `docker network ls` if different):

```bash
docker build --target prod -t promptkb-api ./backend
docker run --rm -p 8000:8000 --network kb_default \
  -e DATABASE_URL=postgresql+asyncpg://kb_user:kb_password@db:5432/kb_db \
  -e SECRET_KEY=test-secret \
  promptkb-api
```

Then in another terminal: `curl http://localhost:8000/health`.

### Production frontend image (Z4-02)

The frontend Dockerfile is multi-stage. Use the **production** image (static build served by nginx, no Vite dev server) for deployment (e.g. Azure App Service).

- **Build production image** (from repo root):
  ```bash
  docker build --target prod -t promptkb-web ./frontend
  ```
  To point the app at your backend API at build time (required when frontend and backend are on different origins):
  ```bash
  docker build --target prod --build-arg VITE_API_BASE_URL=https://promptkb-api.azurewebsites.net -t promptkb-web ./frontend
  ```
  Omitting `--target prod` also builds the production stage (it is the default).

- **Run production container:**
  ```bash
  docker run --rm -p 8080:8080 promptkb-web
  ```
  The container serves the SPA on port 8080. Open `http://localhost:8080/`. API calls from the browser use the backend URL set at build time via `VITE_API_BASE_URL`, or the dev proxy path `/api` if not set (suitable only when frontend is proxied to the same backend).

- **Acceptance:** `GET http://<container>:8080/` returns HTTP 200 and the app loads; requests to the API use the configured backend base URL when `VITE_API_BASE_URL` was set at build.

- **Development image** (Vite dev server): `docker-compose` builds the frontend with `target: dev`. To build the dev image manually: `docker build --target dev -t promptkb-web:dev ./frontend`.

**How to test the production frontend image locally**

1. **Build the production image** with your backend URL (e.g. a running backend on localhost or a stack):
   ```bash
  docker build --target prod --build-arg VITE_API_BASE_URL=http://localhost:8000 -t promptkb-web ./frontend
  ```
2. **Run the container:**  
   `docker run --rm -p 8080:8080 promptkb-web`
3. **Open** `http://localhost:8080/` and confirm the app loads and can reach the backend (e.g. sign-in or health).

### Phase 1 integration tests: container images (Z4-03)

Integration tests verify that the production backend and frontend images run correctly (e.g. before pushing to a registry). They build the prod images, start them with a test database, and assert on HTTP responses.

**Requirements:** Docker, Docker Compose, Python 3 with pytest and httpx.

**Option 1 — One command (recommended on Windows):** From the repo root, run the script that builds the stack, runs tests, and tears down:

```powershell
.\scripts\run-integration-tests.ps1
```

**Option 2 — Manual steps:**

1. **Install test dependencies** (once):  
   `pip install -r tests/deployment/requirements.txt`

2. **Start the integration stack** (production images + test DB; backend 8010, frontend 8081):  
   `docker compose -f docker-compose.integration.yml up -d --build`  
   Wait until the backend and frontend are up (e.g. `curl http://localhost:8010/health` returns 200).

3. **Run the tests** (integration stack uses ports 8010 and 8081 to avoid clashing with dev):  
   `$env:BACKEND_URL="http://localhost:8010"; $env:FRONTEND_URL="http://localhost:8081"; python -m pytest tests/deployment/ -v -m integration`

4. **Tear down:**  
   `docker compose -f docker-compose.integration.yml down`

**What is tested:** Backend `GET /health` returns 200 with `{"status":"ok","db":"ok"}`; frontend `GET /` returns 200 and the response contains the app (title "Prompt KB" and root div). The integration stack uses a dedicated test database (DB on host port 5433, backend 8010, frontend 8081) so it can run alongside a dev stack. See [docs/developer.md](docs/developer.md) and [docs/deployment_stories.md](docs/deployment_stories.md) (Z4-03).

### Build and lint (frontend)

```bash
cd frontend
npm run build   # TypeScript + Vite build
npm run lint    # ESLint (zero warnings policy)
```

---

## Instructions, custom instructions, and system prompts

You control **how the assistant behaves** using the **Customize** panel on the chat page.

### Where to find it

- In the **chat header**, click **Customize** to open the panel.
- You’ll see:
  - **Model** — choose provider (OpenAI / Gemini) and model; saved as e.g. `openai:gpt-4o-mini`.
  - **Templates** — pick a template (e.g. *General dev assistant*, *Code review (PR-style)*, *Learning coach*), then **Apply** to fill **System prompt** and **Custom instructions**; use the starter prompt chips to start a new chat with that template.
  - **System prompt (sample included)** — textarea for the assistant’s role and fixed rules.
  - **Custom instructions (sample included)** — textarea for your preferences (tone, format, defaults).

Settings are stored in your browser and apply to every message you send. (Per-conversation overrides may be added later.)

### What’s the difference?

- **Custom instructions (the field you edit)**  
  Your **preferences**: tone, structure, level of detail, default assumptions. The app sends these with each request.

- **System prompt (the other field)**  
  A **high-priority control message** that sets the assistant’s role and “always true” rules.  
  In this app, **System prompt** and **Custom instructions** are combined and sent as a **single system message** on every turn (as noted under the textareas).

So: **custom instructions** = what you want the assistant to do by default; **system prompt** = who the assistant is and its invariants.

### When to use each field

- **System prompt**: use for role and guardrails that should rarely change:
  - “You are a knowledgeable assistant helping a developer…”
  - “Be practical and precise. Use markdown…”
  - “When unsure, ask 1–2 clarifying questions.”

- **Custom instructions**: use for your working preferences (you can change these per template or over time):
  - Preferred tone (concise, direct, friendly)
  - Output format (bullets, checklists, “include a test plan”)
  - Your context (tech stack, skill level)
  - Or switch **Templates** and **Apply** to load a preset (e.g. code review vs learning coach)

### How to write good instructions

- **Be specific about output**: format, length, and what to include/exclude.
- **State constraints**: languages/frameworks, time, environment, APIs, security constraints.
- **Set a role if helpful**: reviewer, tutor, pair programmer, product manager.
- **Avoid contradictions**: conflicting instructions cause unpredictable results.
- **Keep it short**: a few clear bullets usually work better than paragraphs.

### Examples you can paste

You can type these into **Custom instructions**, or use **Templates** → *Code review (PR-style)* / *Learning coach* and **Apply** to load similar presets.

**Concise engineering assistant:**

- Keep answers under 10 bullets.
- Prefer TypeScript + React examples.
- When giving changes, include a short test plan.

**Code review mode** (or use template *Code review (PR-style)*):

- Review my changes for correctness, security, and maintainability.
- Call out risks and propose minimal diffs.
- If you’re unsure, ask a single focused question.

**Learning mode** (or use template *Learning coach*):

- Explain step-by-step with small examples.
- Pause after each step with a quick check question.

### Important note about priority

The app sends your **System prompt** and **Custom instructions** as one system message on every turn. If something you say in the chat conflicts with those instructions, the model will usually favor the system message. To change behavior, edit **Customize** (or switch **Templates** and **Apply**) and send again.

