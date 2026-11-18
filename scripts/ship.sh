#!/bin/bash
# Pushes main, waits for GitHub to sign the release, then opens it in Firefox.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "Switch to main first (git switch main)." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first." >&2; exit 1; }

sha=$(git rev-parse HEAD)
git push origin main

echo "Waiting for the release workflow to start..."
run=""
for _ in $(seq 1 30); do
  run=$(gh run list --workflow release.yml --commit "$sha" --json databaseId -q '.[0].databaseId')
  [ -n "$run" ] && break
  sleep 2
done
[ -n "$run" ] || { echo "The release workflow didn't start. Check the Actions tab on GitHub." >&2; exit 1; }

gh run watch "$run" --exit-status
scripts/install-latest.sh
