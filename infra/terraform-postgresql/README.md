# Terraform module: PostgreSQL

This directory contains a standalone Terraform configuration for **Azure Database for PostgreSQL – Flexible Server** used by PromptKB.

## What this module does

- Creates a PostgreSQL Flexible Server
- Creates a primary database
- Configures firewall rules

It does **not** create any web apps or container registry resources.

## Usage (high level)

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and edit values.
2. Run:

   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

3. Use the outputs (`postgres_flexible_server_fqdn`, `postgres_database_name`, `postgres_admin_login`) to build your `DATABASE_URL` for the web app module.

