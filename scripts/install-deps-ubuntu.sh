#!/usr/bin/env bash
# Installs everything RailFlow needs on Ubuntu / Debian.
# Usage: ./scripts/install-deps-ubuntu.sh
set -euo pipefail

echo "==> Installing C++ toolchain (g++, CMake, make)"
sudo apt-get update
sudo apt-get install -y build-essential cmake

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "==> Installing Node.js 20 (NodeSource)"
  sudo apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> Versions"
g++ --version | head -1
cmake --version | head -1
node --version
npm --version
echo "Done. Next: ./scripts/run-backend.sh and ./scripts/run-frontend.sh"
