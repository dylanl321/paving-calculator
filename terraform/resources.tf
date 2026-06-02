# ─────────────────────────────────────────────
# DNS Zone
# ─────────────────────────────────────────────

data "cloudflare_zone" "paverate" {
  filter = {
    account_id = var.cloudflare_account_id
    name       = var.domain
  }
}

# ─────────────────────────────────────────────
# DNS Records
# ─────────────────────────────────────────────

resource "cloudflare_dns_record" "root" {
  zone_id = data.cloudflare_zone.paverate.zone_id
  name    = var.domain
  content = "paverate.pages.dev"
  type    = "CNAME"
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "www" {
  zone_id = data.cloudflare_zone.paverate.zone_id
  name    = "www"
  content = "paverate.pages.dev"
  type    = "CNAME"
  proxied = true
  ttl     = 1
}

# ─────────────────────────────────────────────
# Cloudflare Pages Project
# ─────────────────────────────────────────────

resource "cloudflare_pages_project" "paverate" {
  account_id = var.cloudflare_account_id
  name       = "paverate"

  production_branch = "main"

  build_config = {
    build_command   = "npm install && npm run build"
    destination_dir = ".svelte-kit/cloudflare"
    root_dir        = ""
  }

  source = {
    type = "github"
    config = {
      owner                         = "dylanl321"
      repo_name                     = "paving-calculator"
      production_branch             = "main"
      pr_comments_enabled           = true
      deployments_enabled           = true
      production_deployments_enabled = true
      preview_deployment_setting    = "all"
      preview_branch_includes       = ["*"]
      preview_branch_excludes       = []
    }
  }

  deployment_configs = {
    production = {
      compatibility_date  = "2026-06-01"
      compatibility_flags = ["nodejs_compat"]
    }
    preview = {
      compatibility_date  = "2026-06-01"
      compatibility_flags = ["nodejs_compat"]
    }
  }
}

# ─────────────────────────────────────────────
# Pages Custom Domains
# ─────────────────────────────────────────────

resource "cloudflare_pages_domain" "root" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.paverate.name
  domain       = var.domain
}

resource "cloudflare_pages_domain" "www" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.paverate.name
  domain       = "www.${var.domain}"
}

# ─────────────────────────────────────────────
# D1 Database
# ─────────────────────────────────────────────

resource "cloudflare_d1_database" "paverate" {
  account_id = var.cloudflare_account_id
  name       = "paverate-db"
}

# ─────────────────────────────────────────────
# R2 Bucket (Terraform state — already exists, import it)
# ─────────────────────────────────────────────

resource "cloudflare_r2_bucket" "terraform_state" {
  account_id = var.cloudflare_account_id
  name       = "terraform-state"
  location   = "ENAM"
}
