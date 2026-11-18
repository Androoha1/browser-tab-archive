#!/bin/bash
# Brings this computer up to date with GitHub:
#   1. updates the local main branch (your current branch and changes stay as they are),
#   2. waits for a release that GitHub is still signing,
#   3. opens the newest signed release in Firefox, which asks to install it.
# Uses your `gh` login. Pass --force to reinstall the newest release.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
force=false
[ "${1:-}" = "--force" ] && force=true

# 1. Local main
git fetch -q origin main
if [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ]; then
  git merge -q --ff-only origin/main ||
    echo "Note: your local main has commits that aren't on GitHub, so it wasn't updated."
else
  git fetch -q origin main:main ||
    echo "Note: your local main has commits that aren't on GitHub, so it wasn't updated."
fi
echo "main is at $(git log -1 --format='%h %s' main)"

# 2. A release still being signed
run=$(gh run list --workflow release.yml --branch main --limit 1 --json databaseId,status \
  -q '.[] | select(.status != "completed") | .databaseId')
if [ -n "$run" ]; then
  echo "A release is still being signed. Waiting for it..."
  gh run watch "$run" --exit-status >/dev/null || {
    echo "The release failed. See: gh run view $run --log-failed" >&2; exit 1; }
fi

# 3. Install the newest release
tag=$(gh release view --json tagName -q .tagName)
version="${tag#v}"
mkdir -p releases
if ! $force && [ "$(cat releases/.installed 2>/dev/null)" = "$version" ]; then
  echo "Browser Tab Archive $version is already installed. (npm run sync -- --force reinstalls it.)"
  exit 0
fi
gh release download "$tag" --pattern '*.xpi' --dir releases --clobber
open -a Firefox "releases/browser-tab-archive-$version.xpi"
echo "$version" > releases/.installed
echo "Opened Browser Tab Archive $version in Firefox. Click Add to install."
