#!/usr/bin/env bash
set -euo pipefail

SAG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_DIR="${SAG_ROOT}/livekit-agent"

if [[ ! -d "${AGENT_DIR}/.venv" ]]; then
  echo "==> Creating Python 3.12 venv in livekit-agent/"
  python3.12 -m venv "${AGENT_DIR}/.venv"
  "${AGENT_DIR}/.venv/bin/pip" install -r "${AGENT_DIR}/requirements.txt"
fi

cd "${AGENT_DIR}"
source .venv/bin/activate
exec python agent.py dev
