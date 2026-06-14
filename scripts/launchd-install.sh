#!/usr/bin/env bash
set -euo pipefail

LABEL="com.masond84.sag-agent"
SAG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAUNCH_AGENTS="${HOME}/Library/LaunchAgents"
PLIST_DEST="${LAUNCH_AGENTS}/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/sag-agent"
TEMPLATE="${SAG_ROOT}/launchd/${LABEL}.plist.template"
RUN_SCRIPT="${SAG_ROOT}/scripts/launchd-run.sh"
USER_ID="$(id -u)"
DOMAIN="gui/${USER_ID}"

echo "SAG launchd install"
echo "  Project:  ${SAG_ROOT}"
echo "  Plist:    ${PLIST_DEST}"
echo "  Logs:     ${LOG_DIR}/"

if [[ "${SAG_ROOT}" == *"/Desktop/"* ]] || [[ "${SAG_ROOT}" == *"/Documents/"* ]] || [[ "${SAG_ROOT}" == *"/Downloads/"* ]]; then
  echo ""
  echo "Warning: macOS may block launchd from Desktop/Documents/Downloads."
  echo "If the job fails with 'Operation not permitted', move the project to e.g.:"
  echo "  ~/Projects/sag-agent"
  echo "Then re-run: npm run launchd:install"
  echo ""
fi

chmod +x "${RUN_SCRIPT}"

mkdir -p "${LAUNCH_AGENTS}" "${LOG_DIR}"

sed \
  -e "s|@SAG_ROOT@|${SAG_ROOT}|g" \
  -e "s|@LOG_DIR@|${LOG_DIR}|g" \
  "${TEMPLATE}" > "${PLIST_DEST}"

if launchctl print "${DOMAIN}/${LABEL}" &>/dev/null; then
  echo "Stopping existing job..."
  launchctl bootout "${DOMAIN}" "${PLIST_DEST}" 2>/dev/null || true
fi

echo "Loading launch agent..."
launchctl bootstrap "${DOMAIN}" "${PLIST_DEST}"
launchctl enable "${DOMAIN}/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "${DOMAIN}/${LABEL}"

echo ""
echo "Installed and started ${LABEL}."
echo ""
echo "Important: stop any manual 'npm start' in a terminal to avoid duplicate workers."
echo ""
echo "Useful commands:"
echo "  tail -f ${LOG_DIR}/stdout.log"
echo "  tail -f ${LOG_DIR}/stderr.log"
echo "  launchctl print ${DOMAIN}/${LABEL}"
echo "  npm run launchd:uninstall   # stop and remove"
