#!/usr/bin/env bash
# launchd entrypoint — keeps PATH and project root explicit for Login Items.
set -euo pipefail

SAG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SAG_ROOT"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${PATH:-}"

if [[ ! -f dist/main.js ]]; then
  echo "[launchd-run] dist/main.js missing — running npm run build"
  npm run build
fi

exec node dist/main.js
