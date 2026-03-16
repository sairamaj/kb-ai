# Phase 1 integration tests (Z4-03): build production images, start stack, run pytest, tear down.
# Run from repo root. Requires: Docker, Docker Compose, Python with pytest and httpx.
#
# Usage:
#   .\scripts\run-integration-tests.ps1
#   # Or with explicit Python:
#   python -m pytest tests/deployment/ -v -m integration
#   (after starting containers manually)

$ErrorActionPreference = "Stop"
# Script lives in repo/scripts/; repo root is parent of scripts.
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $RepoRoot "docker-compose.integration.yml"))) {
    Write-Error "docker-compose.integration.yml not found in $RepoRoot. Run from repo root: .\scripts\run-integration-tests.ps1"
}
Set-Location $RepoRoot

$ComposeFile = "docker-compose.integration.yml"
# Use different ports from dev stack (8000/8080) so both can run
$BackendUrl = "http://localhost:8010"
$FrontendUrl = "http://localhost:8081"
$MaxWaitSeconds = 60
$SleepSeconds = 2

function Wait-ForUrl {
    param([string]$Url, [string]$Name)
    $deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep -Seconds $SleepSeconds
    }
    Write-Error "Timed out waiting for $Name at $Url"
}

Write-Host "Building and starting integration stack (prod backend + frontend + test DB)..."
docker compose -f $ComposeFile build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker compose -f $ComposeFile up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

try {
    Write-Host "Waiting for backend /health..."
    Wait-ForUrl -Url "$BackendUrl/health" -Name "backend"
    Write-Host "Waiting for frontend /..."
    Wait-ForUrl -Url $FrontendUrl -Name "frontend"

    $env:BACKEND_URL = $BackendUrl
    $env:FRONTEND_URL = $FrontendUrl
    Write-Host "Running pytest tests/deployment/ -v -m integration..."
    python -m pytest tests/deployment/ -v -m integration
    $pytestExit = $LASTEXITCODE
} finally {
    Write-Host "Tearing down integration stack..."
    docker compose -f $ComposeFile down
}

exit $pytestExit
