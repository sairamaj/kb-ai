# Moved

Terraform roots have been split:

| Use | Path |
|-----|------|
| **CI — build & push images (Z4-04)** | [`../terraform-acr`](../terraform-acr) |
| **App Service, PostgreSQL, backend Web App** | [`../terraform-app`](../terraform-app) |

If you have `terraform.tfvars` or local state here, copy them to **`infra/terraform-app`** and follow the migration note in that folder’s README.
