terraform {
  required_version = ">= 1.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # State backend: Cloudflare R2 via S3-compatible API
  # Create R2 API keys in CF dashboard: R2 → Manage R2 API Tokens → Create API Token
  # Then set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars
  backend "s3" {
    bucket                      = "terraform-state"
    key                         = "paverate/terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    endpoints = {
      s3 = "https://5607dd23b8b5465da7f08be9b0acbcd6.r2.cloudflarestorage.com"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
