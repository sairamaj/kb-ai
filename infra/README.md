# Azure infrastructure (Terraform)

| Directory | Purpose | Used by |
|-----------|---------|---------|
| **`terraform-acr`** | Data sources only: resolve ACR name and login server. | GitHub Actions Z4-04 (build and push images). |
| **`terraform-app`** | PostgreSQL Flexible Server, backend Web App, App Service plan. | Manual / pipeline deploy of app and database. |
| **`terraform-frontend`** | Frontend Web App for Containers (`promptkb-web` from ACR), optional dedicated App Service plan (incl. separate plan RG for test). | Z4-09; apply from this directory for frontend-only or staging. |

Run `terraform init` and `terraform apply` from **inside** the directory you need.
