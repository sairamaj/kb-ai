### Production backend Docker (Z4-01)

The backend has a production Dockerfile target suitable for App Service (no dev server, no `--reload`). See [README.MD](../README.MD#production-backend-image-z4-01) for build and run commands. Summary:

- **Build:** `docker build --target prod -t promptkb-api ./backend` (from repo root).
- **Run:** Pass `DATABASE_URL`, `SECRET_KEY`, and other required env; container runs `alembic upgrade head` then `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- **Health:** `GET /health` returns 200 with `{"status": "ok", "db": "ok"}` when DB is reachable, or 503 with `{"status": "degraded", "db": "error"}` for readiness.

### Phase 1 integration tests — container images (Z4-03)

Integration tests verify that production backend and frontend container images run correctly. They require **Docker**, **Docker Compose**, and **Python** with pytest and httpx.

- **Run all (build, start, test, tear down)** — from repo root:  
  `.\scripts\run-integration-tests.ps1`
- **Run tests only** (containers already running; integration stack uses 8010/8081):  
  `$env:BACKEND_URL="http://localhost:8010"; $env:FRONTEND_URL="http://localhost:8081"; python -m pytest tests/deployment/ -v -m integration`

Tests live in `tests/deployment/`. They assert: backend `GET /health` returns 200 with DB ok; frontend `GET /` returns 200 and body contains the app (e.g. "Prompt KB", `id="root"`). The integration compose file is `docker-compose.integration.yml` (backend 8010, frontend 8081, DB host 5433) so it can run alongside the dev stack. See [README.MD](../README.MD#phase-1-integration-tests-container-images-z4-03) and [deployment_stories.md](deployment_stories.md) (Z4-03).

### Production frontend Docker (Z4-02)

The frontend Dockerfile is multi-stage. The **production** target builds static assets with `npm run build` and serves them with nginx on port 8080 (no Vite dev server). See [README.MD](../README.MD#production-frontend-image-z4-02) for build and run commands. Summary:

- **Build:** `docker build --target prod -t promptkb-web ./frontend` (from repo root). Set the backend API URL at build time with `--build-arg VITE_API_BASE_URL=<backend-origin>` (e.g. `https://promptkb-api.azurewebsites.net`) so the app calls the correct backend in production.
- **Run:** `docker run --rm -p 8080:8080 promptkb-web`. The container serves the SPA on port 8080; API requests use the URL from `VITE_API_BASE_URL` if set.
- **Development:** `docker-compose` uses `target: dev` for the frontend (Vite dev server on 5173).

---

### Azure setup for GitHub Actions (Z4-04)

These steps create an Azure service principal and federated credentials so the **Z4-04 build-and-push** workflow can authenticate to Azure and push images to ACR **without storing a password** (OIDC). Use **PowerShell** on Windows; replace placeholders with your values.

**Prerequisites:** [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed and logged in (`az login`).

#### 0. One-time: Create resource group and ACR

Terraform only **reads** existing resources (it does not create them). Create the resource group and ACR once, outside Terraform:

```powershell
az group create --name promptkb-rg --location westus
az acr create --resource-group promptkb-rg --name promptkb --sku Basic
```

Use your desired resource group name, ACR name (globally unique), and location. After this, the build-and-push workflow and `terraform apply` are fully rerunnable — they look up the existing ACR and output its values.

#### 1. Set variables

```powershell
$subscriptionId = "YOUR_SUBSCRIPTION_ID"
$resourceGroup  = "YOUR_RESOURCE_GROUP"   # e.g. promptkb-rg
$appName        = "github-actions-promptkb"
$ghOrg          = "YOUR_GH_ORG"
$ghRepo         = "YOUR_GH_REPO"
```

#### 2. Login and select subscription

```powershell
az login
az account set --subscription $subscriptionId
```

#### 3. Create app registration and service principal

```powershell
az ad app create --display-name $appName | Out-Null

$appId = az ad app list --display-name $appName --query "[0].appId" -o tsv
Write-Host "AZURE_CLIENT_ID = $appId"

az ad sp create --id $appId | Out-Null
```

#### 4. Assign Contributor role

Scope to a resource group (recommended):

```powershell
$rgScope = "/subscriptions/$subscriptionId/resourceGroups/$resourceGroup"
az role assignment create --role "Contributor" --assignee $appId --scope $rgScope
```

Or scope to the whole subscription:

```powershell
az role assignment create --role "Contributor" --assignee $appId --scope "/subscriptions/$subscriptionId"
```

#### 5. Create federated credentials (no password)

Use **single-quoted** JSON so PowerShell does not alter it. One credential per branch/workflow.

**Main branch:**

```powershell
az ad app federated-credential create --id $appId --parameters '{"name":"github-actions-main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:YOUR_GH_ORG/YOUR_GH_REPO:ref:refs/heads/main","audiences":["api://AzureADTokenExchange"],"description":"GitHub Actions main branch"}'
```

**Feature/deployment branch (optional):**

```powershell
az ad app federated-credential create --id $appId --parameters '{"name":"github-actions-feature-deployment","issuer":"https://token.actions.githubusercontent.com","subject":"repo:YOUR_GH_ORG/YOUR_GH_REPO:ref:refs/heads/feature/deployment","audiences":["api://AzureADTokenExchange"],"description":"GitHub Actions feature/deployment branch"}'
```

Replace `YOUR_GH_ORG` and `YOUR_GH_REPO` in both commands with your GitHub org and repo name.

#### 6. Get tenant ID

```powershell
$tenantId = az account show --query tenantId -o tsv
Write-Host "AZURE_TENANT_ID = $tenantId"
```

#### 7. GitHub repository secrets

In GitHub: **Settings → Secrets and variables → Actions**. Add:

| Secret | Value |
|--------|--------|
| `AZURE_CLIENT_ID` | `$appId` from step 3 |
| `AZURE_TENANT_ID` | `$tenantId` from step 6 |
| `AZURE_SUBSCRIPTION_ID` | `$subscriptionId` |
| `AZURE_RESOURCE_GROUP_NAME` | `$resourceGroup` (e.g. `promptkb-rg`) |
| `AZURE_ACR_NAME` | Your ACR name (globally unique, e.g. `promptkbacrprod`) |

No `AZURE_CLIENT_SECRET` is needed when using federated credentials.

**Troubleshooting:** If the workflow fails with `No subscriptions found for ***` after OIDC login, the service principal has no role on the subscription. Re-run **step 4** (role assignment) so the app has Contributor (or Reader) on the subscription or resource group. Role changes can take a few minutes to propagate.

#### Optional: client secret (not recommended)

If you cannot use OIDC and must use a client secret:

```powershell
$secret = az ad app credential reset --id $appId --query password -o tsv
Write-Host "AZURE_CLIENT_SECRET = $secret"
```

Store it in GitHub as `AZURE_CLIENT_SECRET`. The workflow would need to use `client-secret` with `azure/login` instead of OIDC; rotate the secret periodically.

---

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

#### Model costs and real spend (admin reports, REP-07)

The model and costs report (`GET /api/admin/reports/models`) shows, per model:

- **Real spend (USD)** — When available, actual cost from the provider for the last 30 days.
  - **OpenAI:** Fetched from the [OpenAI Organization Costs API](https://platform.openai.com/docs/api-reference/usage) using `OPENAI_API_KEY`. The key must be an **organization** key (created under [Organization settings](https://platform.openai.com/settings/organization) → API keys or [Admin keys](https://platform.openai.com/settings/organization/admin-keys)). A project API key with “All” permissions does **not** have access to organization-level costs; use an org key and the report will show real spend. If the key is not an org key, the API returns 403 and real spend shows as —.
  - **Gemini:** Google does not expose a public usage/cost API for the Generative Language API; the report shows only the reference cost per 1K tokens for Gemini models.
- **Cost per 1K tokens (ref)** — Reference unit cost (USD per 1K tokens) used for display and for Gemini (where real spend is not available). Defined in `backend/app/config.py`: `KNOWN_MODELS` and `_DEFAULT_MODEL_COSTS`. Override per model via env (e.g. `MODEL_COST_GPT_4O_MINI=0.0002`). Env keys: model id in uppercase, dots/dashes → underscores, prefix `MODEL_COST_`. Restart the backend after changing config or env.

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

- **Help popup:** The help UI is a **chat popup in the right lower corner** (floating panel). A persistent **floating button** (amber circle with question-mark icon) in the bottom-right opens and closes the popup.
- **Deep-link:** Navigating to `/help` opens the app (chat page) with the help popup already open; the URL is then replaced with `/`.
- **Chat UI (CB-07):** The popup provides a chat-style interface: message list (user and assistant bubbles), text input, and send. It is labeled **App help** and is visually distinct from the main knowledge-base chat (amber accent, question-mark icon). Only the help-chat endpoint is called; no main conversation or conversation endpoints are used.

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