# Terraform — App, database, backend Web App

This root manages:

- Azure Database for PostgreSQL Flexible Server
- App Service plan and Linux Web App (Z4-06) when `backend_enabled = true`
- ACR is **read** via data source (create ACR outside Terraform; same as before)

**CI/CD (image build/push)** uses **`../terraform-acr`** only in the **Z4-04** workflow. The **Z4-11** pipeline ([`.github/workflows/ci-cd-deploy.yml`](../../.github/workflows/ci-cd-deploy.yml)) also runs **`terraform apply`** in this directory to roll **`backend_image_tag`** after pushing images. See [docs/developer.md](../../docs/developer.md) (Z4-11).

## Migrating from `infra/terraform/`

If you previously applied from the old single root:

1. Copy `terraform.tfvars` to this directory (same variable names).
2. Move state so Terraform still tracks existing resources:
   - **Local state:** copy `.terraform/terraform.tfstate` (or entire `.terraform`) from the old folder into this directory, then `terraform init`.
   - **Remote backend:** re-point backend config if needed, or `terraform state pull` / `push` per your process.

If you start fresh here without migrating state, the next `apply` may try to create duplicate resources — use state migration or `terraform import` as appropriate.
