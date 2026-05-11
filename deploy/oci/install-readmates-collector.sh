#!/usr/bin/env bash
set -euo pipefail

SOURCE_PATH="${1:-/tmp/readmates-collect.sh}"
TARGET_PATH="${READMATES_COLLECT_TARGET:-/usr/local/bin/readmates-collect}"

if [ ! -f "$SOURCE_PATH" ]; then
  echo "collector source not found: $SOURCE_PATH" >&2
  exit 1
fi

install -o root -g root -m 0755 "$SOURCE_PATH" "$TARGET_PATH"

echo "Installed $TARGET_PATH"
echo "To use a diagnostic SSH key, add an authorized_keys entry like:"
echo 'command="/usr/local/bin/readmates-collect",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty,restrict ssh-ed25519 <diagnostic-public-key> readmates-diagnostic'
