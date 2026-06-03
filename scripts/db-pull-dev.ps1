<#
.SYNOPSIS
    Load a real snapshot of the remote dev D1 into the local D1.

.DESCRIPTION
    Exports the remote dev D1 (paverate-db) to .wrangler\dev-snapshot.sql, then
    loads it into the local D1 used by `vite dev`. This populates local testing
    with real data captured by the dev environment -- no invented/sample rows.

    Requires an authenticated wrangler session (run `wrangler login` first if
    `wrangler whoami` shows you are logged out).

.EXAMPLE
    pwsh ./scripts/db-pull-dev.ps1
#>
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$snapshot = Join-Path $repoRoot '.wrangler\dev-snapshot.sql'
$snapshotDir = Split-Path -Parent $snapshot
if (-not (Test-Path $snapshotDir)) {
    New-Item -ItemType Directory -Force -Path $snapshotDir | Out-Null
}

Write-Host "Exporting remote dev D1 (paverate-db) -> $snapshot" -ForegroundColor Cyan
npx wrangler d1 export paverate-db --remote --output $snapshot
if ($LASTEXITCODE -ne 0) {
    Write-Error "Export failed. Run 'wrangler login' if you are not authenticated."
    exit $LASTEXITCODE
}

Write-Host "Loading snapshot into local D1..." -ForegroundColor Cyan
npx wrangler d1 execute paverate-db --local --file=$snapshot
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to load snapshot into local D1."
    exit $LASTEXITCODE
}

Write-Host "Local D1 now contains the dev snapshot. Start the app with: npm run dev" -ForegroundColor Cyan
