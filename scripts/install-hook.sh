#!/bin/bash
# Installs a git post-commit hook that signs and opens a new release after
# every commit on main. It runs in the background; output goes to releases/release.log.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
hook="$root/.git/hooks/post-commit"
cat > "$hook" <<'HOOK'
#!/bin/bash
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || exit 0
root="$(git rev-parse --show-toplevel)"
mkdir -p "$root/releases"
( "$root/scripts/release.sh" >> "$root/releases/release.log" 2>&1 \
  || osascript -e 'display notification "Signing failed. See releases/release.log." with title "Browser Tab Archive"' ) &
HOOK
chmod +x "$hook"
echo "Installed $hook"
