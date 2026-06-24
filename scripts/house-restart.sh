#!/usr/bin/env bash
set -euo pipefail

SAG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${HOUSE_UI_PORT:-3000}"
LOG="${SAG_ROOT}/data/house-ui.log"

mkdir -p "${SAG_ROOT}/data"

if lsof -ti:"${PORT}" >/dev/null 2>&1; then
  kill "$(lsof -ti:"${PORT}")" 2>/dev/null || true
  sleep 1
fi

cd "${SAG_ROOT}/house"
echo "" >> "${LOG}"
echo "==> $(date -u +%Y-%m-%dT%H:%M:%SZ) house-restart" >> "${LOG}"
npm run build >> "${LOG}" 2>&1
nohup npm run start >> "${LOG}" 2>&1 &

echo "House UI restarted on http://localhost:${PORT} (log: data/house-ui.log)"
