#!/usr/bin/env bash
# Move SAG out of Desktop/Documents/Downloads so launchd can access it (macOS TCC).
set -euo pipefail

CURRENT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-${HOME}/Projects/sag-agent}"

if [[ "${CURRENT}" != *"/Desktop/"* && "${CURRENT}" != *"/Documents/"* && "${CURRENT}" != *"/Downloads/"* ]]; then
  echo "Project is not in a protected folder:"
  echo "  ${CURRENT}"
  echo "launchd should work here. Run: npm run launchd:install"
  exit 0
fi

if [[ -e "${TARGET}" ]]; then
  echo "Target already exists: ${TARGET}"
  exit 1
fi

echo "This will move:"
echo "  from: ${CURRENT}"
echo "  to:   ${TARGET}"
echo ""
read -r -p "Continue? [y/N] " confirm
if [[ "${confirm}" != [yY] ]]; then
  echo "Cancelled."
  exit 0
fi

mkdir -p "$(dirname "${TARGET}")"
npm run launchd:uninstall 2>/dev/null || true

mv "${CURRENT}" "${TARGET}"

echo ""
echo "Moved. Next steps:"
echo "  cd \"${TARGET}\""
echo "  npm run launchd:install"
echo "  npm run launchd:status"
echo ""
echo "Re-open the project in Cursor from the new path."
