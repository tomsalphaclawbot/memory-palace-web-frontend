#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  source .env
  set +a
fi

if [[ -n "${CLOUDFLARED_TUNNEL_TOKEN:-}" ]]; then
  docker compose --profile tunnel down
else
  docker compose down
fi
