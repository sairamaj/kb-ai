output "acr_name" {
  description = "Azure Container Registry name."
  value       = data.azurerm_container_registry.promptkb.name
}

output "acr_login_server" {
  description = "ACR login server FQDN."
  value       = data.azurerm_container_registry.promptkb.login_server
}

output "frontend_url" {
  description = "Frontend Web App HTTPS URL (Z4-09)."
  value       = length(azurerm_linux_web_app.frontend) > 0 ? "https://${azurerm_linux_web_app.frontend[0].default_hostname}" : null
}

output "frontend_default_hostname" {
  description = "Default hostname of the frontend Web App."
  value       = length(azurerm_linux_web_app.frontend) > 0 ? azurerm_linux_web_app.frontend[0].default_hostname : null
}

output "frontend_service_plan_id" {
  description = "ID of the App Service plan used by the frontend (created or existing)."
  value       = var.frontend_enabled ? local.frontend_service_plan_id : null
}
