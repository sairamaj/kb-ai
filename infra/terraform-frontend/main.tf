terraform {
  required_version = ">= 1.5.0"

  backend "azurerm" {
    resource_group_name  = "promptkb-rg"
    storage_account_name = "promptkb"
    container_name       = "tfstate"
    key                  = "terraform-frontend.tfstate"
  }

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

# Z4-09 — Frontend Web App for Containers (Linux, image from ACR).
# ACR and main RG are expected to exist (same pattern as terraform-app backend).
# App Service plan: create new or use existing; plan may live in a different RG
# (e.g. dedicated test plan RG), matching terraform-app backend behavior.

data "azurerm_resource_group" "promptkb" {
  name = var.resource_group_name
}

data "azurerm_container_registry" "promptkb" {
  name                = var.acr_name
  resource_group_name = var.resource_group_name
}

locals {
  app_service_plan_rg_name = coalesce(var.app_service_plan_resource_group_name, var.resource_group_name)
}

data "azurerm_resource_group" "app_service_plan_rg" {
  name = local.app_service_plan_rg_name
}

data "azurerm_service_plan" "existing_frontend" {
  count               = var.frontend_enabled && var.use_existing_plan ? 1 : 0
  name                = var.existing_plan_name
  resource_group_name = data.azurerm_resource_group.app_service_plan_rg.name
}

locals {
  frontend_service_plan_id = var.frontend_enabled ? coalesce(
    try(data.azurerm_service_plan.existing_frontend[0].id, null),
    try(azurerm_service_plan.promptkb_frontend[0].id, null),
  ) : null
  frontend_web_app_location = !var.frontend_enabled ? data.azurerm_resource_group.promptkb.location : (
    var.use_existing_plan ? data.azurerm_service_plan.existing_frontend[0].location : azurerm_service_plan.promptkb_frontend[0].location
  )
}

resource "azurerm_service_plan" "promptkb_frontend" {
  count               = var.frontend_enabled && !var.use_existing_plan ? 1 : 0
  name                = var.plan_name
  location            = data.azurerm_resource_group.app_service_plan_rg.location
  resource_group_name = data.azurerm_resource_group.app_service_plan_rg.name
  os_type             = "Linux"
  sku_name            = var.plan_sku_name
}

resource "azurerm_linux_web_app" "frontend" {
  count               = var.frontend_enabled ? 1 : 0
  name                = var.frontend_app_name
  location            = local.frontend_web_app_location
  resource_group_name = data.azurerm_resource_group.promptkb.name
  service_plan_id     = local.frontend_service_plan_id
  https_only          = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = var.plan_sku_name != "F1"

    application_stack {
      docker_image_name   = "promptkb-web:${var.frontend_image_tag}"
      docker_registry_url = "https://${data.azurerm_container_registry.promptkb.login_server}"
    }

    container_registry_use_managed_identity = true
    health_check_path                       = "/"
    health_check_eviction_time_in_min       = var.frontend_health_check_eviction_time_in_min
  }

  app_settings = {
    "WEBSITES_PORT" = "8080"
    # Reference only: SPA uses VITE_API_BASE_URL baked at image build time.
    "BACKEND_API_PUBLIC_URL" = var.backend_api_public_url
  }
}

resource "azurerm_role_assignment" "frontend_acr_pull" {
  count                = var.frontend_enabled ? 1 : 0
  scope                = data.azurerm_container_registry.promptkb.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.frontend[0].identity[0].principal_id
}
