# Terraform — ACR (CI only)

Used by **GitHub Actions** (Z4-04 build-and-push) to read the existing ACR and export `acr_name` / `acr_login_server` for Docker push.

- Does **not** create PostgreSQL or App Service.
- For backend, database, and full infra, use **`../terraform-app`**.
