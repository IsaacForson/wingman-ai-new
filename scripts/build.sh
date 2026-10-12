#!/usr/bin/env bash
# Build a distributable app for the current OS: bundled backend + Electron installer.
# Output: frontend/release/
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "→ Backend executable (PyInstaller)"
cd "$ROOT/backend"
# shellcheck disable=SC1091
source venv/bin/activate
python -m pytest -q
pyinstaller --noconfirm --clean wingman-backend.spec

echo "→ Desktop app"
cd "$ROOT/frontend"
npm run typecheck
case "$(uname -s)" in
  Darwin) npm run build:mac ;;
  Linux) npm run build:linux ;;
  MINGW*|MSYS*|CYGWIN*) npm run build:win ;;
esac
echo "Done: $ROOT/frontend/release"
