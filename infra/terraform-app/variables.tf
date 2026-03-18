variable "resource_group_name" {
  description = "Name of the existing Azure resource group where ACR and the backend Web App live."
  type        = string
}

variable "app_service_plan_resource_group_name" {
  description = "Resource group containing the App Service plan (existing or to be created). Use when the plan is in a different RG than ACR/Web App; omit or null to use resource_group_name."
  type        = string
  default     = null
}

variable "acr_name" {
  description = "Globally unique name for the Azure Container Registry (3-50 alphanumeric characters)."
  type        = string
}

# ---------------------------------------------------------------------------
# Z4-06 — Backend Web App for Containers
# ---------------------------------------------------------------------------

variable "backend_enabled" {
  description = "Create the backend Web App (set to true when deploying Z4-06)."
  type        = bool
  default     = false
}

variable "backend_app_name" {
  description = "Globally unique name for the backend Web App (e.g. promptkb-api)."
  type        = string
  default     = "promptkb-api"
}

variable "backend_image_tag" {
  description = "Container image tag for the backend (e.g. commit SHA or semantic version)."
  type        = string
  default     = "latest"
}

variable "backend_health_check_eviction_time_in_min" {
  description = "How long (in minutes) the platform waits before evicting an unhealthy instance from the load balancer, when health_check_path is enabled."
  type        = number
  default     = 2
}

variable "plan_name" {
  description = "Name of the App Service plan to create when not using an existing plan."
  type        = string
  default     = "promptkb-plan"
}

variable "use_existing_plan" {
  description = "If true, use an existing App Service plan instead of creating a new one."
  type        = bool
  default     = false
}

variable "existing_plan_name" {
  description = "Name of the existing App Service plan to use when use_existing_plan=true."
  type        = string
  default     = ""
}

# App settings — pass via TF_VAR_* or -var / .tfvars (do not commit secrets).
variable "database_url" {
  description = "PostgreSQL connection string for the backend (required when backend_enabled=true)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "secret_key" {
  description = "JWT secret key for the backend (required when backend_enabled=true)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_api_key" {
  description = "OpenAI API key for chat."
  type        = string
  sensitive   = true
  default     = ""
}

variable "gemini_api_key" {
  description = "Optional Gemini API key."
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_id" {
  description = "Google OAuth client ID."
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret."
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_client_id" {
  description = "GitHub OAuth client ID."
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_client_secret" {
  description = "GitHub OAuth client secret."
  type        = string
  sensitive   = true
  default     = ""
}

variable "redirect_base_url" {
  description = "OAuth redirect base URL (e.g. https://promptkb-api.azurewebsites.net/api). Required when backend_enabled=true."
  type        = string
  default     = ""
}

variable "frontend_url" {
  description = "Frontend origin for CORS and redirects (e.g. https://promptkb.azurewebsites.net). Required when backend_enabled=true."
  type        = string
  default     = ""
}

