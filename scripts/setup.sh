#!/usr/bin/env bash
# One-time setup: Python venv + backend deps, and frontend packages.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PYTHON="${PYTHON:-python3}"
"$PYTHON" -c 'import sys; assert sys.version_info >= (3, 10), "Python 3.10+ required"'

echo "→ Backend"
cd "$ROOT/backend"
[ -d venv ] || "$PYTHON" -m venv venv
# shellcheck disable=SC1091
source venv/bin/activate
pip install --upgrade pip >/dev/null
pip install -r requirements-dev.txt
[ -f .env ] || cp .env.example .env

echo "→ Frontend"
cd "$ROOT/frontend"
npm ci

if ! command -v tesseract >/dev/null; then
  echo
  echo "Optional: install Tesseract to enable 'Ask about my screen'"
  echo "  macOS: brew install tesseract    Linux: sudo apt install tesseract-ocr"
fi
echo
echo "Done. Start with: ./scripts/dev.sh"
