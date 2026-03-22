#!/usr/bin/env bash
# CI pre-push gates (Z4-13): backend imports cleanly; frontend production build (tsc + vite).
# Run from repo root. Requires: Python 3.12+, Node.js/npm (for frontend steps).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Backend: install requirements and import app ==="
python -m pip install -q -r backend/requirements.txt
(
  cd backend
  python -c "from app.main import app"
)

echo "=== Frontend: npm ci and production build ==="
cd frontend
npm ci
npm run build
