# TODO / Backlog

## Networking: move from public allowlist to private access

- Status: `pending`
- When: after the quick allowlist approach is stable.

### Proper approach (recommended)

1. Add VNet integration for the backend Web App so traffic can reach services privately.
2. Create a PostgreSQL **Private Endpoint** for the Azure Database for PostgreSQL Flexible Server.
3. Add a **Private DNS zone** for PostgreSQL and link it to the VNet (so the Flexible Server hostname resolves to the private IP).
4. Update PostgreSQL Terraform:
   - set `pg_public_network_access_enabled = false`
   - remove (or keep empty) `pg_firewall_rules`
   - wire `delegated_subnet_id` and `private_dns_zone_id` into the Flexible Server.
5. Validate:
   - `GET /health` returns `"db":"ok"` on the backend container.
   - migrations succeed on startup (`alembic upgrade head`).

### Files to revisit later

- `docs/setup_PostGreSql.md` (see “Future enhancements and hardening” → move to private networking)
- `infra/terraform-postgresql/postgresql.tf` (extend Flexible Server config for delegated subnet + private DNS)
- `infra/terraform-app/main.tf` (add Web App VNet integration if not already present)

---

## Quick allowlist (now)

For now we keep `pg_public_network_access_enabled = true` and allowlist by source IPs:

- Terraform output: `infra/terraform-app/outputs.tf` exposes `backend_outbound_ip_addresses`.
- Terraform input: `infra/terraform-postgresql` supports `pg_allowed_source_ips` so you can paste that list directly.

