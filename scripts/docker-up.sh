#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BUILD_FLAG=""
if [[ "${1:-}" == "--build" ]]; then
  BUILD_FLAG="--build"
fi

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
  docker compose --profile tunnel up -d ${BUILD_FLAG}
else
  docker compose up -d ${BUILD_FLAG}
fi

echo "\n✅ Stack started"
echo "Local:    http://${BIND_HOST:-127.0.0.1}:${PORT:-8099}"
if [[ -n "${PUBLIC_URL:-}" ]]; then
  echo "Public:   ${PUBLIC_URL}"
fi
