#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
client_id_service="readmates.local.google-oauth.client-id"
client_secret_service="readmates.local.google-oauth.client-secret"
keychain_account="${READMATES_LOCAL_KEYCHAIN_ACCOUNT:-${USER:-}}"

fail() {
  printf 'local Google OAuth setup error: %s\n' "$1" >&2
  exit 1
}

is_canonical_admin_digest_version() {
  local value="$1"
  local numeric_value
  [[ "$value" =~ ^(0|[1-9][0-9]*)$ ]] || return 1
  [[ "${#value}" -le 10 ]] || return 1
  numeric_value=$((10#$value))
  (( numeric_value <= 2147483647 ))
}

if [[ "$(uname -s)" != "Darwin" ]] || ! command -v security >/dev/null 2>&1; then
  fail "macOS Keychain is required; use an OS secret manager and inject the two Spring OAuth variables on other platforms"
fi

if [[ -z "$keychain_account" ]]; then
  fail "Keychain account is unavailable; set READMATES_LOCAL_KEYCHAIN_ACCOUNT"
fi

if ! google_client_id="$(security find-generic-password -a "$keychain_account" -s "$client_id_service" -w 2>/dev/null)"; then
  fail "Google OAuth client ID was not found in Keychain"
fi
if ! google_client_secret="$(security find-generic-password -a "$keychain_account" -s "$client_secret_service" -w 2>/dev/null)"; then
  fail "Google OAuth client secret was not found in Keychain"
fi

if [[ ! "$google_client_id" =~ ^[0-9]+-[A-Za-z0-9_-]+[.]apps[.]googleusercontent[.]com$ ]]; then
  fail "Google OAuth client ID is not a valid Google web client identifier"
fi

case "$google_client_secret" in
  ""|"<google-oauth-client-secret>"|"local-google-client-secret"|"test-secret"|"dummy-secret")
    fail "Google OAuth client secret is missing or still a placeholder"
    ;;
esac

google_client_id_var="SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID"
google_client_secret_var="SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET"
declare -x "$google_client_id_var"
declare -x "$google_client_secret_var"
printf -v "$google_client_id_var" '%s' "$google_client_id"
printf -v "$google_client_secret_var" '%s' "$google_client_secret"
export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-dev}"
export SERVER_PORT="${SERVER_PORT:-18080}"
export READMATES_MANAGEMENT_PORT="${READMATES_MANAGEMENT_PORT:-18081}"
export READMATES_APP_BASE_URL="${READMATES_APP_BASE_URL:-http://localhost:5173}"
export READMATES_AUTH_BASE_URL="${READMATES_AUTH_BASE_URL:-http://localhost:5173}"
export READMATES_ALLOWED_ORIGINS="${READMATES_ALLOWED_ORIGINS:-http://localhost:5173}"
export READMATES_AUTH_SESSION_COOKIE_SECURE="${READMATES_AUTH_SESSION_COOKIE_SECURE:-false}"
export READMATES_IP_HASH_BASE_SECRET="${READMATES_IP_HASH_BASE_SECRET:-local-oauth-ip-hash-placeholder}"
export READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY="${READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY:-local-only-admin-command-digest-material}"
export READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION="${READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION:-1}"
export READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY="${READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY:-}"
export READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION="${READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION:-0}"
export READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS="${READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS:-false}"

if [[ ! "$READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY" =~ [^[:space:]] ]]; then
  fail "local admin command digest key must not be blank"
fi
if ! is_canonical_admin_digest_version "$READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION" ||
  ! is_canonical_admin_digest_version "$READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION"; then
  fail "admin command digest key versions must be canonical 32-bit non-negative integers"
fi
admin_digest_current_version_number=$((10#$READMATES_ADMIN_COMMAND_DIGEST_CURRENT_KEY_VERSION))
admin_digest_previous_version_number=$((10#$READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY_VERSION))
if (( admin_digest_current_version_number == admin_digest_previous_version_number )); then
  fail "admin command digest key versions must differ"
fi
case "$READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS" in
  true|false) ;;
  *) fail "admin command digest previous-alias write flag must be true or false" ;;
esac
if [[ "$READMATES_ADMIN_COMMAND_DIGEST_WRITE_PREVIOUS_ALIAS" == "true" &&
  ! "$READMATES_ADMIN_COMMAND_DIGEST_PREVIOUS_KEY" =~ [^[:space:]] ]]; then
  fail "admin command digest previous-alias write requires a non-blank previous key"
fi

unset google_client_id google_client_secret

if [[ "${READMATES_LOCAL_GOOGLE_OAUTH_DRY_RUN:-false}" == "true" ]]; then
  printf 'Local Google OAuth credentials are ready; admin command digest configuration is ready; no credential values were printed.\n'
  exit 0
fi

cd "$repo_root"
exec ./server/gradlew -p server bootRun "$@"
