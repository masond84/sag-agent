#!/usr/bin/env bash
set -euo pipefail

SAG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${SAG_ROOT}"

LABEL="${LAUNCHD_LABEL:-com.masond84.sag-agent}"
DOMAIN="gui/$(id -u)"

echo "==> Pulling main"
git checkout main
git pull origin main

echo "==> Building worker"
npm run build

echo "==> Restarting worker (launchd)"
if launchctl print "${DOMAIN}/${LABEL}" &>/dev/null; then
  launchctl kickstart -k "${DOMAIN}/${LABEL}"
else
  echo "    launchd job not loaded — run: npm run launchd:install"
fi

echo "==> Building and restarting House UI"
bash "${SAG_ROOT}/scripts/house-restart.sh"

echo "==> Done. Worker API: http://127.0.0.1:9473  House: http://localhost:${HOUSE_UI_PORT:-3000}"
