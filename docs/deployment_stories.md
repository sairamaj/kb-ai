# Z4 App Service (containers) — Phased Deployment Stories

This document defines phased implementation stories for deploying the **Prompt Knowledge Base** app to **Azure App Service (Web Apps for Containers)** (Z4 from [docs/deploymennt_recommendations.md](deploymennt_recommendations.md)). It is derived from [docs/deployment_requirements.md](deployment_requirements.md) and the Z4 option. Stories are written so each stage is testable and integration tests are added along the way. No code-level details are mandated; each story focuses on behavior, inputs/outputs, and acceptance criteria.

**Infrastructure as Code:** Azure resources (ACR, App Service plan, Web Apps, app settings, health checks) are provisioned and updated using **Terraform** (Azure provider `hashicorp/azurerm`). Container image build and push remain in CI; the pipeline may update Web App image tags via Terraform (e.g. variable `container_image_tag` and `terraform apply`) or via Azure CLI.

**App name used in examples:** `promptkb` (backend: `promptkb-api`, frontend: `promptkb`).

---

## Story ID convention

Use prefix **Z4-** (e.g. Z4-01, Z4-02). Stories are ordered by phase and dependency.

---

## Phase 1 — Production-ready container images (locally testable)

### Z4-01 — Production backend Dockerfile

**Goal:** Provide a backend container image suitable for App Service: no dev server, no `--reload`, and optional DB-aware health so the platform can use it for readiness.

**Description:**

- Add or adapt a production backend Dockerfile (e.g. `backend/Dockerfile.prod` or make [backend/Dockerfile](../backend/Dockerfile) multi-stage so a production target exists).
- Production run: run `alembic upgrade head` then `uvicorn app.main:app --host 0.0.0.0 --port 8000` (no `--reload`).
- Ensure the app listens on a single port (e.g. 8000) and that [GET /health](../backend/app/main.py) is available. Optionally extend `/health` to include a DB connectivity check for readiness (see [deployment_requirements.md](deployment_requirements.md) §1 Health and startup).

**Behavior:**

- Building the production image and running it (with `DATABASE_URL` and required env) starts the API without reload.
- `GET /health` returns 200 and a body indicating status; if DB check is added, it reflects DB connectivity.

**Acceptance Criteria:**

- Given the production backend image built and run with valid `DATABASE_URL`, when the container is up, then `GET http://<container>:8000/health` returns HTTP 200 and a JSON body (e.g. `{"status": "ok"}` or with `db": "ok"`).
- Given the same image run without `--reload`, then file changes on the host do not trigger restarts.
- Given the Dockerfile (or build docs), then the production build steps and run command are documented (e.g. in [README.MD](../README.MD) or [docs/developer.md](developer.md)).

---

### Z4-02 — Production frontend Dockerfile

**Goal:** Provide a frontend container image that serves the production build (static assets) so App Service can host the frontend without a dev server.

**Description:**

- Add or adapt a production frontend Dockerfile (e.g. `frontend/Dockerfile.prod` or multi-stage [frontend/Dockerfile](../frontend/Dockerfile)). Build with `npm run build` (or equivalent). Serve the built assets with a static server (e.g. nginx, or a minimal Node server). Do not use the Vite dev server in production.
- Expose a single port (e.g. 80 or 8080). The frontend must be configurable at build or runtime so the API base URL points to the backend (e.g. env `VITE_API_URL` or runtime config).

**Behavior:**

- Building the production image produces static assets and a server that responds on the configured port.
- Requesting the root (or a known path) returns the SPA; API calls from the browser go to the configured backend URL.

**Acceptance Criteria:**

- Given the production frontend image built and run with the API base URL set (e.g. to a backend URL), when the container is up, then `GET http://<container>:<port>/` returns HTTP 200 and the app loads; requests to the API use the configured backend base URL.
- Given the Dockerfile or build docs, then the production build and serve steps are documented.

---

### Z4-03 — Integration tests: container images (Phase 1)

**Goal:** Automate verification that production backend and frontend images run correctly so regressions are caught before pushing to a registry.

**Description:**

- Add integration tests that build the production backend and frontend images (or use pre-built images), run them with test configuration (e.g. test DB for backend, mock or test API URL for frontend), and assert on HTTP responses.
- Use a test database (e.g. PostgreSQL with pgvector in Docker or a test container); do not use production credentials or data. Tests can be implemented in Python (pytest + httpx) or as shell scripts calling `curl`; location e.g. `backend/tests/integration/` or `tests/deployment/`.

**Behavior:**

- Running the integration test suite builds (or pulls) the production images, starts backend with a test `DATABASE_URL`, starts frontend with backend URL pointing to that backend, and runs assertions.
- Backend: at least `GET /health` returns 200; optionally `GET /api/...` (e.g. a public or health-related endpoint) returns expected status.
- Frontend: at least `GET /` returns 200 and response body contains expected content (e.g. root HTML or a known string).

**Acceptance Criteria:**

- Given the repo and Docker available, when the Phase 1 integration test suite is run (e.g. `pytest backend/tests/integration/` or `./scripts/integration-test-containers.sh`), then the production backend image is built or used, the production frontend image is built or used, and all defined assertions pass.
- Given the backend test, when the backend container is started with a valid test DB, then `GET /health` returns 200.
- Given the frontend test, when the frontend container is started with the backend URL pointing to the test backend, then `GET /` returns 200 and the response is the frontend app (e.g. HTML containing the app title or root div).
- Test docs or README state how to run these tests and that they require Docker and (for backend) a test database.

---

## Phase 2 — Azure Container Registry and image push

### Z4-04 — ACR repository and push workflow

**Goal:** Store backend and frontend container images in Azure Container Registry (ACR) so App Service can pull them. Use deterministic tags (e.g. commit SHA or version) for traceability and rollback.

**Description:**

- **Terraform:** Define the ACR in Terraform (e.g. `azurerm_container_registry`). Use two repositories (e.g. `promptkb-api`, `promptkb-web`) — ACR supports multiple image names in one registry; document repository naming so CI and Terraform align. Output ACR login server and name (e.g. `terraform output acr_login_server`) for use by the push workflow and Web App config.
- **Push workflow:** Provide a repeatable way to build and push images: script or CI job that builds the production images, tags them with a deterministic tag (e.g. `git rev-parse --short HEAD` or semantic version), and pushes to ACR. Authentication to ACR: use Terraform outputs for ACR URL; authenticate via Azure CLI `az acr login` (or service principal / admin credentials) in CI; document or automate in the runbook.
- After `terraform apply`, the ACR exists; after the push workflow runs, both images exist in ACR with the chosen tag.

**Behavior:**

- After running the push workflow, both images exist in ACR with the chosen tag. App Service will later be configured (via Terraform) to pull from these repositories and tag (or `latest` for non-production).

**Acceptance Criteria:**

- Given Terraform has been applied and the push workflow run with a specific tag, when listing tags for the backend and frontend repositories (e.g. Azure CLI `az acr repository show-tags`, ACR API, or Terraform data source), then the expected tag is present.
- Given the push workflow, then it uses the production Dockerfiles (or production build targets) from Phase 1.
- Document (in README or deployment runbook) the Terraform module/workspace for ACR, ACR name (from Terraform output), repository names, and how to run the build-and-push (and required env or login).

#### Implementation notes (Terraform + ACR push)

- **Terraform (ACR resolution for CI):**
  - Location: **`infra/terraform-acr`** — data sources only; reads existing RG + ACR; outputs `acr_name` and `acr_login_server`.
  - ACR and RG are created outside Terraform (e.g. Azure CLI); see `docs/developer.md`.
  - Required inputs (CI passes `TF_VAR_resource_group_name`, `TF_VAR_acr_name`):
    - `resource_group_name`, `acr_name`.
- **Terraform (app + database):**
  - Location: **`infra/terraform-app`** — PostgreSQL Flexible Server, backend Web App, etc. Not run by the image push workflow.
- **ACR repositories:**
  - Backend image: `<acr_login_server>/promptkb-api:<tag>`.
  - Frontend image: `<acr_login_server>/promptkb-web:<tag>`.
- **GitHub Actions workflow (build + push):**
  - Location: `.github/workflows/build-and-push-acr.yml`.
  - Trigger: `workflow_dispatch` (manual) and pushes to `main`/`feature/deployment`.
  - Behavior:
    - Logs in to Azure using OIDC (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` secrets).
    - Runs `terraform init` and `terraform apply` in **`infra/terraform-acr`** to resolve ACR (does not create or modify PostgreSQL / Web App).
    - Reads `acr_login_server` and `acr_name` from Terraform outputs.
    - Computes image tag: explicit `image_tag` input, otherwise short commit SHA.
    - Builds production images using the backend and frontend Dockerfiles from Phase 1 and tags them as:
      - `${acr_login_server}/promptkb-api:${tag}`
      - `${acr_login_server}/promptkb-web:${tag}`
    - Authenticates to ACR via `az acr login` and pushes both images.

##### Runbook: how to build and push images to ACR (Z4-04)

1. **Prepare Azure and Terraform:**
  - Ensure an Azure resource group exists for ACR (e.g. `promptkb-rg`).
  - In GitHub repository secrets, set:
    - `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (for federated identity / `azure/login`).
    - `AZURE_RESOURCE_GROUP_NAME` (matches the resource group above).
    - `AZURE_ACR_NAME` (desired ACR name; must be globally unique).
2. **Create ACR (Azure CLI):** See `docs/developer.md` (`az group create`, `az acr create`). Terraform CI only **reads** the existing ACR.
3. **Optional — verify ACR via Terraform locally:**
   - `cd infra/terraform-acr && terraform init && terraform apply` with the same `resource_group_name` / `acr_name` as CI.
4. **Build and push images from CI (recommended):**
  - In GitHu b, go to **Actions → Z4-04 - Build and push images to ACR**.
  - Click **Run workflow**:
    - Optionally specify `image_tag` (e.g. `v0.1.0`); if omitted, the short commit SHA is used.
  - Wait for the job to:
    - Run Terraform in `terraform-acr` to read ACR outputs.
    - Build the backend and frontend production images.
    - Push:
      - `<acr_login_server>/promptkb-api:<tag>`
      - `<acr_login_server>/promptkb-web:<tag>`.
5. **Build and push images locally (fallback/manual):**
  - Authenticate to Azure and ACR:
    - `az login`
    - `az acr login --name <acr_name>`
  - Build and push backend:
    - `cd backend`
    - `docker build -f Dockerfile -t <acr_login_server>/promptkb-api:<tag> .`
    - `docker push <acr_login_server>/promptkb-api:<tag>`
  - Build and push frontend:
    - `cd ../frontend`
    - `docker build -f Dockerfile -t <acr_login_server>/promptkb-web:<tag> .`
    - `docker push <acr_login_server>/promptkb-web:<tag>`
6. **Verify images and tags in ACR:**
  - Backend: `az acr repository show-tags --name <acr_name> --repository promptkb-api`.
  - Frontend: `az acr repository show-tags --name <acr_name> --repository promptkb-web`.
  - Confirm the expected `<tag>` appears for both repositories.

---

### Z4-05 — Integration tests: ACR image availability (Phase 2)

**Goal:** Automate verification that after push, the expected images and tags exist in ACR so CI can gate deployment on successful push.

**Description:**

- Add a test or CI step that, after the push workflow runs, verifies that the backend and frontend images exist in ACR with the tag that was pushed. Use Terraform outputs for ACR name/login server, then verify via Azure CLI `az acr repository show-tags`, ACR API, or a Terraform data source. Optionally pull and run a quick smoke test (e.g. run container and `curl /health`) in CI.

**Behavior:**

- The test runs in the same environment that has ACR access (e.g. GitHub Actions with Azure credentials or Azure DevOps). It does not require App Service to be deployed.

**Acceptance Criteria:**

- Given a successful push to ACR with tag `T`, when the Phase 2 integration test runs, then it confirms that both backend and frontend images exist in ACR with tag `T`.
- If the test includes a smoke run (pull and start container), then at least the backend container responds to `GET /health` with 200 when run with a test DB URL.

---

## Phase 3 — App Service: backend Web App for Containers

### Z4-06 — Backend Web App (Linux container from ACR)

**Goal:** Run the backend as an Azure Web App for Containers so it is reachable at a stable URL (e.g. `https://promptkb-api.azurewebsites.net`) with managed HTTPS and no cold start when Always On is enabled.

**Description:**

- **Terraform:** Define the backend Web App in Terraform: create a Linux App Service plan (e.g. `azurerm_service_plan`, Basic B1 or higher for Always On) and a Web App (e.g. `azurerm_linux_web_app`) configured to use a container image from the ACR created in Z4-04. Reference the ACR in Terraform (e.g. `azurerm_container_registry` resource or data source) and set the Web App container image by tag (e.g. variable `backend_image_tag`).
- Configure the Web App app settings in Terraform: `DATABASE_URL`, `SECRET_KEY`, `OPENAI_API_KEY` (and optional `GEMINI_API_KEY`), OAuth vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`), `REDIRECT_BASE_URL`, `FRONTEND_URL` to match the frontend origin (e.g. `https://promptkb.azurewebsites.net`). Use Application settings in Terraform; for secrets, use Key Vault references (e.g. `@Microsoft.KeyVault(SecretUri=...)`) or Terraform variables backed by a secret store; do not commit secrets in Terraform state or code.
- In Terraform, enable the platform health check: set the health check path to `GET /health` so the instance is considered ready only when the app and (if implemented) DB are healthy.

**Behavior:**

- The backend is publicly reachable at `https://<backend-app-name>.azurewebsites.net`. Unauthenticated requests to `GET /health` return 200 when the app and DB are up. Authenticated and API routes behave as in [deployment_requirements.md](deployment_requirements.md).

**Acceptance Criteria:**

- Given the backend Web App is deployed and configured with valid `DATABASE_URL` and secrets, when `GET https://<backend-app-name>.azurewebsites.net/health` is called, then the response is HTTP 200 and body indicates healthy status.
- Given the Web App configuration, then `DATABASE_URL`, `SECRET_KEY`, and `FRONTEND_URL` (and other required env) are set via App Service settings or Key Vault; they are not hardcoded in the image.
- Given the App Service health check is configured to use `GET /health`, then the platform marks the instance ready only when that endpoint returns success.

---

### Z4-07 — Backend CORS and production frontend origin

**Goal:** Allow the production frontend origin to call the backend API so browser requests from the deployed frontend are not blocked by CORS.

**Description:**

- Ensure the backend allows the production frontend origin(s) in CORS (e.g. `https://promptkb.azurewebsites.net` and, if used, a custom domain). [backend/app/main.py](../backend/app/main.py) currently allows `localhost:5173` and `frontend:5173`; add the production origin(s) or make allowed origins configurable via env (e.g. `CORS_ORIGINS` or derive from `FRONTEND_URL`). Set `FRONTEND_URL` (and, if used, `CORS_ORIGINS`) in Terraform as Web App application settings so the deployed backend uses the correct frontend URL.
- Ensure `FRONTEND_URL` (and OAuth redirect URIs) match the actual frontend URL so OAuth callbacks work.

**Behavior:**

- When the browser loads the frontend from the production URL and the frontend calls the backend API, CORS headers allow the request. OAuth redirect URIs registered with the identity providers include the production callback URL(s).

**Acceptance Criteria:**

- Given the backend deployed with `FRONTEND_URL=https://promptkb.azurewebsites.net` (or the actual frontend URL), when a request is made to the backend with `Origin: <FRONTEND_URL>`, then the response includes an `Access-Control-Allow-Origin` that permits that origin (for credentialed requests as appropriate).
- Given the deployment docs, then the required OAuth redirect URIs for production (e.g. `https://<api-host>/auth/google/callback` when the API has no `/api` path prefix) are documented.

---

### Z4-08 — Integration tests: deployed backend (Phase 3)

**Goal:** Automate verification that the deployed backend (staging or a dedicated test slot) is healthy and key routes respond correctly, so regressions are caught after deploy.

**Description:**

- Add integration tests that run against the deployed backend URL (e.g. from env `BACKEND_URL` or `TEST_BACKEND_URL`). Tests should call `GET /health` and optionally a few safe endpoints (e.g. unauthenticated or public routes). Do not use production credentials; use a staging/test backend and test DB if needed.
- These tests can run in CI after deploy (post-deploy smoke) or on a schedule. They must be clearly separated from unit tests (e.g. different pytest marker or separate directory) and require the deployed URL to be configured.

**Behavior:**

- When the test suite runs with `BACKEND_URL` set to the deployed backend, it gets 200 from `/health` and any additional assertions (e.g. response shape, or 401 from protected route) pass.

**Acceptance Criteria:**

- Given `BACKEND_URL` (or `TEST_BACKEND_URL`) set to the deployed backend base URL, when the Phase 3 integration tests run, then `GET $BACKEND_URL/health` returns 200.
- Given the same tests, then they are documented (e.g. in [docs/developer.md](developer.md) or README) as deployment smoke/integration tests and how to run them (e.g. `pytest -m deployment` or `./scripts/smoke-backend.sh`).
- Given a protected endpoint (e.g. requiring auth), when the test calls it without credentials, then the response is 401 (or 403) so that the API is reachable and auth is enforced.

---

## Phase 4 — App Service: frontend Web App for Containers

### Z4-09 — Frontend Web App (Linux container from ACR)

**Goal:** Run the frontend as an Azure Web App for Containers so users can access the app at a stable URL (e.g. `https://promptkb.azurewebsites.net`) with managed HTTPS.

**Description:**

- **Terraform:** Define the frontend Web App in Terraform (e.g. `azurerm_linux_web_app`) using the same App Service plan as the backend (Z4-06) or a separate plan. Configure it to use the frontend container image from ACR (from Z4-04), with the image tag supplied by a variable (e.g. `frontend_image_tag`).
- Configure the frontend to use the backend API URL (e.g. `https://promptkb-api.azurewebsites.net`) via Terraform app settings or build-time env (e.g. `VITE_API_URL` or runtime config if supported). Ensure the container serves the SPA and that deep links or refresh work (e.g. nginx or server configured to serve `index.html` for SPA routes).

**Behavior:**

- Users opening `https://promptkb.azurewebsites.net` get the frontend; the frontend calls the backend API at the configured URL. OAuth flows redirect to the backend and back to the frontend as configured.

**Acceptance Criteria:**

- Given the frontend Web App is deployed and configured with the backend API URL, when a user opens `https://<frontend-app-name>.azurewebsites.net/`, then the app loads and can reach the backend (e.g. health or auth endpoints).
- Given a full page reload on a client-side route (e.g. `/library`), then the server returns the SPA so the route is handled by the frontend router.

#### Implementation notes (Terraform — Z4-09)

- **Location:** **`infra/terraform-frontend`** — separate root from `terraform-app` (backend/DB).
- **Inputs:** `resource_group_name`, `acr_name` (same ACR as backend; image `promptkb-web:<tag>`).
- **App Service plan (aligned with backend pattern):**
  - **`app_service_plan_resource_group_name`** — optional; use when the plan lives in a **different RG** (e.g. dedicated **test/staging plan RG**) while the Web App stays in `resource_group_name`.
  - **`use_existing_plan` / `existing_plan_name`** — attach to an existing Linux plan (shared or test).
  - Otherwise create a new plan with **`plan_name`** and **`plan_sku_name`** (default `B1`).
- **Image tag:** variable **`frontend_image_tag`**.
- **Backend URL:** the SPA uses **`VITE_API_BASE_URL` at Docker build time**; build/push must pass `--build-arg VITE_API_BASE_URL=https://<backend-app>.azurewebsites.net`. Terraform sets **`backend_api_public_url`** as app setting `BACKEND_API_PUBLIC_URL` for operators (same value as build arg).
- **Enable resources:** set **`frontend_enabled = true`** in tfvars.

---

### Z4-10 — Integration tests: deployed frontend and E2E smoke (Phase 4)

**Goal:** Automate verification that the deployed frontend loads and can call the backend so end-to-end connectivity is validated after deploy.

**Description:**

- Add integration tests that request the frontend URL (e.g. `FRONTEND_URL` or `TEST_FRONTEND_URL`) and assert the response is 200 and contains the app (e.g. root HTML or a known meta tag). Optionally add a minimal E2E smoke: open the frontend URL, trigger a call to the backend (e.g. fetch `/api/health` or follow a login redirect), and assert success. Use headless HTTP or a lightweight browser (e.g. Playwright) as appropriate; avoid flaky UI tests.
- Tests must not use production user credentials; use public endpoints or mocks where possible.

**Behavior:**

- Running the Phase 4 tests against the deployed frontend and backend confirms that the frontend is served and that API calls from the frontend to the backend succeed (at least for health or public routes).

**Acceptance Criteria:**

- Given `FRONTEND_URL` and `BACKEND_URL` set to the deployed apps, when the Phase 4 integration tests run, then `GET $FRONTEND_URL/` returns 200 and the response body indicates the frontend app (e.g. title or root element).
- Given the same tests, when the frontend is configured to call the backend, then a request that simulates the frontend calling the backend (e.g. same-origin proxy or direct `GET $BACKEND_URL/health`) succeeds with 200.
- Tests are documented as deployment/E2E smoke and how to run them; they are optional in CI if they require a full deployed environment.

---

## Phase 5 — CI/CD pipeline

### Z4-11 — Build and deploy pipeline (ACR + Web Apps)

**Goal:** Automate build, test, push to ACR, and deploy to Web Apps so each merge or tag can trigger a consistent release with optional gates.

**Description:**

- Implement a CI/CD pipeline (e.g. GitHub Actions or Azure DevOps) that: (1) runs unit and Phase 1–2 integration tests, (2) builds production backend and frontend images, (3) tags with a deterministic tag (e.g. commit SHA or version), (4) pushes to ACR, (5) updates the backend and frontend Web Apps to use the new image tag. **Prefer Terraform for (5):** run `terraform apply` with the new image tag passed as variables (e.g. `backend_image_tag`, `frontend_image_tag`), so Terraform updates the Web App container configuration; alternatively use Azure CLI `az webapp config container set` or slot swap if not using Terraform for app updates.
- Support at least one non-production environment (e.g. staging): use Terraform workspaces or separate root modules (e.g. `environments/staging`, `environments/prod`) with different Web App names and config (staging DB, staging OAuth apps). Option to block deploy on failed tests or require manual approval for production.

**Behavior:**

- On trigger (e.g. push to main or tag), the pipeline runs tests, builds images, pushes to ACR, and deploys to the target environment. After deploy, Phase 3 and optionally Phase 4 integration tests can run as smoke checks.

**Acceptance Criteria:**

- Given a pipeline run triggered by a commit or tag, when tests pass, then the pipeline builds both production images, pushes them to ACR with the expected tag, and updates the target Web App(s) to use that tag (via Terraform apply with image tag variables, or via Azure CLI).
- Given a failed test (e.g. unit or Phase 1 integration), when the pipeline is configured to block on failure, then the deploy step does not run or the pipeline fails.
- Given the pipeline, then documentation describes how to trigger a deploy, which Terraform workspace or module is used per environment (staging vs production), and how to provide ACR and Azure credentials (e.g. Azure service principal for Terraform and push, GitHub secrets).

#### Implementation notes (Z4-11)

- **Workflow:** [`.github/workflows/ci-cd-deploy.yml`](../.github/workflows/ci-cd-deploy.yml) — **Z4-11 - CI/CD (test, ACR, deploy Web Apps)**.
- **Test job:** Phase 1 container integration via [`scripts/run-integration-tests.sh`](../scripts/run-integration-tests.sh) (Linux) / [`scripts/run-integration-tests.ps1`](../scripts/run-integration-tests.ps1) (Windows); runs on all triggers including PRs to `main`.
- **Deploy job:** Runs only on `push` to `main` / `feature/deployment` or `workflow_dispatch`, and only when repo variable **`CI_CD_DEPLOY_ENABLED`** is `true`. Sequence: `terraform apply` in **`infra/terraform-acr`** → Docker build/push (`promptkb-api`, `promptkb-web`) → Z4-05 verify → `terraform apply` in **`infra/terraform-app`** with **`TF_VAR_backend_image_tag`** (same tag) → `terraform apply` in **`infra/terraform-frontend`** with **`TF_VAR_frontend_image_tag`**.
- **Secrets / vars:** Documented in [docs/developer.md](developer.md) — *CI/CD pipeline — Z4-11*. Required for deploy: `TF_VAR_DATABASE_URL`, `TF_VAR_SECRET_KEY` plus the Azure variables used by Z4-04.
- **Z4-04** ([`build-and-push-acr.yml`](../.github/workflows/build-and-push-acr.yml)) remains **push-only** (no Web App container update); use Z4-11 for full rollout or run Terraform locally with the new tag.

---

### Z4-12 — Database migrations in release

**Goal:** Apply Alembic migrations in a controlled way during release so the deployed backend runs against an up-to-date schema without race conditions in multi-instance scenarios.

**Description:**

- Ensure migrations run as part of the release. Options: (a) run `alembic upgrade head` in the backend container at startup (current [backend/Dockerfile](../backend/Dockerfile) pattern); (b) run migrations in a separate step before updating the Web App (e.g. a one-off job or pipeline step that runs against the deployment DB). If (a), document that only one instance should run migrations (e.g. single instance at deploy, or use a lock/leader election). See [deployment_requirements.md](deployment_requirements.md) §1 Database and §2 Deploy pipeline.

**Behavior:**

- After a release, the deployment database is at the migration version expected by the application code. No two processes apply migrations concurrently in a way that corrupts schema.

**Acceptance Criteria:**

- Given a new migration added to the repo, when the release pipeline runs (or the backend starts with the new image), then the deployment DB is migrated to include that migration (e.g. `alembic current` matches `head` after deploy).
- Given the migration strategy (startup vs separate job), then it is documented how migrations are run and how concurrency is avoided (e.g. single instance at deploy, or migration job runs once before scaling).

---

### Z4-13 — Integration tests: pipeline gates and post-deploy smoke (Phase 5)

**Goal:** Run integration and smoke tests inside the pipeline so every release is validated before and after deploy.

**Description:**

- In the pipeline: run Phase 1 (and, if feasible, Phase 2) integration tests before push. After updating the Web Apps, run Phase 3 backend smoke tests (and optionally Phase 4 frontend smoke) against the deployed URL(s). Use pipeline secrets or variables for `BACKEND_URL` and `FRONTEND_URL` (staging or production). Mark post-deploy tests as allowed to fail for optional environments if the environment is not always available.

**Behavior:**

- Pipeline has a clear test phase (unit + integration) and a post-deploy smoke phase. Failures in the test phase block deploy when so configured; post-deploy failures can block or warn depending on configuration.

**Acceptance Criteria:**

- Given the CI/CD pipeline, when it runs, then Phase 1 container integration tests run before image push (or in parallel with build).
- Given a successful deploy to the target environment, when post-deploy smoke is enabled, then Phase 3 (and optionally Phase 4) tests run against the deployed backend (and frontend) and pass for the pipeline to be considered successful (or clearly report failure).
- Document which pipeline jobs run which tests and how to configure deploy vs smoke-only runs.

---

## Phase 6 — Staging, rollback, and operations

### Z4-14 — Staging environment

**Goal:** Provide a non-production environment (staging) with its own config and DB so releases can be validated before production.

**Description:**

- **Terraform:** Define the staging environment in Terraform using a separate workspace (e.g. `terraform workspace select staging`) or a separate root module (e.g. `infra/environments/staging`) so that staging uses separate resources: Web Apps (e.g. `promptkb-api-staging`, `promptkb-staging`), App Service plan (or shared), and optionally a separate database (e.g. Azure Database for PostgreSQL Flexible Server — staging instance). Use Terraform variables or `.tfvars` per environment for app settings, OAuth redirect URIs, and DB connection strings. Staging should use staging OAuth app redirect URIs and secrets. Pipeline can deploy to staging on every merge to main (e.g. `terraform apply -var-file=staging.tfvars`) and to production on tag or manual approval.

**Behavior:**

- Staging is reachable at its own URLs; it uses staging DB and config. Production is unchanged until explicitly deployed.

**Acceptance Criteria:**

- Given staging Web Apps and staging DB, when the pipeline deploys to staging, then the staging backend uses the staging DB and staging config (OAuth, URLs); production is not modified.
- Given the docs, then staging URLs and how to deploy to staging vs production are documented.

---

### Z4-15 — Rollback procedure and documentation

**Goal:** Enable rollback to a previous app version (and document migration rollback) so incidents can be mitigated quickly.

**Description:**

- Document and optionally automate rollback: (1) **Terraform:** Revert Web App to a previous container tag by re-running `terraform apply` with the previous image tag variables (e.g. `backend_image_tag`, `frontend_image_tag`) set to the known-good tag (e.g. from ACR or from pipeline history). Alternatively revert Web App via Azure CLI `az webapp config container set` or swap back to a previous deployment slot if slot swap was used for deploy. (2) If a migration must be reverted, document running `alembic downgrade -1` (or target revision) against the deployment DB and the associated risks. Ensure the rollback steps are in a runbook or [docs/developer.md](developer.md), including how to find and set the previous image tag in Terraform.

**Behavior:**

- Operators can roll back the app to a previous image tag; for migrations, there is a documented procedure and caveats.

**Acceptance Criteria:**

- Given a previous image tag `T` that was known good, when the documented rollback procedure is followed (e.g. `terraform apply -var="backend_image_tag=T" -var="frontend_image_tag=T"` or equivalent), then the Web App(s) are updated to use tag `T` and the app is again serving that version.
- Given [docs/developer.md](developer.md) or a runbook, then it describes how to roll back the app via Terraform (image tag variables) or slot/CLI, and how to roll back migrations when necessary (and that downgrades may have data implications).

---

## Story and dependency overview


| Phase | Stories             | Depends on | Testability                                                                                                                 |
| ----- | ------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1     | Z4-01, Z4-02, Z4-03 | —          | Build images locally; Z4-03 runs integration tests against local containers.                                                |
| 2     | Z4-04, Z4-05        | Phase 1    | Terraform provisions ACR; push workflow fills it; Z4-05 verifies images in ACR (and optional smoke run).                    |
| 3     | Z4-06, Z4-07, Z4-08 | Phase 2    | Terraform provisions backend Web App; Z4-08 runs integration tests against deployed backend URL.                            |
| 4     | Z4-09, Z4-10        | Phase 3    | Terraform provisions frontend Web App; Z4-10 runs integration/smoke tests against deployed frontend and backend.            |
| 5     | Z4-11, Z4-12, Z4-13 | Phases 1–4 | Pipeline runs tests, push, then Terraform apply (or CLI) to update image tags; Z4-13 gates and post-deploy smoke.           |
| 6     | Z4-14, Z4-15        | Phase 5    | Terraform workspaces/modules for staging; rollback via Terraform (image tag vars) or slot/CLI; test by rollback in staging. |


---

## References

- [docs/deploymennt_recommendations.md](deploymennt_recommendations.md) — Z4 option and comparison with Z5
- [docs/deployment_requirements.md](deployment_requirements.md) — Build, DB, config, networking, health, CI/CD, testing, troubleshooting
- [Terraform Azure Provider (azurerm)](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs) — `azurerm_container_registry`, `azurerm_service_plan`, `azurerm_linux_web_app`
- [backend/Dockerfile](../backend/Dockerfile), [frontend/Dockerfile](../frontend/Dockerfile) — Current Dockerfiles
- [backend/app/main.py](../backend/app/main.py) — CORS and `/health`
- [backend/.env.example](../backend/.env.example) — Required and optional env vars

