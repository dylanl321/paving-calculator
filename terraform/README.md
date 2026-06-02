# Terraform Infrastructure

PaveRate infrastructure is managed as code using Terraform with the Cloudflare provider.

## Architecture

- **State Backend:** Cloudflare R2 bucket (`terraform-state`)
- **Provider:** Cloudflare Terraform Provider v5.x
- **CI/CD:** GitHub Actions — plan on PR, apply on merge to main

## Managed Resources

| Resource | Type | Notes |
|----------|------|-------|
| paverate.com zone | Data source | Looked up, not created |
| DNS CNAME (root) | `cloudflare_dns_record` | → paverate.pages.dev |
| DNS CNAME (www) | `cloudflare_dns_record` | → paverate.pages.dev |
| Pages project | `cloudflare_pages_project` | Auto-deploys from GitHub |
| Pages domains | `cloudflare_pages_domain` | Custom domain bindings |
| D1 database | `cloudflare_d1_database` | paverate-db |
| R2 bucket | `cloudflare_r2_bucket` | terraform-state (self-referential) |

## Setup

### Prerequisites

1. Terraform >= 1.5 installed locally
2. Cloudflare API token with permissions:
   - Zone: DNS Edit
   - Account: Pages Edit, D1 Edit, R2 Edit, Workers Scripts Edit
3. R2 API credentials (Access Key ID + Secret) for the S3 state backend

### GitHub Secrets Required

Set these in the repo settings (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Scoped API token for Terraform |
| `R2_ACCESS_KEY_ID` | R2 S3-compatible access key |
| `R2_SECRET_ACCESS_KEY` | R2 S3-compatible secret key |

### Local Usage

```bash
cd terraform

# Set environment variables
export TF_VAR_cloudflare_api_token="your-api-token"
export AWS_ACCESS_KEY_ID="your-r2-access-key"
export AWS_SECRET_ACCESS_KEY="your-r2-secret-key"

# Initialize
terraform init

# Plan changes
terraform plan

# Apply
terraform apply
```

### Importing Existing Resources

Since the Pages project, DNS records, and R2 bucket already exist, they need to be imported on first run:

```bash
# Import the zone data (happens automatically via data source)

# Import existing DNS records
terraform import cloudflare_dns_record.root <zone_id>/<record_id>
terraform import cloudflare_dns_record.www <zone_id>/<record_id>

# Import existing Pages project
terraform import cloudflare_pages_project.paverate <account_id>/paverate

# Import existing Pages domains
terraform import cloudflare_pages_domain.root <account_id>/paverate/paverate.com
terraform import cloudflare_pages_domain.www <account_id>/paverate/www.paverate.com

# Import R2 bucket
terraform import cloudflare_r2_bucket.terraform_state <account_id>/terraform-state

# D1 will be created fresh by Terraform
```

## Adding New Resources

1. Add resource definition to `resources.tf`
2. Create a PR — GitHub Actions runs `terraform plan`
3. Review the plan output
4. Merge to main — GitHub Actions runs `terraform apply`

## Notes

- The D1 database ID from `terraform output d1_database_id` must be set in `wrangler.jsonc`
- Migrations are NOT managed by Terraform — run them manually via `wrangler d1 execute`
- The R2 state bucket manages itself (bootstrapping problem solved by creating it manually first)
