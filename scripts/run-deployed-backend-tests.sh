#!/usr/bin/env bash
# Phase 3 deployed backend smoke tests (Z4-08).
# Run from repo root. Requires: Python with pytest and httpx.
#
#   export TEST_BACKEND_URL="https://promptkb-api.azurewebsites.net"
#   ./scripts/run-deployed-backend-tests.sh

set -euo pipefail
if [[ -z "${TEST_BACKEND_URL:-}" && -z "${BACKEND_URL:-}" ]]; then
  echo "Set TEST_BACKEND_URL or BACKEND_URL to the deployed backend base URL (no path)." >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
URL="${TEST_BACKEND_URL:-${BACKEND_URL}}"
echo "Running Phase 3 deployment smoke tests against: ${URL%/}"
python -m pytest tests/deployment/ -v -m deployment
