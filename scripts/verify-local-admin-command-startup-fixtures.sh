#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
fixture_root="$(mktemp -d)"
trap 'rm -rf "$fixture_root"' EXIT
mkdir -p "$fixture_root/bin"

cat > "$fixture_root/bin/docker" <<'MOCK_DOCKER'
#!/usr/bin/env bash
exit 97
MOCK_DOCKER
chmod +x "$fixture_root/bin/docker"
admin_digest_sentinel="fixture-observability-admin-digest-sentinel-42"

output="$({
  PATH="$fixture_root/bin:$PATH" \
    READMATES_OBSERVABILITY_LOCAL_SMOKE_CONFIG_DRY_RUN=true \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="$admin_digest_sentinel" \
    "$repo_root/scripts/observability-local-smoke.sh"
} 2>&1)"

grep -Fq 'Local observability startup configuration is ready' <<<"$output" || {
  printf 'expected local observability config-only success, got: %s\n' "$output" >&2
  exit 1
}
if grep -Fq "$admin_digest_sentinel" <<<"$output"; then
  printf 'observability config-only output exposed local digest material\n' >&2
  exit 1
fi

if invalid_output="$({
  PATH="$fixture_root/bin:$PATH" \
    READMATES_OBSERVABILITY_LOCAL_SMOKE_CONFIG_DRY_RUN=true \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=2 \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=2 \
    "$repo_root/scripts/observability-local-smoke.sh"
} 2>&1)"; then
  printf 'expected duplicate observability digest versions to be rejected\n' >&2
  exit 1
fi
grep -Fq 'admin command digest key versions must differ' <<<"$invalid_output" || {
  printf 'expected a safe observability digest version error, got: %s\n' "$invalid_output" >&2
  exit 1
}

printf 'local admin command startup fixture checks passed\n'
