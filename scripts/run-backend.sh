#!/usr/bin/env bash
# Builds (Release) and starts the C++ backend on http://localhost:8080.
# Extra arguments are passed to the server, e.g.:
#   ./scripts/run-backend.sh --seed          # start with sample trains
#   ./scripts/run-backend.sh --port 9000
set -euo pipefail
cd "$(dirname "$0")/../backend"

cmake -S . -B build -DCMAKE_BUILD_TYPE=Release > /dev/null
cmake --build build -j"$(nproc)"
exec ./build/railflow "$@"
