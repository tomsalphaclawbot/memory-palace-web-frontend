#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env" ]]; then
  echo "❌ Missing .env. Copy .env.example and set PALACE_PATH first."
  exit 1
fi

set -a
source .env
set +a

PALACE_PATH="${PALACE_PATH:-./palace}"
export PALACE_PATH

docker compose up -d --build

echo "\n✅ Stack started"
echo "Local:    http://${BIND_HOST:-127.0.0.1}:${PORT:-8099}"
