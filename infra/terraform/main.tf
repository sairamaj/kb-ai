terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}

# One-time setup: Create resource group and ACR outside Terraform (e.g. Azure CLI or portal).
# Terraform reads existing ACR and RG; creates App Service plan and Web App (Z4-06).

data "azurerm_resource_group" "promptkb" {
  name = var.resource_group_name
}

data "azurerm_container_registry" "promptkb" {
  name                = var.acr_name
  resource_group_name = var.resource_group_name
}

# ---------------------------------------------------------------------------
# Z4-06 — Backend Web App for Containers
# ---------------------------------------------------------------------------

resource "azurerm_service_plan" "promptkb" {
  count               = var.backend_enabled ? 1 : 0
  name                = var.plan_name
  location            = data.azurerm_resource_group.promptkb.location
  resource_group_name = data.azurerm_resource_group.promptkb.name
  os_type             = "Linux"
  sku_name            = "B1" # Basic for Always On
}

resource "azurerm_linux_web_app" "backend" {
  count               = var.backend_enabled ? 1 : 0
  name                = var.backend_app_name
  location            = data.azurerm_resource_group.promptkb.location
  resource_group_name = data.azurerm_resource_group.promptkb.name
  service_plan_id     = azurerm_service_plan.promptkb[0].id
  https_only          = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = true

    application_stack {
      docker_image_name   = "promptkb-api:${var.backend_image_tag}"
      docker_registry_url = "https://${data.azurerm_container_registry.promptkb.login_server}"
    }

    container_registry_use_managed_identity = true
    health_check_path                       = "/health"
    health_check_eviction_time_in_min       = var.backend_health_check_eviction_time_in_min
  }

  app_settings = {
    "WEBSITES_PORT"              = "8000"

    "DATABASE_URL"      = var.database_url
    "SECRET_KEY"        = var.secret_key
    "FRONTEND_URL"      = var.frontend_url
    "REDIRECT_BASE_URL" = var.redirect_base_url

    "OPENAI_API_KEY" = var.openai_api_key
    "GEMINI_API_KEY" = var.gemini_api_key

    "GOOGLE_CLIENT_ID"     = var.google_client_id
    "GOOGLE_CLIENT_SECRET" = var.google_client_secret
    "GITHUB_CLIENT_ID"     = var.github_client_id
    "GITHUB_CLIENT_SECRET" = var.github_client_secret
  }
}

resource "azurerm_role_assignment" "backend_acr_pull" {
  count                = var.backend_enabled ? 1 : 0
  scope                = data.azurerm_container_registry.promptkb.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.backend[0].identity[0].principal_id
}

