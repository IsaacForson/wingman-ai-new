#!/usr/bin/env bash
# Development: runs the backend in this terminal's background and the Electron app with hot reload.
# The Electron app attaches to this backend by reading ~/.wingman/auth_token.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/backend"
# shellcheck disable=SC1091
source venv/bin/activate
python main.py &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null' EXIT INT TERM

for _ in $(seq 1 60); do
  curl -fs http://127.0.0.1:8765/health >/dev/null && break
  sleep 0.5
done

cd "$ROOT/frontend"
npm run dev
