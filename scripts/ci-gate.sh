#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Stage and commit any dirty files
if ! git diff --quiet || ! git diff --staged --quiet; then
  echo "[ci-gate] Committing dirty files..."
  git add -A
  git commit -m "chore: pre-ci snapshot" --no-verify || true
fi

echo "[ci-gate] Pushing branch $BRANCH..."
git push -u origin "$BRANCH"

# Get the SHA we just pushed
SHA=$(git rev-parse HEAD)
echo "[ci-gate] Waiting for CI run for $SHA..."

# Poll for a run matching our SHA
RUN_ID=""
for i in $(seq 1 20); do
  sleep 15
  RUN_ID=$(gh run list --branch "$BRANCH" --limit 10 --json headSha,databaseId \
    | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const r=JSON.parse(d).find(x=>x.headSha==='$SHA');process.stdout.write(r?String(r.databaseId):'')")
  if [ -n "$RUN_ID" ]; then
    echo "[ci-gate] Found run $RUN_ID"
    break
  fi
  echo "[ci-gate] Waiting for run to appear... ($i/20)"
done

if [ -z "$RUN_ID" ]; then
  echo "[ci-gate] ERROR: No CI run found for $SHA after waiting"
  exit 1
fi

echo "[ci-gate] Watching run $RUN_ID..."
gh run watch "$RUN_ID" --exit-status || {
  echo "[ci-gate] CI FAILED. Printing logs:"
  gh run view "$RUN_ID" --log-failed
  exit 1
}

echo "[ci-gate] CI passed."
