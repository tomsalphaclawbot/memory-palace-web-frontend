#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"

if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
pip install -q --upgrade pip
pip install -q -r "$ROOT_DIR/requirements.txt"

export MEMORY_PALACE_PATH="${MEMORY_PALACE_PATH:-/Users/openclaw/.openclaw/workspace/projects/alpha-mem-palace/data/palace}"
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8099}"

exec python3 "$ROOT_DIR/app.py"
