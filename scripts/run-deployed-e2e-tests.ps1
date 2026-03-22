# Phase 4 deployed frontend + backend E2E smoke (Z4-10).
# Run from repo root. Requires: Python with pytest and httpx (tests/deployment/requirements.txt).
#
# Set both URL groups (use TEST_* vars in CI to avoid clashing with local dev):
#   $env:TEST_FRONTEND_URL = "https://promptkb.azurewebsites.net"
#   $env:TEST_BACKEND_URL = "https://promptkb-api.azurewebsites.net"
#   .\scripts\run-deployed-e2e-tests.ps1
#
# FRONTEND_URL / BACKEND_URL are accepted if the TEST_* vars are unset.

$ErrorActionPreference = "Stop"
$hasFront = [string]::IsNullOrWhiteSpace($env:TEST_FRONTEND_URL) -eq $false -or [string]::IsNullOrWhiteSpace($env:FRONTEND_URL) -eq $false
$hasBack = [string]::IsNullOrWhiteSpace($env:TEST_BACKEND_URL) -eq $false -or [string]::IsNullOrWhiteSpace($env:BACKEND_URL) -eq $false
if (-not $hasFront -or -not $hasBack) {
    Write-Error @"
Set both frontend and backend base URLs (no path), e.g.:
  `$env:TEST_FRONTEND_URL = 'https://<frontend-app>.azurewebsites.net'
  `$env:TEST_BACKEND_URL = 'https://<backend-app>.azurewebsites.net'
Or use FRONTEND_URL / BACKEND_URL. See docs/developer.md (Phase 4, Z4-10).
"@
}
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
$f = if (-not [string]::IsNullOrWhiteSpace($env:TEST_FRONTEND_URL)) { $env:TEST_FRONTEND_URL } else { $env:FRONTEND_URL }
$b = if (-not [string]::IsNullOrWhiteSpace($env:TEST_BACKEND_URL)) { $env:TEST_BACKEND_URL } else { $env:BACKEND_URL }
Write-Host "Running Phase 4 deployment E2E smoke (pytest -m deployment_e2e)"
Write-Host "  Frontend: $($f.TrimEnd('/'))"
Write-Host "  Backend:  $($b.TrimEnd('/'))"
python -m pytest tests/deployment/ -v -m deployment_e2e
exit $LASTEXITCODE
