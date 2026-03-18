output "acr_name" {
  description = "Name of the Azure Container Registry."
  value       = data.azurerm_container_registry.promptkb.name
}

output "acr_login_server" {
  description = "Login server (FQDN) for the Azure Container Registry."
  value       = data.azurerm_container_registry.promptkb.login_server
}

output "backend_url" {
  description = "Backend Web App URL (Z4-06)."
  value       = length(azurerm_linux_web_app.backend) > 0 ? "https://${azurerm_linux_web_app.backend[0].default_hostname}" : null
}

output "backend_outbound_ip_addresses" {
  description = "Backend App Service outbound IPs (use for PostgreSQL Flexible Server firewall allowlist when keeping public access)."
  value       = length(azurerm_linux_web_app.backend) > 0 ? azurerm_linux_web_app.backend[0].outbound_ip_addresses : []
}

