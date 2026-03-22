output "postgres_flexible_server_fqdn" {
  description = "Fully qualified domain name (host) of the PostgreSQL Flexible Server."
  value       = azurerm_postgresql_flexible_server.promptkb.fqdn
}

output "postgres_database_name" {
  description = "Primary PostgreSQL database name."
  value       = azurerm_postgresql_flexible_server_database.promptkb.name
}

output "postgres_admin_login" {
  description = "PostgreSQL administrator login (without @server suffix)."
  value       = azurerm_postgresql_flexible_server.promptkb.administrator_login
}

