param(
	[int]$Port = 4173
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "Generating Cloudflare types..."
npx wrangler types

Write-Host "Starting SvelteKit build watcher..."
$build = Start-Process -FilePath "npx.cmd" -ArgumentList @("vite", "build", "--watch") -WorkingDirectory $root -PassThru

try {
	Write-Host "Waiting for initial Cloudflare build output..."
	$worker = Join-Path $root ".svelte-kit\cloudflare\_worker.js"
	$deadline = (Get-Date).AddMinutes(2)
	while (!(Test-Path $worker)) {
		if ((Get-Date) -gt $deadline) {
			throw "Timed out waiting for $worker"
		}
		Start-Sleep -Seconds 1
	}

	Write-Host "Starting Cloudflare Pages dev on http://localhost:$Port"
	npx wrangler pages dev .svelte-kit/cloudflare --port $Port --live-reload --compatibility-date=2026-06-01 --compatibility-flag=nodejs_compat --ai AI
}
finally {
	if ($build -and !$build.HasExited) {
		Stop-Process -Id $build.Id -Force -ErrorAction SilentlyContinue
	}
}
