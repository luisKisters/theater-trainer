#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Idempotently install npm dependencies
if [ ! -d node_modules ]; then
  echo "[local-validate] Installing npm dependencies..."
  npm install --prefer-offline --no-fund --no-audit
fi

# Idempotently install Playwright Chromium
if ! npx playwright --version &>/dev/null; then
  echo "[local-validate] Installing Playwright Chromium..."
  npx playwright install --with-deps chromium 2>&1 || npx playwright install chromium
fi

echo "[local-validate] Running Node unit tests..."
node --test $(find tests/unit -name '*.test.js' | sort)

echo "[local-validate] Running Playwright E2E tests..."
npx playwright test

echo "[local-validate] All checks passed."
