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

export SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID="$google_client_id"
export SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET="$google_client_secret"
export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-dev}"
export SERVER_PORT="${SERVER_PORT:-18080}"
export READMATES_MANAGEMENT_PORT="${READMATES_MANAGEMENT_PORT:-18081}"
export READMATES_APP_BASE_URL="${READMATES_APP_BASE_URL:-http://localhost:5173}"
export READMATES_AUTH_BASE_URL="${READMATES_AUTH_BASE_URL:-http://localhost:5173}"
export READMATES_ALLOWED_ORIGINS="${READMATES_ALLOWED_ORIGINS:-http://localhost:5173}"
export READMATES_AUTH_SESSION_COOKIE_SECURE="${READMATES_AUTH_SESSION_COOKIE_SECURE:-false}"
export READMATES_IP_HASH_BASE_SECRET="${READMATES_IP_HASH_BASE_SECRET:-local-oauth-ip-hash-placeholder}"

unset google_client_id google_client_secret

if [[ "${READMATES_LOCAL_GOOGLE_OAUTH_DRY_RUN:-false}" == "true" ]]; then
  printf 'Local Google OAuth credentials are ready; no credential values were printed.\n'
  exit 0
fi

cd "$repo_root"
exec ./server/gradlew -p server bootRun "$@"
