#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runner="$repo_root/scripts/run-local-google-oauth.sh"

if [[ ! -x "$runner" ]]; then
  printf 'expected executable local Google OAuth runner: %s\n' "$runner" >&2
  exit 1
fi

fixture_root="$(mktemp -d)"
trap 'rm -rf "$fixture_root"' EXIT
mkdir -p "$fixture_root/bin"

cat > "$fixture_root/bin/security" <<'MOCK_SECURITY'
#!/usr/bin/env bash
set -euo pipefail

case "$*" in
  *readmates.local.google-oauth.client-id*)
    printf '%s' "${MOCK_GOOGLE_CLIENT_ID:-}"
    ;;
  *readmates.local.google-oauth.client-secret*)
    printf '%s' "${MOCK_GOOGLE_CLIENT_SECRET:-}"
    ;;
  *)
    printf 'unexpected Keychain lookup\n' >&2
    exit 64
    ;;
esac
MOCK_SECURITY
chmod +x "$fixture_root/bin/security"

run_fixture() {
  PATH="$fixture_root/bin:$PATH" \
    READMATES_LOCAL_GOOGLE_OAUTH_DRY_RUN=true \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="${READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY:-}" \
    READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION="${READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION:-}" \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY="${READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY:-}" \
    READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION="${READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION:-}" \
    READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS="${READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS:-}" \
    MOCK_GOOGLE_CLIENT_ID="${MOCK_GOOGLE_CLIENT_ID:-}" \
    MOCK_GOOGLE_CLIENT_SECRET="${MOCK_GOOGLE_CLIENT_SECRET:-}" \
    "$runner" 2>&1
}

READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY=
READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=
READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY=
READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=
READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=

MOCK_GOOGLE_CLIENT_ID=local-google-client-id
MOCK_GOOGLE_CLIENT_SECRET=local-google-client-secret
if invalid_output="$(run_fixture)"; then
  printf 'expected placeholder client id to be rejected\n' >&2
  exit 1
fi
if [[ "$invalid_output" != *"Google OAuth client ID"* ]]; then
  printf 'expected a safe client-id validation error, got: %s\n' "$invalid_output" >&2
  exit 1
fi

MOCK_GOOGLE_CLIENT_ID=123456789-fixture.apps.googleusercontent.com
MOCK_GOOGLE_CLIENT_SECRET=
if missing_output="$(run_fixture)"; then
  printf 'expected missing client secret to be rejected\n' >&2
  exit 1
fi
if [[ "$missing_output" != *"client secret"* ]]; then
  printf 'expected a safe client-secret validation error, got: %s\n' "$missing_output" >&2
  exit 1
fi

MOCK_GOOGLE_CLIENT_ID=123456789-fixture.apps.googleusercontent.com
MOCK_GOOGLE_CLIENT_SECRET=keychain-test-value-42
admin_digest_sentinel=fixture-oauth-admin-digest-sentinel-42
READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="$admin_digest_sentinel"
valid_output="$(run_fixture)"
if [[ "$valid_output" != *"Local Google OAuth credentials are ready"* ]]; then
  printf 'expected successful dry-run evidence, got: %s\n' "$valid_output" >&2
  exit 1
fi
if [[ "$valid_output" != *"admin command digest configuration is ready"* ]]; then
  printf 'expected local admin command digest readiness evidence, got: %s\n' "$valid_output" >&2
  exit 1
fi
if [[ "$valid_output" == *"$MOCK_GOOGLE_CLIENT_ID"* ||
  "$valid_output" == *"$MOCK_GOOGLE_CLIENT_SECRET"* ||
  "$valid_output" == *"$admin_digest_sentinel"* ]]; then
  printf 'runner exposed credential material in output\n' >&2
  exit 1
fi

if READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY='   ' \
  READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=1 \
  READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=0 \
  READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false \
  blank_key_output="$(run_fixture)"; then
  printf 'expected whitespace-only local admin digest key to be rejected\n' >&2
  exit 1
fi
if [[ "$blank_key_output" != *"local admin command digest key must not be blank"* ]]; then
  printf 'expected a safe blank admin digest error, got: %s\n' "$blank_key_output" >&2
  exit 1
fi

if READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="$admin_digest_sentinel" \
  READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=01 \
  READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=1 \
  READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false \
  noncanonical_version_output="$(run_fixture)"; then
  printf 'expected leading-zero local admin digest version to be rejected\n' >&2
  exit 1
fi
if [[ "$noncanonical_version_output" != *"admin command digest key versions must be canonical 32-bit non-negative integers"* ]]; then
  printf 'expected a safe canonical admin digest version error, got: %s\n' "$noncanonical_version_output" >&2
  exit 1
fi
if [[ "$noncanonical_version_output" == *"$admin_digest_sentinel"* ]]; then
  printf 'canonical version validation exposed admin digest material\n' >&2
  exit 1
fi

if READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=1 \
  READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=1 \
  invalid_admin_output="$(run_fixture)"; then
  printf 'expected duplicate local admin digest versions to be rejected\n' >&2
  exit 1
fi
if [[ "$invalid_admin_output" != *"admin command digest key versions must differ"* ]]; then
  printf 'expected a safe admin digest version error, got: %s\n' "$invalid_admin_output" >&2
  exit 1
fi

if READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=-1 \
  READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=0 \
  READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false \
  invalid_version_output="$(run_fixture)"; then
  printf 'expected negative local admin digest version to be rejected\n' >&2
  exit 1
fi
if [[ "$invalid_version_output" != *"admin command digest key versions must be canonical 32-bit non-negative integers"* ]]; then
  printf 'expected a safe admin digest version-range error, got: %s\n' "$invalid_version_output" >&2
  exit 1
fi

if READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="$admin_digest_sentinel" \
  READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=2147483648 \
  READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=0 \
  READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=false \
  overflow_version_output="$(run_fixture)"; then
  printf 'expected out-of-range local admin digest version to be rejected\n' >&2
  exit 1
fi
if [[ "$overflow_version_output" != *"admin command digest key versions must be canonical 32-bit non-negative integers"* ]]; then
  printf 'expected a safe admin digest version-range error, got: %s\n' "$overflow_version_output" >&2
  exit 1
fi
if [[ "$overflow_version_output" == *"$admin_digest_sentinel"* ]]; then
  printf 'version-range validation exposed admin digest material\n' >&2
  exit 1
fi

if READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY='' \
  READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=1 \
  READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=0 \
  READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=true \
  invalid_alias_output="$(run_fixture)"; then
  printf 'expected previous-alias write without a previous key to be rejected\n' >&2
  exit 1
fi
if [[ "$invalid_alias_output" != *"previous-alias write requires a non-blank previous key"* ]]; then
  printf 'expected a safe previous-alias validation error, got: %s\n' "$invalid_alias_output" >&2
  exit 1
fi
if [[ "$invalid_alias_output" == *"$admin_digest_sentinel"* ]]; then
  printf 'previous-alias validation exposed admin digest material\n' >&2
  exit 1
fi

if READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY='   ' \
  READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION=1 \
  READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION=0 \
  READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS=true \
  whitespace_alias_output="$(run_fixture)"; then
  printf 'expected previous-alias write with a whitespace-only previous key to be rejected\n' >&2
  exit 1
fi
if [[ "$whitespace_alias_output" != *"previous-alias write requires a non-blank previous key"* ]]; then
  printf 'expected a safe whitespace previous-key error, got: %s\n' "$whitespace_alias_output" >&2
  exit 1
fi
if [[ "$whitespace_alias_output" == *"$admin_digest_sentinel"* ]]; then
  printf 'whitespace previous-key validation exposed admin digest material\n' >&2
  exit 1
fi

printf 'local Google OAuth Keychain fixture checks passed\n'
