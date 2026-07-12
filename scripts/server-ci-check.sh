#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
dry_run="${READMATES_SERVER_CI_CHECK_DRY_RUN:-false}"

run_step() {
  local label="$1"
  shift

  printf '\n==> %s\n' "$label"
  printf '+'
  printf ' %q' "$@"
  printf '\n'

  if [[ "$dry_run" == "true" ]]; then
    return 0
  fi

  "$@"
}

cd "$repo_root"

run_step "Server CI quality gate" ./server/gradlew -p server check

printf '\nServer CI checks passed.\n'
