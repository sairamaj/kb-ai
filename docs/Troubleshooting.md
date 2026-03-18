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

