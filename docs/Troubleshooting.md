## Azure App Service container fails to start (Application Error)

If `curl https://<app-name>.azurewebsites.net/health` returns the generic Azure **Application Error** page and the site runs a custom container from Azure Container Registry (ACR), check for image‑pull issues.

- **Symptom in Docker / App Service logs**
  - Messages like:
    - `ACRTokenRetrievalFailure ... Status Code: Unauthorized ... authentication required`
    - `ImageNotFoundFailure ... manifest for <registry>.azurecr.io/<repo>:latest not found`
  - The site is repeatedly starting and stopping, and may be marked **Blocked** due to multiple cold‑start failures.

- **Root causes**
  - The image tag configured on the Web App (or in Terraform) **does not exist** in ACR (e.g. `latest` tag missing).
  - The Web App’s managed identity **does not have permission** to pull from ACR.

- **Step 1 – Verify the image and tag exist in ACR**
  - List tags for the repository:

```bash
az acr repository show-tags \
  --name <acr-name> \
  --repository <repository-name>
```

  - Confirm the tag used by the Web App (e.g. `latest` or a versioned tag) is present.
  - If not present:
    - Either retag and push:

```bash
docker tag <acr-name>.azurecr.io/<repo>:<your-tag> <acr-name>.azurecr.io/<repo>:latest
docker push <acr-name>.azurecr.io/<repo>:latest
```

    - Or update the Web App / Terraform configuration to use an existing tag (e.g. `:2026-03-18-01`).

- **Step 2 – Fix ACR authentication for the Web App**
  - If using a managed identity:
    - Get the Web App’s identity:

```bash
az webapp show -g <resource-group> -n <app-name> --query identity
```

    - Grant `AcrPull` on the ACR to that identity:

```bash
ACR_ID=$(az acr show --name <acr-name> --query id -o tsv)

az role assignment create \
  --assignee <webapp-identity-principal-or-client-id> \
  --role AcrPull \
  --scope "$ACR_ID"
```

  - If using ACR admin credentials instead (less recommended), ensure the App Service has the correct:
    - `docker_registry_url`
    - `docker_registry_username`
    - `docker_registry_password`

- **Step 3 – Verify infrastructure configuration (Terraform)**
  - In the Web App resource, confirm:
    - The image reference matches what exists in ACR, e.g.:
      - `linux_fx_version = "DOCKER|<acr-name>.azurecr.io/<repo>:<tag>"`
    - The registry auth mode matches how you configured access, e.g.:
      - `container_registry_use_managed_identity = true` (for managed identity).

  - After changes, run:

```bash
cd infra/terraform-app
terraform apply
```

- **Step 4 – Restart and verify health**

```bash
az webapp restart -g <resource-group> -n <app-name>
curl -v https://<app-name>.azurewebsites.net/health
```

If the image pulls successfully and the application code starts without errors, `/health` should return a 2xx status instead of the Azure Application Error page.

## Azure PostgreSQL connectivity and Alembic migration failures

When the backend container starts but `alembic upgrade head` fails, use the logs to determine whether the problem is network reachability, SSL configuration, or authentication.

### Symptom: `no pg_hba.conf entry ... no encryption`

This typically means the Azure Flexible Server is requiring SSL/TLS (or matching a `pg_hba.conf` rule that expects encryption), but the app is connecting without SSL.

1. In Azure App Service, ensure `DATABASE_URL` forces SSL for `postgresql+asyncpg` (asyncpg does not understand `sslmode` as a query parameter).
2. Use this URL form (note `ssl=require`, not `sslmode=require`):

```text
postgresql+asyncpg://<user>:<password>@<host>:5432/<db>?ssl=require
```

3. Restart the App Service so migrations run with the updated environment:

```bash
az webapp restart -g <resource-group> -n <app-name>
```

### Symptom: `TypeError: connect() got an unexpected keyword argument 'sslmode'`

This means you set `sslmode=require` in the `DATABASE_URL` while using the `postgresql+asyncpg://` driver.

Fix: replace `sslmode=require` with `ssl=require` in `DATABASE_URL`, then restart the App Service.

### Symptom: `socket.gaierror: [Errno -5] No address associated with hostname`

Alembic/asyncpg fails while opening a connection, before TLS or auth. The **hostname** in `DATABASE_URL` is wrong or does not resolve from the App Service container.

1. In **Azure Portal** → your backend Web App → **Configuration** → **Application settings**, open `DATABASE_URL` and confirm the host segment is your real **PostgreSQL Flexible Server** FQDN (for example `your-server.postgres.database.azure.com`). It must not be a placeholder such as the literal word `host` from [`infra/terraform-app/terraform.tfvars.example`](../infra/terraform-app/terraform.tfvars.example).
2. If you recently applied Terraform, verify `database_url` in your real `terraform.tfvars` (not the committed example) and run `terraform apply` again, then restart the Web App.
3. If the server uses **private access** and the Web App uses **VNet integration**, ensure the **private DNS zone** for PostgreSQL is linked to that VNet so the same FQDN resolves to the private endpoint from the app subnet.
4. If the database password contains `@`, `#`, `/`, or other reserved URL characters, **percent-encode** them in `DATABASE_URL` or the parser may treat the wrong substring as the hostname.

### Symptom: TCP connect to `host:5432` fails from your workstation

If port `5432` is blocked, you will see errors like “TCP connect failed” even if DNS resolves.

Validate from your workstation:

```powershell
Test-NetConnection -ComputerName "promptkb-pg.postgres.database.azure.com" -Port 5432
```

If `TcpTestSucceeded : False`, allow your public IP in Azure PostgreSQL firewall rules and re-test.

#### Fast allowlist validation path

1. Confirm your workstation public IP:

```powershell
(Invoke-RestMethod -Uri "https://api.ipify.org").Trim()
```

2. In the Azure Flexible Server resource, go to **Networking** -> **Firewall rules** and add a rule for that IP (start IP = end IP).
3. Re-run `Test-NetConnection` until `TcpTestSucceeded : True`.

### Symptom: `asyncpg.exceptions.InvalidPasswordError: password authentication failed`

This means network + SSL are working, and the remaining issue is credentials.

Validate from your workstation with `psql` (recommended) or a GUI client.

#### Option A: `psql`

1. Set the raw password in an env var (do not URL-encode it for `psql`):

```powershell
$env:PGPASSWORD="123456Ab#"
```

2. Connect:

```powershell
psql "host=promptkb-pg.postgres.database.azure.com port=5432 dbname=promptkb user='pgadmin@promptkb-pg' sslmode=require"
```

#### Option B: GUI tools

- `pgAdmin 4`
- `DBeaver`

In both cases, set:

- Host: `<server-name>.postgres.database.azure.com`
- Port: `5432`
- Username: `pgadmin@<server-name>`
- SSL: `require`

## Azure OAuth login succeeds but `/auth/me` returns 401

If OAuth callback returns `302` but the next `GET /auth/me` returns `401 {"detail":"Not authenticated"}`, the browser is usually not sending the `access_token` cookie to the API.

- **Symptom in backend logs**
  - `/auth/<provider>/login` -> `302`
  - `/auth/<provider>/callback?...` -> `302`
  - Immediate `/auth/me` -> `401`

- **Root cause**
  - In production, frontend and API are often on different origins.
  - If auth cookie is set with `SameSite=Lax`, browser excludes it on cross-site `fetch` calls (even with `credentials: include`).
  - Cross-origin auth requires `SameSite=None; Secure` on the JWT cookie.

- **Required backend env**
  - `FRONTEND_URL=https://<frontend-host>`
  - `REDIRECT_BASE_URL=https://<api-host>`
  - Optionally force cookie policy:
    - `AUTH_COOKIE_SAMESITE=none`
    - `AUTH_COOKIE_SECURE=true`

- **OAuth redirect URI check**
  - Redirect URI must match: `<REDIRECT_BASE_URL>/auth/<provider>/callback`
  - Example: `https://promptkb-api.azurewebsites.net/auth/google/callback`

- **Verification steps**
  1. Complete login flow in browser.
  2. In browser DevTools -> Network, inspect callback response headers and confirm:
     - `Set-Cookie: access_token=...; SameSite=None; Secure; HttpOnly`
  3. Inspect the `GET /auth/me` request and confirm cookie is included.
  4. If still failing, clear cookies for both frontend and API hosts and retry login.

## Terraform API apply fails for existing Web App

When running `terraform apply plan.tfplan` in `infra/terraform-app`, you may see an error like:

- `azurerm_linux_web_app.backend[0]: Creating...`
- `a resource with the ID ".../Microsoft.Web/sites/promptkb-api" already exists`
- `to be managed via Terraform this resource needs to be imported into the State`

This means the Azure Web App already exists, but Terraform state does not track it yet.

### Fix: import the existing Web App into Terraform state

From `infra/terraform-app` (PowerShell: escape `[` / `]` inside double-quoted strings with a backtick `` ` `` so `[0]` is not treated as a wildcard):

```powershell
..\terraform\terraform.exe import "azurerm_linux_web_app.backend`[0`]" "/subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.Web/sites/<app-name>"
```

For your concrete case:

```powershell
..\terraform\terraform.exe import "azurerm_linux_web_app.backend`[0`]" "/subscriptions/821d6eee-fe66-4c21-8e8b-ab80122b0d35/resourceGroups/promptkb-rg/providers/Microsoft.Web/sites/promptkb-api"
```

Then regenerate and apply a fresh plan (do not reuse the previous plan file after import):

```powershell
..\terraform\terraform.exe plan -out plan.tfplan
..\terraform\terraform.exe apply plan.tfplan
```

### Related plan error: output type mismatch in `backend_outbound_ip_addresses`

If plan fails with:

- `Error: Inconsistent conditional result types`
- true branch is `string` (`outbound_ip_addresses`)
- false branch is `tuple` (`[]`)

Update `infra/terraform-app/outputs.tf` so both branches are compatible:

```hcl
output "backend_outbound_ip_addresses" {
  description = "Backend App Service outbound IPs (use for PostgreSQL Flexible Server firewall allowlist when keeping public access)."
  value       = length(azurerm_linux_web_app.backend) > 0 ? azurerm_linux_web_app.backend[0].outbound_ip_addresses : null
}
```

Why: `azurerm_linux_web_app.backend[0].outbound_ip_addresses` is a comma-separated string, so `null` is a compatible fallback while `[]` is not.

### Terraform apply fails: `RoleAssignmentExists` (409) on `azurerm_role_assignment.backend_acr_pull`

If apply fails with:

- `unexpected status 409 (409 Conflict)` / `RoleAssignmentExists: The role assignment already exists`
- `The ID of the existing role assignment is <guid>`

Terraform is trying to create the **AcrPull** assignment on the ACR, but Azure already has that assignment (e.g. from a previous partial apply or manual grant).

**Fix: import** the existing assignment. The import ID is the **full ARM ID** of the role assignment:

`<acr-resource-id>/providers/Microsoft.Authorization/roleAssignments/<role-assignment-id>`

From `infra/terraform-app` (replace `<acr-name>`, `<resource-group>`, and `<assignment-id>` with your values; the error message includes `<assignment-id>`):

```powershell
..\terraform\terraform.exe import "azurerm_role_assignment.backend_acr_pull`[0`]" "/subscriptions/821d6eee-fe66-4c21-8e8b-ab80122b0d35/resourceGroups/promptkb-rg/providers/Microsoft.ContainerRegistry/registries/<acr-name>/providers/Microsoft.Authorization/roleAssignments/5f6f8c0d08bd7d831596a401775a0ba0"
```

If your registry name is `promptkb` (matches `acr_name` in `terraform.tfvars`):

```powershell
..\terraform\terraform.exe import "azurerm_role_assignment.backend_acr_pull`[0`]" "/subscriptions/821d6eee-fe66-4c21-8e8b-ab80122b0d35/resourceGroups/promptkb-rg/providers/Microsoft.ContainerRegistry/registries/promptkb/providers/Microsoft.Authorization/roleAssignments/5f6f8c0d08bd7d831596a401775a0ba0"
```

To confirm the exact import string from Azure:

```powershell
az role assignment list --scope (az acr show -g promptkb-rg -n promptkb --query id -o tsv) -o json
```

Use the `id` field of the row where `roleDefinitionName` is `AcrPull` and the principal matches the Web App’s managed identity.

Then run `plan` and `apply` again as above.

