#!/bin/bash
# Downloads the newest signed release from the private GitHub repo and opens
# it in Firefox, which asks to install or update. Uses your `gh` login.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
tag=$(gh release view --json tagName -q .tagName)
mkdir -p releases
gh release download "$tag" --pattern '*.xpi' --dir releases --clobber
xpi="releases/browser-tab-archive-${tag#v}.xpi"
echo "Opening $xpi in Firefox. Click Add to install."
open -a Firefox "$xpi"
