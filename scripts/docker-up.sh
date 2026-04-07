#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

docker compose up -d --build

echo "\n✅ Stack started"
echo "Local:    http://127.0.0.1:8099"
echo "Public:   https://memory-palace.tomsalphaclawbot.work"
