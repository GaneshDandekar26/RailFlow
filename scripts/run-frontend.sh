#!/usr/bin/env bash
# Installs frontend dependencies (first run) and starts the Vite dev server on http://localhost:5173.
set -euo pipefail
cd "$(dirname "$0")/../frontend"

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi
exec npm run dev -- "$@"
