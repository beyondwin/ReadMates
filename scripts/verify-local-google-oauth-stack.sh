#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
runner="$repo_root/scripts/run-local-google-oauth.sh"
checker="$repo_root/scripts/check-local-google-oauth-redirect.py"
frontend_port="${READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT:-5174}"
backend_port="${READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT:-28080}"
management_port="${READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT:-28081}"

fail() {
  printf 'local Google OAuth stack verification error: %s\n' "$1" >&2
  exit 1
}

validate_port() {
  local label="$1"
  local value="$2"

  [[ "$value" =~ ^[0-9]+$ ]] || fail "$label must be an integer from 1024 to 65535"
  ((value >= 1024 && value <= 65535)) || fail "$label must be an integer from 1024 to 65535"
}

validate_port "frontend port" "$frontend_port"
validate_port "backend port" "$backend_port"
validate_port "management port" "$management_port"

if [[ "$frontend_port" == "$backend_port" || "$frontend_port" == "$management_port" || "$backend_port" == "$management_port" ]]; then
  fail "frontend, backend, and management ports must be distinct"
fi

READMATES_LOCAL_GOOGLE_OAUTH_DRY_RUN=true "$runner" >/dev/null || fail "local Google OAuth credential preflight failed"

backend_health="http://127.0.0.1:$backend_port/actuator/health"
frontend_login="http://localhost:$frontend_port/login"
callback="http://localhost:$frontend_port/login/oauth2/code/google"
start_url="http://localhost:$frontend_port/oauth2/authorization/google?returnTo=%2Fapp"
start_recovery_url="http://localhost:$frontend_port/oauth2/authorization/google?returnTo=%2Fapp&chooseAccount=true"
start_invalid_url="http://localhost:$frontend_port/oauth2/authorization/google?returnTo=%2Fapp&chooseAccount=TRUE"

curl -fsS --max-time 2 "$backend_health" >/dev/null || fail "backend health endpoint is not reachable: $backend_health"
curl -fsS --max-time 2 "$frontend_login" >/dev/null || fail "frontend login endpoint is not reachable: $frontend_login"

extract_redirect_location() {
  local url="$1"
  local headers
  local location

  headers="$(curl -fsS -D - -o /dev/null "$url")"
  location="$(printf '%s\n' "$headers" | awk '/^[Ll]ocation:/{sub(/^[Ll]ocation:[[:space:]]*/,""); sub(/\r$/,""); print; exit}')"

  if [[ -z "$location" ]]; then
    fail "OAuth authorization endpoint did not redirect"
  fi

  printf '%s' "$location"
}

check_redirect() {
  local label="$1"
  local url="$2"
  local expected_prompt="$3"
  local location

  location="$(extract_redirect_location "$url")"
  if ! printf '%s' "$location" | python3 "$checker" --expected-callback "$callback" --expected-prompt "$expected_prompt"; then
    fail "OAuth redirect contract failed for $label"
  fi
}

check_redirect "normal" "$start_url" "absent"
check_redirect "recovery" "$start_recovery_url" "select_account"
check_redirect "invalid-chooser" "$start_invalid_url" "absent"

printf 'local Google OAuth stack smoke checks passed.\n'
