<#
.SYNOPSIS
    Bootstrap the local D1 database used by `vite dev`.

.DESCRIPTION
    Applies every top-level migration in migrations\0*.sql to the local D1
    (paverate-db) in filename-sort order, one file at a time via
    `wrangler d1 execute --local`.

    Notes:
      - The nested migrations\migrations\ folder is multi-agent cruft and is
        intentionally ignored.
      - Two migration numbers are duplicated (0024_*, 0025_*) but touch
        disjoint tables, so applying each file once in sorted order is safe.
      - `wrangler d1 migrations apply` is NOT used because the duplicate
        numbering makes it unreliable here.

.PARAMETER Reset
    Delete the existing local D1 sqlite state under .wrangler before applying
    migrations, for a clean rebuild.

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
    $localDbDir = Join-Path $repoRoot '.wrangler\state\v3\d1'
    if (Test-Path $localDbDir) {
        Write-Host "Resetting local D1 state at $localDbDir" -ForegroundColor Yellow
        Remove-Item -Recurse -Force $localDbDir
    }
    else {
        Write-Host "No existing local D1 state to reset." -ForegroundColor DarkGray
    }
}

# Only top-level migrations (migrations\0*.sql), never the nested cruft folder.
$migrations = Get-ChildItem -Path (Join-Path $repoRoot 'migrations') -Filter '0*.sql' -File |
    Sort-Object Name

if (-not $migrations) {
    Write-Error "No migration files found in migrations\0*.sql"
    exit 1
}

Write-Host "Applying $($migrations.Count) migrations to local D1 (paverate-db)..." -ForegroundColor Cyan

foreach ($m in $migrations) {
    Write-Host "  -> $($m.Name)" -ForegroundColor Green
    npx wrangler d1 execute paverate-db --local --file="migrations\$($m.Name)"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Migration failed: $($m.Name)"
        exit $LASTEXITCODE
    }
}

Write-Host "Local D1 ready. Start the app with: npm run dev" -ForegroundColor Cyan
