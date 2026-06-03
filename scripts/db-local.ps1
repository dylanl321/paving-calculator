<#
.SYNOPSIS
    Bootstrap / migrate the local D1 database used by `vite dev`.

.DESCRIPTION
    Uses wrangler's built-in migration management to apply every migration in
    migrations\*.sql to the local D1 (paverate-db), tracked in the d1_migrations
    table. Running it again is a no-op once everything is applied.

        npx wrangler d1 migrations apply paverate-db --local

    Migrations are numbered sequentially (0001..NNNN) with no duplicate numbers.
    Apply order is strict numeric order; later files depend on earlier ones.

.PARAMETER Reset
    Rebuild the local D1 from scratch before applying migrations. Drops every
    user table/trigger/view (via DROP statements, so it works even while
    `vite dev` holds the SQLite file open) and lets wrangler re-apply 0001..NNNN.

.EXAMPLE
    pwsh ./scripts/db-local.ps1
    pwsh ./scripts/db-local.ps1 -Reset
#>
param(
    [switch]$Reset
)

$ErrorActionPreference = 'Stop'

# Resolve repo root (this script lives in <root>/scripts).
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if ($Reset) {
    Write-Host "Resetting local D1 (dropping all objects)..." -ForegroundColor Yellow

    # Collect every user object, then drop them. writable_schema is blocked in
    # D1, and the SQLite file is locked while `vite dev` runs, so we drop by name
    # rather than deleting the file.
    $json = npx wrangler d1 execute paverate-db --local --json --command `
        "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','trigger','view');" 2>$null | Out-String

    $objects = @()
    try { $objects = ($json | ConvertFrom-Json)[0].results } catch { $objects = @() }

    if ($objects.Count -gt 0) {
        $drops = "PRAGMA foreign_keys = OFF;`n"
        foreach ($o in $objects) {
            switch ($o.type) {
                'table'   { $drops += "DROP TABLE IF EXISTS `"$($o.name)`";`n" }
                'trigger' { $drops += "DROP TRIGGER IF EXISTS `"$($o.name)`";`n" }
                'view'    { $drops += "DROP VIEW IF EXISTS `"$($o.name)`";`n" }
            }
        }
        $tmp = Join-Path $repoRoot '.wrangler\_reset_local.sql'
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $tmp) | Out-Null
        Set-Content -Path $tmp -Value $drops -Encoding UTF8
        npx wrangler d1 execute paverate-db --local --file="$tmp"
        Remove-Item -Force $tmp
        if ($LASTEXITCODE -ne 0) { Write-Error "Local reset failed."; exit $LASTEXITCODE }
    }
    else {
        Write-Host "Local D1 already empty." -ForegroundColor DarkGray
    }
}

Write-Host "Applying migrations to local D1 (paverate-db)..." -ForegroundColor Cyan
npx wrangler d1 migrations apply paverate-db --local
if ($LASTEXITCODE -ne 0) { Write-Error "Migration apply failed."; exit $LASTEXITCODE }

Write-Host "Local D1 ready. Start the app with: npm run dev" -ForegroundColor Cyan
