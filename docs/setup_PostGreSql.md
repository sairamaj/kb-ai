### 1. Overview

- **Goal**: Set up a production-ready PostgreSQL database on Azure for this project using **Terraform** as a one-time, repeatable infrastructure definition.
- **Scope**: Initial focus is **production**. The database is provisioned once, then reused; schema migrations are handled by the application (Alembic), not Terraform.
- **Default posture**: Start with **Azure Database for PostgreSQL – Flexible Server** using **public network access** and IP-based firewall rules, with a documented path to move to private networking later.

---

### 2. Options for PostgreSQL on Azure

#### 2.1 Azure Database for PostgreSQL – Flexible Server (recommended)

- **What it is**: Fully managed PostgreSQL service (PaaS) with flexible compute/storage, built-in backups, optional high availability, and both public and private networking options.
- **Pros**:
  - Managed backups with configurable retention and optional geo-redundant backup.
  - Optional **zone-redundant high availability** in supported regions.
  - No OS or patch management; Azure handles PostgreSQL engine updates within the selected major version.
  - Supports public access (with firewall) and private access (VNet integration).
  - Good fit for production workloads that need reliability but not custom OS-level tuning.
- **Cons**:
  - Less control over OS and certain low-level tuning compared to VMs/AKS.
  - Some extensions and configurations may not be available vs self-managed PostgreSQL.

#### 2.2 Azure Database for PostgreSQL – Single Server (legacy)

- **What it is**: Older managed PostgreSQL offering in maintenance mode.
- **Pros**:
  - Managed service similar in concept to Flexible Server.
- **Cons**:
  - New features and investments are focused on **Flexible Server**.
  - Not recommended for **new** deployments; migration paths are towards Flexible Server.

**Conclusion**: Avoid Single Server for new environments; use Flexible Server instead.

#### 2.3 PostgreSQL on Azure Virtual Machines (IaaS)

- **What it is**: PostgreSQL installed on an Azure VM (Linux/Windows) that you manage.
- **Pros**:
  - Full control over OS, PostgreSQL versioning, extensions, and configuration.
  - Can run sidecar services or more complex setups on the same VM.
- **Cons**:
  - You own OS patching, PostgreSQL patching, backup strategy, HA, and monitoring.
  - More operational overhead; less “set-and-forget” than PaaS.

**Conclusion**: Use only if you need OS-level control or unsupported extensions and are willing to manage operations.

#### 2.4 PostgreSQL in AKS (Kubernetes)

- **What it is**: PostgreSQL deployed as a StatefulSet in Azure Kubernetes Service (e.g. Helm charts or operators).
- **Pros**:
  - Can integrate tightly with app workloads in the same cluster.
  - Advanced operators (e.g. Crunchy, CloudNativePG) offer HA, backup, and failover.
- **Cons**:
  - Requires Kubernetes expertise and additional operations overhead.
  - You remain responsible for backup configuration, upgrades, and capacity planning.

**Conclusion**: Prefer only if you already have mature AKS operations and a strong reason to run the database in-cluster.

#### 2.5 Summary comparison

| Option | Managed by Azure (ops) | HA support | Network options | Operational effort | Recommended for this project? |
|--------|------------------------|-----------|-----------------|--------------------|-------------------------------|
| PostgreSQL – Flexible Server | Most (backup, patching, infra) | Optional zone-redundant | Public + private (VNet) | Low–medium | **Yes (recommended)** |
| PostgreSQL – Single Server | Most, but legacy | Basic | Public + private (older model) | Low–medium | No (legacy) |
| PostgreSQL on VM | You | DIY (e.g. Patroni, PGPool) | Public + VNet | High | No, unless special needs |
| PostgreSQL on AKS | You (via operator/Helm) | Operator-dependent | Cluster networking | High | No, unless AKS-first org |

---

### 3. Recommended approach

- **Service**: **Azure Database for PostgreSQL – Flexible Server**.
- **Environment**: Start with **production**; reuse the same pattern for other environments if needed.
- **Networking**:
  - Initially enable **public network access**.
  - Restrict access via **firewall rules** to specific IP ranges (avoid `0.0.0.0/0` even for testing).
  - Documented path to move to **private VNet integration** later.
- **Configuration recommendations** (tune as needed):
  - **Version**: PostgreSQL **15**.
  - **SKU**: General Purpose tier, e.g. `GP_Standard_D4s_v3`, sized according to expected workload.
  - **Storage**: Start around **32 GB** (`32768` MB) with auto-grow; increase as needed.
  - **Backups**: Minimum **7 days** retention; consider enabling geo-redundant backups for production.
  - **High availability**: Optional **zone-redundant HA** in supported regions (recommended if uptime is critical).
  - **Security**:
    - Strong admin password, managed outside git (environment variables / secret store).
    - Enforce SSL from the application.

---

### 4. Terraform setup (one-time provisioning)

Terraform is used for **one-time (but re-runnable)** provisioning of the PostgreSQL Flexible Server, its primary database, and firewall rules. Application schema migrations remain separate.

#### 4.1 Files and structure

Under **`infra/terraform-app`** (app + database stack; CI uses `infra/terraform-acr` only):

- `main.tf` — Provider, data sources, App Service resources.
- `variables.tf` — Variables including PostgreSQL settings.
- `postgresql.tf` — PostgreSQL Flexible Server, database, and firewall rules.
- `outputs.tf` — ACR, backend URL, and PostgreSQL outputs.
- `terraform.tfvars` — Per-environment values (never committed) including PostgreSQL configuration and secrets.

#### 4.2 PostgreSQL-related variables

Key variables added in `variables.tf`:

- **Core server settings**
  - `pg_server_name` — Globally unique server name (e.g. `promptkb-pg`).
  - `pg_version` — PostgreSQL major version (e.g. `"15"`).
  - `pg_sku_name` — SKU name, e.g. `"GP_Standard_D4s_v3"`.
  - `pg_storage_mb` — Storage in MB (e.g. `32768`).
  - `pg_backup_retention_days` — Backup retention in days (e.g. `7`).
  - `pg_geo_redundant_backup_enabled` — `true`/`false` for geo-redundant backups.
  - `pg_ha_enabled` — `true`/`false` to enable zone-redundant HA (where available).

- **Admin and database**
  - `pg_admin_login` — Administrator login name (e.g. `pgadmin`).
  - `pg_admin_password` — Administrator password (**sensitive**; pass via environment or tfvars, do not commit).
  - `pg_database_name` — Primary database name (e.g. `promptkb`).

- **Networking**
  - `pg_public_network_access_enabled` — `true` to allow public access, `false` when switching to private networking.
  - `pg_firewall_rules` — Map of firewall rules keyed by rule name, each with `start_ip` and `end_ip` (strings).

Example PostgreSQL entries in `terraform.tfvars` (values are examples only — do **not** commit real secrets):

```hcl
pg_server_name  = "promptkb-pg-prod"
pg_version      = "15"
pg_sku_name     = "GP_Standard_D4s_v3"
pg_storage_mb   = 32768

pg_backup_retention_days        = 7
pg_geo_redundant_backup_enabled = false
pg_ha_enabled                   = false

pg_admin_login    = "pgadmin"
pg_admin_password = "REPLACE_WITH_STRONG_PASSWORD"
pg_database_name  = "promptkb"

pg_public_network_access_enabled = true

pg_firewall_rules = {
  "office-ip" = {
    start_ip = "203.0.113.10"
    end_ip   = "203.0.113.10"
  }
  "home-ip" = {
    start_ip = "198.51.100.20"
    end_ip   = "198.51.100.20"
  }
}
```

> **Note**: Keep `terraform.tfvars` out of version control. Use `.gitignore` and store real passwords/IPs in a secure place.

#### 4.3 Terraform resources

In `postgresql.tf`, Terraform defines:

- `azurerm_postgresql_flexible_server.promptkb`
  - Uses the existing `data.azurerm_resource_group.promptkb` (created outside Terraform, as described in `docs/developer.md`).
  - Configures version, SKU, storage, backup retention, optional geo-redundant backup, optional HA, and network access based on the variables above.
- `azurerm_postgresql_flexible_server_database.promptkb`
  - Creates the primary logical database specified by `pg_database_name`.
- `azurerm_postgresql_flexible_server_firewall_rule.promptkb`
  - Creates one firewall rule per entry in `pg_firewall_rules`, keyed by rule name; each rule sets `start_ip_address` and `end_ip_address`.

This setup is **idempotent**: you can re-run `terraform apply` safely to detect and apply changes.

#### 4.4 Running Terraform for PostgreSQL

From the repo root:

```powershell
cd infra/terraform-app

# First time only (if backend not yet initialized)
terraform init

# Review changes
terraform plan -out=plan.tfplan

# Apply changes
terraform apply plan.tfplan
```

After `apply` completes, Terraform outputs include the PostgreSQL connection details (see next section).

---

### 5. Connection and usage

#### 5.1 Terraform outputs

`outputs.tf` exposes key PostgreSQL values:

- `postgres_flexible_server_fqdn` — Server FQDN (host).
- `postgres_database_name` — Primary database name.
- `postgres_admin_login` — Admin login (without `@server` suffix).

Retrieve them with:

```powershell
cd infra/terraform-app
terraform output postgres_flexible_server_fqdn
terraform output postgres_database_name
terraform output postgres_admin_login
```

#### 5.2 Building the `DATABASE_URL`

The backend expects a SQLAlchemy-style PostgreSQL URL, for example:

```text
postgresql+asyncpg://<user>:<password>@<host>:5432/<database>
```

For admin access:

- **User**: `<postgres_admin_login>@<pg_server_name>`
- **Password**: `pg_admin_password` from your secure store.
- **Host**: `postgres_flexible_server_fqdn`.
- **Database**: `postgres_database_name`.

Example (do not use in production):

```text
postgresql+asyncpg://pgadmin@promptkb-pg-prod:SuperSecretPassword123!@promptkb-pg-prod.postgres.database.azure.com:5432/promptkb
```

Use this URL as the `database_url` variable for Terraform / App Service configuration, or pass it as `DATABASE_URL` to the backend container.

#### 5.3 Using the database from the backend

Once Terraform has provisioned the server and database:

- Set `database_url` in `terraform.tfvars` to the correct URL.
- Deploy or reconfigure the backend Web App (as described in `docs/developer.md`, Z4-06).
- The backend’s `/health` endpoint will report `"db": "ok"` when it can reach the PostgreSQL Flexible Server.

---

### 6. Future enhancements and hardening

#### 6.1 Move to private networking

Once the backend is running in Azure and you have a VNet in place, you can:

- Introduce a delegated subnet and private DNS zone for PostgreSQL Flexible Server.
- Update `azurerm_postgresql_flexible_server` to use:
  - `delegated_subnet_id` referencing the subnet.
  - `private_dns_zone_id` referencing the private DNS zone.
- Set `pg_public_network_access_enabled = false` and gradually remove public firewall rules once all traffic is via private networking.

This change can be applied through Terraform while preserving data.

#### 6.2 Secrets management

- Move PostgreSQL credentials into **Azure Key Vault** and reference them from:
  - App Service app settings using Key Vault references.
  - CI/CD systems as secrets.
- Keep Terraform aware of only what it needs (e.g. connection strings via variables sourced from secure stores).

#### 6.3 Monitoring and alerting

- Enable monitoring via **Azure Monitor**:
  - Metrics: CPU, memory, storage, connections, deadlocks.
  - Alerts: high CPU, low storage, connection saturation, backup failures.
- Optionally send logs/metrics to Log Analytics or another sink for deeper analysis.

---

### 7. One-time vs ongoing operations

- **Terraform (one-time/occasional)**:
  - Provision the PostgreSQL Flexible Server and primary database.
  - Adjust capacity (SKU, storage) and core settings when required.
  - Manage firewall rules and (later) private networking configuration.

- **Application / operations (ongoing)**:
  - Manage schema changes via Alembic migrations.
  - Manage users, roles, and permissions within PostgreSQL.
  - Monitor performance and adjust Terraform settings when necessary.

This separation keeps Terraform focused on **infrastructure provisioning** while the application owns **schema and data lifecycle**.

