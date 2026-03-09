#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Stopping and removing existing containers..."
docker compose down --remove-orphans

echo "Rebuilding image (no cache)..."
docker compose build --no-cache

echo "Starting containers..."
docker compose up -d

echo ""
echo "Done. App running at http://localhost:5173"
echo "Logs: docker compose logs -f"
