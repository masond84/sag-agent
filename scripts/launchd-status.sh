#!/usr/bin/env bash
set -euo pipefail

LABEL="com.masond84.sag-agent"
USER_ID="$(id -u)"
DOMAIN="gui/${USER_ID}"
LOG_DIR="${HOME}/Library/Logs/sag-agent"

echo "=== launchctl ==="
if launchctl print "${DOMAIN}/${LABEL}" 2>/dev/null; then
  echo ""
else
  echo "Not loaded. Run: npm run launchd:install"
  exit 1
fi

echo "=== recent stdout (last 15 lines) ==="
if [[ -f "${LOG_DIR}/stdout.log" ]]; then
  tail -n 15 "${LOG_DIR}/stdout.log"
else
  echo "(no stdout log yet)"
fi

echo ""
echo "=== recent stderr (last 15 lines) ==="
if [[ -f "${LOG_DIR}/stderr.log" ]]; then
  tail -n 15 "${LOG_DIR}/stderr.log"
else
  echo "(no stderr log yet)"
fi
