# Minimal Terraform root for CI/CD (Z4-04): resolve ACR name and login server.
# Resource group and ACR must exist (created via Azure CLI or portal).
# App Service, PostgreSQL, etc. live in ../terraform-app.

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

data "azurerm_resource_group" "promptkb" {
  name = var.resource_group_name
}

data "azurerm_container_registry" "promptkb" {
  name                = var.acr_name
  resource_group_name = var.resource_group_name
}
