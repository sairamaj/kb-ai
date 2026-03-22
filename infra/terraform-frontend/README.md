# Terraform — Frontend Web App (Z4-09)

Provisions a **Linux Web App for Containers** that runs the **`promptkb-web`** image from ACR.

## Relationship to other roots

| Directory | Purpose |
|-----------|---------|
| **`../terraform-acr`** | Resolve ACR; CI build/push (Z4-04 / Z4-11). |
| **`../terraform-app`** | PostgreSQL + backend API Web App + optional backend plan. |
| **`terraform-frontend` (here)** | Frontend Web App + optional **dedicated** App Service plan. |

Run `terraform init` and `terraform apply` **from this directory** when deploying only the frontend stack (or alongside backend using separate state).

## App Service plan and resource groups

Same pattern as **`../terraform-app`** for the backend:

- **`resource_group_name`** — RG where **ACR** and the **frontend Web App** live.
- **`app_service_plan_resource_group_name`** — Optional. RG where the **App Service plan** is created or looked up. Use this for a **test/staging plan in its own RG** (e.g. `promptkb-test-plans-rg`) while the Web App stays in `promptkb-rg`.

**Create new plan:** `use_existing_plan = false`, set `plan_name` (and optionally a separate plan RG).

**Use existing plan:** `use_existing_plan = true`, set `existing_plan_name` and ensure the plan’s RG is set via `app_service_plan_resource_group_name` if it differs from `resource_group_name`.

## API URL (build-time)

The SPA reads **`VITE_API_BASE_URL`** at **build time**. App Service app settings cannot change the bundled JS.

- Build/push the image with:  
  `docker build --build-arg VITE_API_BASE_URL=https://<your-backend>.azurewebsites.net ...`
- Set **`backend_api_public_url`** in tfvars to the same URL (stored as `BACKEND_API_PUBLIC_URL` on the Web App for documentation/ops).

## Quick start

```bash
cd infra/terraform-frontend
cp terraform.tfvars.example terraform.tfvars
# Edit: frontend_enabled = true, acr_name, image tag, backend URL, plan options
terraform init
terraform apply
```

After deploy, register OAuth redirect URLs using the backend URL pattern from your deployment docs.
