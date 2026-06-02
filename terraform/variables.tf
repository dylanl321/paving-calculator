variable "cloudflare_api_token" {
  description = "Cloudflare API token with permissions for Pages, D1, DNS, R2"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
  default     = "5607dd23b8b5465da7f08be9b0acbcd6"
}

variable "domain" {
  description = "Primary domain for PaveRate"
  type        = string
  default     = "paverate.com"
}
