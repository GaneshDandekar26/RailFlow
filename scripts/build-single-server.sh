#!/usr/bin/env bash
# Production-style run: builds the frontend and lets the C++ backend serve it,
# so a single process on http://localhost:8080 provides both UI and API.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/frontend"
[ -d node_modules ] || npm install --no-audit --no-fund
# An empty VITE_API_URL makes the UI call the API on the same origin.
VITE_API_URL= npm run build

cd "$ROOT/backend"
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release > /dev/null
cmake --build build -j"$(nproc)"
exec ./build/railflow --static "$ROOT/frontend/dist" "$@"
