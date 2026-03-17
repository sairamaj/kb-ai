#!/usr/bin/env bash
# Phase 2 integration test (Z4-05): verify backend and frontend images exist in ACR with the given tag.
# Run after build-and-push workflow or manual push. Requires: Azure CLI, az login, az acr login.
#
# Usage:
#   ./scripts/verify-acr-images.sh <acr_name> <tag>
#   ACR_NAME=myacr IMAGE_TAG=abc1234 ./scripts/verify-acr-images.sh
#
# Exit 0 if both promptkb-api and promptkb-web have the tag; exit 1 otherwise.

set -e

ACR_NAME="${ACR_NAME:-$1}"
IMAGE_TAG="${IMAGE_TAG:-$2}"

if [ -z "$ACR_NAME" ] || [ -z "$IMAGE_TAG" ]; then
  echo "Usage: ACR_NAME=<acr> IMAGE_TAG=<tag> $0"
  echo "   or: $0 <acr_name> <tag>"
  exit 1
fi

REPOS=("promptkb-api" "promptkb-web")
MISSING=()

for repo in "${REPOS[@]}"; do
  if az acr repository show-tags --name "$ACR_NAME" --repository "$repo" --output tsv 2>/dev/null | grep -qx "$IMAGE_TAG"; then
    echo "OK: $repo:$IMAGE_TAG exists in ACR $ACR_NAME"
  else
    echo "MISSING: $repo:$IMAGE_TAG not found in ACR $ACR_NAME"
    MISSING+=("$repo")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Phase 2 (Z4-05) verification failed: missing tags for ${MISSING[*]}"
  exit 1
fi

echo "Phase 2 (Z4-05) verification passed: both images exist in ACR with tag $IMAGE_TAG"
exit 0
