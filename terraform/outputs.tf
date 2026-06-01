output "zone_id" {
  description = "Cloudflare zone ID for paverate.com"
  value       = data.cloudflare_zone.paverate.zone_id
}

output "pages_project_subdomain" {
  description = "Pages default subdomain"
  value       = "paverate.pages.dev"
}

output "d1_database_id" {
  description = "D1 database ID (set this in wrangler.jsonc)"
  value       = cloudflare_d1_database.paverate.id
}

output "d1_database_name" {
  description = "D1 database name"
  value       = cloudflare_d1_database.paverate.name
}
