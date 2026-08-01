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
    MOCK_GOOGLE_CLIENT_ID="${MOCK_GOOGLE_CLIENT_ID:-}" \
    MOCK_GOOGLE_CLIENT_SECRET="${MOCK_GOOGLE_CLIENT_SECRET:-}" \
    "$runner" 2>&1
}

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
valid_output="$(run_fixture)"
if [[ "$valid_output" != *"Local Google OAuth credentials are ready"* ]]; then
  printf 'expected successful dry-run evidence, got: %s\n' "$valid_output" >&2
  exit 1
fi
if [[ "$valid_output" == *"$MOCK_GOOGLE_CLIENT_ID"* || "$valid_output" == *"$MOCK_GOOGLE_CLIENT_SECRET"* ]]; then
  printf 'runner exposed credential material in output\n' >&2
  exit 1
fi

printf 'local Google OAuth Keychain fixture checks passed\n'
