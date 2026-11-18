#!/bin/bash
# Builds the committed extension (HEAD) and has Mozilla sign it as an unlisted
# (private) add-on. Runs in GitHub Actions on every push to main.
#
# Needs WEB_EXT_API_KEY and WEB_EXT_API_SECRET (AMO JWT issuer and secret).
# Version = major.minor from manifest.json + number of commits on main, so
# every release gets a new, higher version.
# Output: dist/browser-tab-archive-<version>.xpi
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
: "${WEB_EXT_API_KEY:?missing AMO JWT issuer}"
: "${WEB_EXT_API_SECRET:?missing AMO JWT secret}"

base=$(node -p 'require("./manifest.json").version.split(".").slice(0,2).join(".")')
version="$base.$(git rev-list --count HEAD)"

build=$(mktemp -d)
signed=$(mktemp -d)
trap 'rm -rf "$build" "$signed"' EXIT
git archive HEAD manifest.json background lib popup sidebar options icons | tar -x -C "$build"
node -e '
  const f = process.argv[1], m = require(f);
  m.version = process.argv[2];
  require("fs").writeFileSync(f, JSON.stringify(m, null, 2) + "\n");
' "$build/manifest.json" "$version"

echo "Signing Browser Tab Archive $version..."
npx web-ext sign --channel=unlisted --source-dir "$build" --artifacts-dir "$signed"

mkdir -p dist
xpi="dist/browser-tab-archive-$version.xpi"
mv "$signed"/*.xpi "$xpi"
echo "Signed: $xpi"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "version=$version" >> "$GITHUB_OUTPUT"
  echo "xpi=$xpi" >> "$GITHUB_OUTPUT"
fi
