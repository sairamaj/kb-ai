variable "resource_group_name" {
  description = "Name of the existing Azure resource group where the PostgreSQL Flexible Server will live."
  type        = string
}

#
# PostgreSQL Flexible Server (Azure Database for PostgreSQL)
#

variable "pg_server_name" {
  description = "Name of the Azure Database for PostgreSQL Flexible Server (must be globally unique)."
  type        = string
  default     = "promptkb-pg"
}

variable "pg_version" {
  description = "PostgreSQL major version for the Flexible Server."
  type        = string
  default     = "15"
}

variable "pg_sku_name" {
  description = "SKU name for the PostgreSQL Flexible Server (e.g. GP_Standard_D4s_v3)."
  type        = string
  default     = "GP_Standard_D4s_v3"
}

variable "pg_storage_mb" {
  description = "Allocated storage size for PostgreSQL Flexible Server, in megabytes (e.g. 32768 for 32 GB)."
  type        = number
  default     = 32768
}

variable "pg_backup_retention_days" {
  description = "Backup retention in days for PostgreSQL Flexible Server."
  type        = number
  default     = 7
}

variable "pg_geo_redundant_backup_enabled" {
  description = "Enable geo-redundant backups for PostgreSQL Flexible Server."
  type        = bool
  default     = false
}

variable "pg_ha_enabled" {
  description = "Enable zone-redundant high availability for PostgreSQL Flexible Server when available in the selected region."
  type        = bool
  default     = false
}

variable "pg_admin_login" {
  description = "Administrator login name for PostgreSQL Flexible Server."
  type        = string
  default     = "pgadmin"
}

variable "pg_admin_password" {
  description = "Administrator password for PostgreSQL Flexible Server. Pass via environment variable or tfvars; do not commit secrets."
  type        = string
  sensitive   = true
  default     = ""
}

variable "pg_database_name" {
  description = "Primary database name to create on the PostgreSQL Flexible Server."
  type        = string
  default     = "promptkb"
}

variable "pg_public_network_access_enabled" {
  description = "Whether to enable public network access for PostgreSQL Flexible Server."
  type        = bool
  default     = true
}

variable "pg_firewall_rules" {
  description = "Firewall allowlist rules for PostgreSQL Flexible Server when public access is enabled. Populate with your client source IPs (for example: the backend App Service outbound IPs)."
  type = map(object({
    start_ip = string
    end_ip   = string
  }))
  default = {}
}

variable "pg_allowed_source_ips" {
  description = "Simplified allowlist: list of individual IPv4 addresses to allow when `pg_public_network_access_enabled = true`. When set, Terraform will create firewall rules with `start_ip_address = end_ip_address = <ip>`. Prefer this over `pg_firewall_rules` for the common case."
  type        = list(string)
  default     = []
}

variable "pg_azure_extensions" {
  description = "Azure allow-list for PostgreSQL extensions via server parameter `azure.extensions` (e.g. [\"vector\"] for pgvector/pgvector extension name `vector`)."
  type        = list(string)
  default     = ["vector"]
}

