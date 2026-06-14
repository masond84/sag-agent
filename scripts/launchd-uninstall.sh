#!/usr/bin/env bash
set -euo pipefail

LABEL="com.masond84.sag-agent"
PLIST_DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
USER_ID="$(id -u)"
DOMAIN="gui/${USER_ID}"

if [[ ! -f "${PLIST_DEST}" ]]; then
  echo "Not installed (${PLIST_DEST} missing)."
  exit 0
fi

echo "Stopping ${LABEL}..."
launchctl bootout "${DOMAIN}" "${PLIST_DEST}" 2>/dev/null || true
rm -f "${PLIST_DEST}"

echo "Removed ${PLIST_DEST}"
echo "Logs kept at ${HOME}/Library/Logs/sag-agent/ (delete manually if desired)."
