#!/usr/bin/env bash
# Phase 4 deployed frontend + backend E2E smoke (Z4-10).
# Run from repo root. Requires: Python with pytest and httpx.
#
#   export TEST_FRONTEND_URL="https://promptkb.azurewebsites.net"
#   export TEST_BACKEND_URL="https://promptkb-api.azurewebsites.net"
#   ./scripts/run-deployed-e2e-tests.sh
#
# FRONTEND_URL / BACKEND_URL work if TEST_* are unset.

set -euo pipefail
has_front=false
has_back=false
[[ -n "${TEST_FRONTEND_URL:-}" || -n "${FRONTEND_URL:-}" ]] && has_front=true
[[ -n "${TEST_BACKEND_URL:-}" || -n "${BACKEND_URL:-}" ]] && has_back=true
if [[ "$has_front" != true || "$has_back" != true ]]; then
  echo "Set both frontend and backend base URLs (no path), e.g.:" >&2
  echo "  export TEST_FRONTEND_URL='https://<frontend-app>.azurewebsites.net'" >&2
  echo "  export TEST_BACKEND_URL='https://<backend-app>.azurewebsites.net'" >&2
  echo "Or use FRONTEND_URL / BACKEND_URL. See docs/developer.md — Phase 4 (Z4-10)." >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
F="${TEST_FRONTEND_URL:-${FRONTEND_URL}}"
B="${TEST_BACKEND_URL:-${BACKEND_URL}}"
echo "Running Phase 4 deployment E2E smoke (pytest -m deployment_e2e)"
echo "  Frontend: ${F%/}"
echo "  Backend:  ${B%/}"
python -m pytest tests/deployment/ -v -m deployment_e2e
