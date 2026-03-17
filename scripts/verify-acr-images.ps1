# Phase 2 integration test (Z4-05): verify backend and frontend images exist in ACR with the given tag.
# Run after build-and-push workflow or manual push. Requires: Azure CLI, az login, az acr login.
#
# Usage:
#   .\scripts\verify-acr-images.ps1 -AcrName <acr_name> -ImageTag <tag>
#   $env:ACR_NAME="myacr"; $env:IMAGE_TAG="abc1234"; .\scripts\verify-acr-images.ps1
#
# Exit 0 if both promptkb-api and promptkb-web have the tag; exit 1 otherwise.

param(
    [string]$AcrName = $env:ACR_NAME,
    [string]$ImageTag = $env:IMAGE_TAG
)

$ErrorActionPreference = "Stop"

if (-not $AcrName -or -not $ImageTag) {
    Write-Error "Usage: .\scripts\verify-acr-images.ps1 -AcrName <acr> -ImageTag <tag>"
    exit 1
}

$repos = @("promptkb-api", "promptkb-web")
$missing = @()

foreach ($repo in $repos) {
    try {
        $tagsOutput = az acr repository show-tags --name $AcrName --repository $repo --output tsv 2>$null
        $tagList = @($tagsOutput -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        if ($tagList -contains $ImageTag) {
            Write-Host "OK: $repo`:$ImageTag exists in ACR $AcrName"
        } else {
            Write-Host "MISSING: $repo`:$ImageTag not found in ACR $AcrName"
            $missing += $repo
        }
    } catch {
        Write-Host "MISSING: $repo`:$ImageTag not found in ACR $AcrName (error: $_)"
        $missing += $repo
    }
}

if ($missing.Count -gt 0) {
    Write-Host "Phase 2 (Z4-05) verification failed: missing tags for $($missing -join ', ')"
    exit 1
}

Write-Host "Phase 2 (Z4-05) verification passed: both images exist in ACR with tag $ImageTag"
exit 0
