#!/usr/bin/env bash
# Phase 1 integration tests (Z4-03): build prod images, start stack, pytest, tear down.
# Run from repo root. Requires: Docker, Docker Compose, Python (pytest, httpx).
#
#   ./scripts/run-integration-tests.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="docker-compose.integration.yml"
BACKEND_URL="${BACKEND_URL:-http://localhost:8010}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:8081}"
MAX_WAIT="${MAX_WAIT_SECONDS:-60}"
SLEEP=2

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing $COMPOSE_FILE (run from repo root)." >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d

cleanup() {
  echo "Tearing down integration stack..."
  docker compose -f "$COMPOSE_FILE" down
}
trap cleanup EXIT

wait_for_http() {
  local url=$1
  local name=$2
  local waited=0
  while (( waited < MAX_WAIT )); do
    if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
      echo "$name is up: $url"
      return 0
    fi
    sleep "$SLEEP"
    waited=$((waited + SLEEP))
  done
  echo "Timed out waiting for $name at $url" >&2
  return 1
}

echo "Waiting for backend /health..."
wait_for_http "${BACKEND_URL}/health" "backend"
echo "Waiting for frontend /..."
wait_for_http "${FRONTEND_URL}/" "frontend"

export BACKEND_URL FRONTEND_URL
echo "Running pytest tests/deployment/ -v -m integration..."
python -m pytest tests/deployment/ -v -m integration
