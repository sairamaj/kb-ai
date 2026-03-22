# Phase 3 deployed backend smoke tests (Z4-08).
# Run from repo root. Requires: Python with pytest and httpx (tests/deployment/requirements.txt).
#
# Set TEST_BACKEND_URL (recommended for staging) or BACKEND_URL to the API origin, e.g.:
#   $env:TEST_BACKEND_URL = "https://promptkb-api.azurewebsites.net"
#   .\scripts\run-deployed-backend-tests.ps1

$ErrorActionPreference = "Stop"
$hasTest = [string]::IsNullOrWhiteSpace($env:TEST_BACKEND_URL) -eq $false
$hasBack = [string]::IsNullOrWhiteSpace($env:BACKEND_URL) -eq $false
if (-not $hasTest -and -not $hasBack) {
    Write-Error "Set TEST_BACKEND_URL or BACKEND_URL to the deployed backend base URL (no path). Example: `$env:TEST_BACKEND_URL = 'https://promptkb-api.azurewebsites.net'"
}
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
$url = if ($hasTest) { $env:TEST_BACKEND_URL } else { $env:BACKEND_URL }
Write-Host "Running Phase 3 deployment smoke tests (pytest -m deployment) against: $($url.TrimEnd('/'))"
python -m pytest tests/deployment/ -v -m deployment
exit $LASTEXITCODE
