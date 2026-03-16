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

resource "azurerm_container_registry" "promptkb" {
  name                = var.acr_name
  resource_group_name = data.azurerm_resource_group.promptkb.name
  location            = data.azurerm_resource_group.promptkb.location

  sku           = "Basic"
  admin_enabled = false

  tags = var.tags
}

