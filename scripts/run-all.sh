#!/usr/bin/env bash
# Starts backend and frontend together. Press Ctrl+C to stop both.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

"$ROOT/scripts/run-backend.sh" "$@" &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT INT TERM

# Give the backend a moment to compile/start before the UI begins polling it.
sleep 2
"$ROOT/scripts/run-frontend.sh"
