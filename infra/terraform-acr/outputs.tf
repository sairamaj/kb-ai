output "acr_name" {
  description = "Name of the Azure Container Registry."
  value       = data.azurerm_container_registry.promptkb.name
}

output "acr_login_server" {
  description = "Login server (FQDN) for the Azure Container Registry."
  value       = data.azurerm_container_registry.promptkb.login_server
}
