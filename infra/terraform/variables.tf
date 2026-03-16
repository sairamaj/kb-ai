variable "resource_group_name" {
  description = "Name of the existing Azure resource group where ACR will be created."
  type        = string
}

variable "acr_name" {
  description = "Globally unique name for the Azure Container Registry (3-50 alphanumeric characters)."
  type        = string
}

variable "tags" {
  description = "Common tags to apply to ACR."
  type        = map(string)
  default     = {}
}

