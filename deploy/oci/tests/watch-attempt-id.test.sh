#!/usr/bin/env bash
# Guard test for watch-compose-post-deploy.sh attempt-id propagation.
#
# Verifies that:
#   1. WATCH_DRY_RUN=true prints the chosen attempt id and exits 0 without SSH.
#   2. READMATES_DEPLOY_ATTEMPT_ID (parent id) wins over a local ATTEMPT_ID env.
#   3. When neither is set, the chosen id falls back to "unknown".
#
# Usage: bash deploy/oci/tests/watch-attempt-id.test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCH_SCRIPT="${SCRIPT_DIR}/../watch-compose-post-deploy.sh"

if [ ! -x "$WATCH_SCRIPT" ] && [ ! -f "$WATCH_SCRIPT" ]; then
  echo "FAIL: watch-compose-post-deploy.sh not found at $WATCH_SCRIPT" >&2
  exit 1
fi

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Case 1: parent id wins over local ATTEMPT_ID
out="$(
  VM_PUBLIC_IP=127.0.0.1 \
  WATCH_DRY_RUN=true \
  READMATES_DEPLOY_ATTEMPT_ID=parent-id-123 \
  ATTEMPT_ID=local-id-456 \
  bash "$WATCH_SCRIPT" 2>&1
)" || fail "dry-run exited non-zero: $out"

case "$out" in
  *parent-id-123*) ;;
  *) fail "expected parent-id-123 in dry-run output, got: $out" ;;
esac

case "$out" in
  *local-id-456*) fail "local ATTEMPT_ID should not have been chosen, got: $out" ;;
  *) ;;
esac

# Case 2: local ATTEMPT_ID is used when parent unset
out="$(
  VM_PUBLIC_IP=127.0.0.1 \
  WATCH_DRY_RUN=true \
  ATTEMPT_ID=local-id-789 \
  bash "$WATCH_SCRIPT" 2>&1
)" || fail "dry-run (local-only) exited non-zero: $out"

case "$out" in
  *local-id-789*) ;;
  *) fail "expected local-id-789 fallback, got: $out" ;;
esac

# Case 3: neither set falls back to "unknown"
out="$(
  VM_PUBLIC_IP=127.0.0.1 \
  WATCH_DRY_RUN=true \
  bash "$WATCH_SCRIPT" 2>&1
)" || fail "dry-run (neither set) exited non-zero: $out"

case "$out" in
  *unknown*) ;;
  *) fail "expected 'unknown' fallback, got: $out" ;;
esac

echo "PASS: watch-attempt-id propagation"
