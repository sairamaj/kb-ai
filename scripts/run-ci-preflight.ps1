# CI pre-push gates (Z4-13): backend imports cleanly; frontend production build (tsc + vite).
# Run from repo root. Requires: Python 3.12+, Node.js/npm.
#
#   .\scripts\run-ci-preflight.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "=== Backend: install requirements and import app ==="
python -m pip install -q -r (Join-Path $RepoRoot "backend\requirements.txt")
Push-Location (Join-Path $RepoRoot "backend")
try {
    python -c "from app.main import app"
} finally {
    Pop-Location
}

Write-Host "=== Frontend: npm ci and production build ==="
Push-Location (Join-Path $RepoRoot "frontend")
try {
    npm ci
    npm run build
} finally {
    Pop-Location
}
