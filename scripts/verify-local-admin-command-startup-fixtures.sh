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
    READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false \
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

if blank_key_output="$({
  PATH="$fixture_root/bin:$PATH" \
    READMATES_OBSERVABILITY_LOCAL_SMOKE_CONFIG_DRY_RUN=true \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY='   ' \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=1 \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=0 \
    READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false \
    "$repo_root/scripts/observability-local-smoke.sh"
} 2>&1)"; then
  printf 'expected whitespace-only observability digest key to be rejected\n' >&2
  exit 1
fi
grep -Fq 'local admin command digest key must not be blank' <<<"$blank_key_output" || {
  printf 'expected a safe observability blank-key error, got: %s\n' "$blank_key_output" >&2
  exit 1
}

if noncanonical_version_output="$({
  PATH="$fixture_root/bin:$PATH" \
    READMATES_OBSERVABILITY_LOCAL_SMOKE_CONFIG_DRY_RUN=true \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="$admin_digest_sentinel" \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=01 \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=1 \
    READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false \
    "$repo_root/scripts/observability-local-smoke.sh"
} 2>&1)"; then
  printf 'expected leading-zero observability digest version to be rejected\n' >&2
  exit 1
fi
grep -Fq 'admin command digest key versions must be canonical 32-bit non-negative integers' \
  <<<"$noncanonical_version_output" || {
  printf 'expected a safe observability canonical-version error, got: %s\n' \
    "$noncanonical_version_output" >&2
  exit 1
}

if overflow_version_output="$({
  PATH="$fixture_root/bin:$PATH" \
    READMATES_OBSERVABILITY_LOCAL_SMOKE_CONFIG_DRY_RUN=true \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="$admin_digest_sentinel" \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=2147483648 \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=0 \
    READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false \
    "$repo_root/scripts/observability-local-smoke.sh"
} 2>&1)"; then
  printf 'expected out-of-range observability digest version to be rejected\n' >&2
  exit 1
fi
grep -Fq 'admin command digest key versions must be canonical 32-bit non-negative integers' \
  <<<"$overflow_version_output" || {
  printf 'expected a safe observability digest version-range error, got: %s\n' \
    "$overflow_version_output" >&2
  exit 1
}
if grep -Fq "$admin_digest_sentinel" <<<"$overflow_version_output"; then
  printf 'observability version-range validation exposed admin digest material\n' >&2
  exit 1
fi
if grep -Fq "$admin_digest_sentinel" <<<"$noncanonical_version_output"; then
  printf 'observability canonical version validation exposed admin digest material\n' >&2
  exit 1
fi

if invalid_output="$({
  PATH="$fixture_root/bin:$PATH" \
    READMATES_OBSERVABILITY_LOCAL_SMOKE_CONFIG_DRY_RUN=true \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=2 \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=2 \
    READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false \
    "$repo_root/scripts/observability-local-smoke.sh"
} 2>&1)"; then
  printf 'expected duplicate observability digest versions to be rejected\n' >&2
  exit 1
fi
grep -Fq 'admin command digest key versions must differ' <<<"$invalid_output" || {
  printf 'expected a safe observability digest version error, got: %s\n' "$invalid_output" >&2
  exit 1
}

if invalid_version_output="$({
  PATH="$fixture_root/bin:$PATH" \
    READMATES_OBSERVABILITY_LOCAL_SMOKE_CONFIG_DRY_RUN=true \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="$admin_digest_sentinel" \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=-1 \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=0 \
    READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false \
    "$repo_root/scripts/observability-local-smoke.sh"
} 2>&1)"; then
  printf 'expected negative observability digest version to be rejected\n' >&2
  exit 1
fi
grep -Fq 'admin command digest key versions must be canonical 32-bit non-negative integers' \
  <<<"$invalid_version_output" || {
  printf 'expected a safe observability digest version-range error, got: %s\n' "$invalid_version_output" >&2
  exit 1
}

if invalid_alias_output="$({
  PATH="$fixture_root/bin:$PATH" \
    READMATES_OBSERVABILITY_LOCAL_SMOKE_CONFIG_DRY_RUN=true \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="$admin_digest_sentinel" \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY= \
    READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=true \
    "$repo_root/scripts/observability-local-smoke.sh"
} 2>&1)"; then
  printf 'expected observability previous-alias write without a previous key to be rejected\n' >&2
  exit 1
fi
grep -Fq 'previous-alias write requires a non-blank previous key' <<<"$invalid_alias_output" || {
  printf 'expected a safe observability previous-alias error, got: %s\n' "$invalid_alias_output" >&2
  exit 1
}
if grep -Fq "$admin_digest_sentinel" <<<"$invalid_alias_output"; then
  printf 'observability previous-alias validation exposed admin digest material\n' >&2
  exit 1
fi

if whitespace_alias_output="$({
  PATH="$fixture_root/bin:$PATH" \
    READMATES_OBSERVABILITY_LOCAL_SMOKE_CONFIG_DRY_RUN=true \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="$admin_digest_sentinel" \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY='   ' \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=1 \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=0 \
    READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=true \
    "$repo_root/scripts/observability-local-smoke.sh"
} 2>&1)"; then
  printf 'expected observability previous-alias write with a whitespace-only previous key to be rejected\n' >&2
  exit 1
fi
grep -Fq 'previous-alias write requires a non-blank previous key' <<<"$whitespace_alias_output" || {
  printf 'expected a safe observability whitespace previous-key error, got: %s\n' \
    "$whitespace_alias_output" >&2
  exit 1
}
if grep -Fq "$admin_digest_sentinel" <<<"$whitespace_alias_output"; then
  printf 'observability whitespace previous-key validation exposed admin digest material\n' >&2
  exit 1
fi

printf 'local admin command startup fixture checks passed\n'
