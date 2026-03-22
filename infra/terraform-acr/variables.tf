variable "resource_group_name" {
  description = "Name of the existing Azure resource group that contains the Container Registry."
  type        = string
}

variable "acr_name" {
  description = "Name of the existing Azure Container Registry (globally unique)."
  type        = string
}
