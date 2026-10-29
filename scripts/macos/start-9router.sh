#!/bin/zsh
# Start this checkout of 9router (used by the macOS login agent).
# Rebuilds only when the checked-out commit changed since the last build.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-20128}"
BIND_HOST="${NINEROUTER_HOST:-127.0.0.1}"

# launchd starts with a bare PATH; add the user's Node and Homebrew.
export PATH="$HOME/.local/share/node/node-v26.12.1-darwin-arm64/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export NODE_ENV=production
export NEXT_PUBLIC_BASE_URL="http://localhost:$PORT"
export PORT
export HOSTNAME="$BIND_HOST"

cd "$REPO"

if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  echo "[9router] installing dependencies..."
  npm install --no-audit --no-fund
fi

HEAD_SHA="$(git rev-parse HEAD)"
STAMP=".next/.built-commit"
if [[ ! -f .next/BUILD_ID || "$(cat "$STAMP" 2>/dev/null)" != "$HEAD_SHA" || -n "$(git status --porcelain -- src open-sse custom-server.js next.config.mjs package.json)" ]]; then
  echo "[9router] building $HEAD_SHA..."
  npm run build
  echo "$HEAD_SHA" > "$STAMP"
fi

echo "[9router] starting on http://$BIND_HOST:$PORT"
cd .next/standalone
exec node --dns-result-order=ipv4first custom-server.js
