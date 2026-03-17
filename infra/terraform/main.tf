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
# This module only reads existing resources and outputs values for CI/CD — fully rerunnable.

data "azurerm_container_registry" "promptkb" {
  name                = var.acr_name
  resource_group_name = var.resource_group_name
}

