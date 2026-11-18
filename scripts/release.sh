#!/bin/bash
# Builds the committed extension (HEAD), has Mozilla sign it as an unlisted
# (private) add-on, and opens the signed .xpi in Firefox to install it.
# Version = major.minor from manifest.json + number of commits, so every
# commit gets a new, higher version.
#
# AMO API credentials are read from the macOS Keychain (see README).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

key=$(security find-generic-password -s tab-archive-amo -a jwt-issuer -w 2>/dev/null) || {
  echo "Missing AMO API key in Keychain. See README > Releases." >&2; exit 1; }
secret=$(security find-generic-password -s tab-archive-amo -a jwt-secret -w 2>/dev/null) || {
  echo "Missing AMO API secret in Keychain. See README > Releases." >&2; exit 1; }

base=$(node -p 'require("./manifest.json").version.split(".").slice(0,2).join(".")')
version="$base.$(git rev-list --count HEAD)"

build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
git archive HEAD manifest.json background lib popup sidebar options icons | tar -x -C "$build"
node -e '
  const f = process.argv[1], m = require(f);
  m.version = process.argv[2];
  require("fs").writeFileSync(f, JSON.stringify(m, null, 2) + "\n");
' "$build/manifest.json" "$version"

mkdir -p releases
echo "Signing Tab Archive $version (usually takes a minute or two)..."
npx web-ext sign --channel=unlisted --source-dir "$build" --artifacts-dir releases \
  --api-key "$key" --api-secret "$secret"

xpi=$(ls -t releases/*.xpi | head -1)
echo "Signed: $xpi"
open -a Firefox "$xpi"
osascript -e "display notification \"Version $version is ready. Click Add in Firefox.\" with title \"Tab Archive\"" || true
