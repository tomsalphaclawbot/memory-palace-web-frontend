#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
pip install -q --upgrade pip
pip install -q -r "$ROOT_DIR/requirements.txt"

if [[ -z "${MEMORY_PALACE_PATH:-}" ]]; then
  echo "❌ MEMORY_PALACE_PATH is required. Set it in .env or your shell."
  exit 1
fi

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8099}"

exec python3 "$ROOT_DIR/app.py"
