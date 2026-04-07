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

if [[ -n "${CLOUDFLARED_TUNNEL_TOKEN:-}" ]]; then
  docker compose --profile tunnel up -d --build
else
  docker compose up -d --build
fi

echo "\n✅ Stack started"
echo "Local:    http://${BIND_HOST:-127.0.0.1}:${PORT:-8099}"
if [[ -n "${PUBLIC_URL:-}" ]]; then
  echo "Public:   ${PUBLIC_URL}"
fi
