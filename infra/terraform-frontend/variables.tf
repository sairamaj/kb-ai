variable "resource_group_name" {
  description = "Existing Azure resource group where ACR lives and where the frontend Web App will be created."
  type        = string
}

variable "app_service_plan_resource_group_name" {
  description = "Resource group containing the App Service plan (existing or to be created). Use for a dedicated test plan RG; omit/null to use resource_group_name."
  type        = string
  default     = null
}

variable "acr_name" {
  description = "Azure Container Registry name (same registry as backend; images include promptkb-web)."
  type        = string
}

# ---------------------------------------------------------------------------
# Z4-09 — Frontend Web App
# ---------------------------------------------------------------------------

variable "frontend_enabled" {
  description = "Create the frontend Web App (set true when deploying Z4-09)."
  type        = bool
  default     = false
}

variable "frontend_app_name" {
  description = "Globally unique Web App name (e.g. promptkb for https://promptkb.azurewebsites.net)."
  type        = string
  default     = "promptkb"
}

variable "frontend_image_tag" {
  description = "Container image tag for promptkb-web in ACR (commit SHA, version, or latest)."
  type        = string
  default     = "latest"
}

variable "frontend_health_check_eviction_time_in_min" {
  description = "Minutes before evicting an unhealthy instance when health_check_path is set."
  type        = number
  default     = 2
}

variable "plan_name" {
  description = "App Service plan name to create when use_existing_plan is false."
  type        = string
  default     = "promptkb-frontend-plan"
}

variable "plan_sku_name" {
  description = "SKU for the created plan (B1+ recommended for Always On). F1 disables always_on in main.tf."
  type        = string
  default     = "B1"
}

variable "use_existing_plan" {
  description = "If true, attach the Web App to an existing plan (e.g. shared with backend or a test plan)."
  type        = bool
  default     = false
}

variable "existing_plan_name" {
  description = "Existing plan name when use_existing_plan is true (must be in app_service_plan_resource_group_name RG)."
  type        = string
  default     = ""
}

variable "backend_api_public_url" {
  description = "Public backend base URL (no trailing slash), e.g. https://promptkb-api.azurewebsites.net. Stored as app setting for operators; the SPA must be built with the same value as Docker build-arg VITE_API_BASE_URL."
  type        = string
  default     = ""
}
