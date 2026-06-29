#!/usr/bin/env bash
set -euo pipefail

SAG_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec npm run face:agent --prefix "${SAG_ROOT}"
