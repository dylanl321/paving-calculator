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

.PARAMETER Fresh
    Bootstrap a brand-new environment using migrations/fresh/0001_full_schema.sql
    instead of replaying the full 0001..NNNN sequence. This is faster and
    intended for new dev setups, CI, and test environments.
    Implies a reset: any existing local D1 objects are dropped first.
    DO NOT use on an environment that has already run the numbered migrations.

.EXAMPLE
    pwsh ./scripts/db-local.ps1
    pwsh ./scripts/db-local.ps1 -Reset
    pwsh ./scripts/db-local.ps1 -Fresh
#>
param(
    [switch]$Reset,
    [switch]$Fresh
)

$ErrorActionPreference = 'Stop'

# Resolve repo root (this script lives in <root>/scripts).
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# -Fresh implies a reset: we always wipe before applying the consolidated schema.
if ($Fresh) { $Reset = $true }

if ($Reset) {
    Write-Host "Resetting local D1 (dropping all objects)..." -ForegroundColor Yellow

    # Collect every user object, then drop them. writable_schema is blocked in
    # D1, and the SQLite file is locked while `vite dev` runs, so we drop by name
    # rather than deleting the file. Exclude wrangler-internal `_cf_*` tables
    # (e.g. `_cf_METADATA`): D1 protects the reserved `_cf_` prefix and rejects a
    # DROP on them with SQLITE_AUTH. `d1_migrations` IS dropped so wrangler
    # re-applies the full 0001..NNNN sequence from scratch.
    $json = npx wrangler d1 execute paverate-db --local --json --command `
        "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '\_cf\_%' ESCAPE '\' AND type IN ('table','trigger','view');" 2>$null | Out-String

    $objects = @()
    try { $objects = ($json | ConvertFrom-Json)[0].results } catch { $objects = @() }

    if ($objects.Count -gt 0) {
        $triggers = @($objects | Where-Object { $_.type -eq 'trigger' } | ForEach-Object { $_.name })
        $views    = @($objects | Where-Object { $_.type -eq 'view' }    | ForEach-Object { $_.name })
        $tables   = @($objects | Where-Object { $_.type -eq 'table' }   | ForEach-Object { $_.name })

        # wrangler's local D1 rejects `PRAGMA foreign_keys = OFF` (SQLITE_AUTH) and
        # enforces FKs even on DDL: with FKs on, `DROP TABLE child` errors with
        # "no such table: <parent>" once the parent it references has already been
        # dropped (and `IF EXISTS` does NOT suppress this). So instead of toggling
        # the disallowed pragma, drop tables in FK-dependency order — every child
        # before the parent it references — derived from pragma_foreign_key_list.
        $fkJson = npx wrangler d1 execute paverate-db --local --json --command `
            "SELECT m.name AS child, p.""table"" AS parent FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) p WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '\_cf\_%' ESCAPE '\';" 2>$null | Out-String
        $edges = @()
        try { $edges = @(($fkJson | ConvertFrom-Json)[0].results) } catch { $edges = @() }

        # Map parent -> set of children that reference it (ignore self-refs and
        # dangling parents that aren't real tables). We drop a table only once all
        # of its children have been dropped, i.e. children first, parents last.
        $tableSet = @{}; foreach ($t in $tables) { $tableSet[$t] = $true }
        $childrenOf = @{}
        foreach ($e in $edges) {
            if ($e.child -eq $e.parent) { continue }
            if (-not $tableSet.ContainsKey($e.parent)) { continue }
            if (-not $tableSet.ContainsKey($e.child))  { continue }
            if (-not $childrenOf.ContainsKey($e.parent)) { $childrenOf[$e.parent] = @{} }
            $childrenOf[$e.parent][$e.child] = $true
        }

        # Kahn-style topological order: repeatedly emit tables whose children are
        # all already dropped. Any leftover (cycle) is appended at the end — D1
        # tolerates that because a true cycle means deferred mutual refs.
        $dropOrder = New-Object System.Collections.Generic.List[string]
        $dropped = @{}
        $remaining = New-Object System.Collections.Generic.List[string]
        foreach ($t in $tables) { [void]$remaining.Add($t) }
        while ($remaining.Count -gt 0) {
            $progress = $false
            for ($i = $remaining.Count - 1; $i -ge 0; $i--) {
                $t = $remaining[$i]
                $kids = if ($childrenOf.ContainsKey($t)) { $childrenOf[$t].Keys } else { @() }
                $blocked = $false
                foreach ($k in $kids) { if (-not $dropped.ContainsKey($k)) { $blocked = $true; break } }
                if (-not $blocked) {
                    $dropOrder.Add($t); $dropped[$t] = $true
                    $remaining.RemoveAt($i); $progress = $true
                }
            }
            if (-not $progress) {
                # FK cycle: append the rest as-is.
                foreach ($t in $remaining) { $dropOrder.Add($t) }
                break
            }
        }

        $drops = ""
        foreach ($name in $triggers) { $drops += "DROP TRIGGER IF EXISTS `"$name`";`n" }
        foreach ($name in $views)    { $drops += "DROP VIEW IF EXISTS `"$name`";`n" }
        foreach ($name in $dropOrder) { $drops += "DROP TABLE IF EXISTS `"$name`";`n" }

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

if ($Fresh) {
    $freshSchema = Join-Path $repoRoot 'migrations\fresh\0001_full_schema.sql'
    if (-not (Test-Path $freshSchema)) {
        Write-Error "Fresh schema not found: $freshSchema"
        exit 1
    }
    Write-Host "Applying consolidated fresh schema to local D1..." -ForegroundColor Cyan
    npx wrangler d1 execute paverate-db --local --file="$freshSchema"
    if ($LASTEXITCODE -ne 0) { Write-Error "Fresh schema apply failed."; exit $LASTEXITCODE }
    Write-Host "Local D1 ready (fresh schema). Start the app with: npm run dev" -ForegroundColor Cyan
}
else {
    Write-Host "Applying migrations to local D1 (paverate-db)..." -ForegroundColor Cyan
    npx wrangler d1 migrations apply paverate-db --local
    if ($LASTEXITCODE -ne 0) { Write-Error "Migration apply failed."; exit $LASTEXITCODE }
    Write-Host "Local D1 ready. Start the app with: npm run dev" -ForegroundColor Cyan
}
