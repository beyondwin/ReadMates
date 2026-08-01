#!/usr/bin/env bash

set -euo pipefail
set -m

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
runner="$repo_root/scripts/run-local-google-oauth.sh"
frontend_port="${READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT:-5174}"
backend_port="${READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT:-28080}"
management_port="${READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT:-28081}"
timeout_seconds="${READMATES_LOCAL_GOOGLE_OAUTH_STARTUP_TIMEOUT_SECONDS:-180}"
open_browser="${READMATES_LOCAL_GOOGLE_OAUTH_OPEN_BROWSER:-false}"

backend_pid=""
frontend_pid=""
backend_pgid=""
frontend_pgid=""
runtime_dir=""

fail() {
  printf 'local Google OAuth stack error: %s\n' "$1" >&2
  exit 1
}

validate_port() {
  local label="$1"
  local value="$2"

  [[ "$value" =~ ^[0-9]+$ ]] || fail "$label must be an integer from 1024 to 65535"
  ((value >= 1024 && value <= 65535)) || fail "$label must be an integer from 1024 to 65535"
}

validate_timeout() {
  local value="$1"

  [[ "$value" =~ ^[0-9]+$ ]] || fail "startup timeout must be an integer from 1 to 600"
  ((value >= 1 && value <= 600)) || fail "startup timeout must be an integer from 1 to 600"
}

validate_boolean() {
  local value="$1"

  [[ "$value" == "true" || "$value" == "false" ]] || fail "open-browser flag must be exactly true or false"
}

validate_dependencies() {
  local command_name

  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail "macOS is required for local Google OAuth stack execution"
  fi

  for command_name in curl python3 ps tr mktemp security "$runner" "$repo_root/server/gradlew"; do
    command -v "$command_name" >/dev/null 2>&1 || fail "required command not found: $command_name"
  done

  if ! [[ -x "$runner" ]]; then
    fail "expected executable local Google OAuth runner: $runner"
  fi

  if ! [[ -x "$repo_root/server/gradlew" ]]; then
    fail "expected executable Gradle wrapper: $repo_root/server/gradlew"
  fi
}

resolve_corepack_command() {
  if command -v corepack >/dev/null 2>&1; then
    corepack_cmd=(corepack)
  elif command -v npx >/dev/null 2>&1; then
    corepack_cmd=(npx --yes corepack@0.35.0)
  else
    fail "Corepack is unavailable and the documented npx fallback was not found"
  fi
}

is_port_free() {
  local port="$1"

  python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
try:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", port))
except OSError:
    raise SystemExit(1)
PY
}

record_process_group() {
  local pid="$1"
  local pgid

  [[ "$pid" =~ ^[0-9]+$ ]] || fail "missing child pid for process-group recording"
  pgid="$(ps -o pgid= -p "$pid" | tr -d '[:space:]')"
  if [[ -z "$pgid" || "$pgid" != "$pid" || "$pgid" -le 1 ]]; then
    fail "could not isolate a child process group"
  fi
  printf '%s' "$pgid"
}

terminate_process_group() {
  local pgid="$1"
  local attempt

  [[ "$pgid" =~ ^[0-9]+$ && "$pgid" -gt 1 ]] || return 0
  kill -TERM -- "-$pgid" >/dev/null 2>&1 || return 0
  for attempt in 1 2 3 4 5; do
    if ! kill -0 -- "-$pgid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  kill -KILL -- "-$pgid" >/dev/null 2>&1 || true
}

cleanup() {
  local exit_status="$1"

  trap - INT TERM EXIT

  if [[ -n "$frontend_pgid" ]]; then
    terminate_process_group "$frontend_pgid"
  fi

  if [[ -n "$backend_pgid" ]]; then
    terminate_process_group "$backend_pgid"
  fi

  if [[ -n "$runtime_dir" && -d "$runtime_dir" ]]; then
    rm -rf -- "$runtime_dir"
  fi

  exit "$exit_status"
}

wait_for_http() {
  local label="$1"
  local url="$2"
  local child_pid="$3"
  local deadline
  local now

  deadline=$((SECONDS + timeout_seconds))

  while ((SECONDS < deadline)); do
    if ! kill -0 -- "$child_pid" >/dev/null 2>&1; then
      fail "$label process exited before readiness"
    fi

    if curl -fsS --max-time 2 -o /dev/null "$url" >/dev/null 2>&1; then
      return 0
    fi

    sleep 1
  done

  fail "$label did not become ready at $url before timeout"
}

check_port_free() {
  local label="$1"
  local value="$2"

  if ! is_port_free "$value"; then
    fail "required port is already in use: $label=$value"
  fi
}

cleanup_with_status() {
  cleanup "$?"
}

main() {
  validate_dependencies
  validate_port "frontend port" "$frontend_port"
  validate_port "backend port" "$backend_port"
  validate_port "management port" "$management_port"

  if [[ "$frontend_port" == "$backend_port" || "$frontend_port" == "$management_port" || "$backend_port" == "$management_port" ]]; then
    fail "frontend, backend, and management ports must be distinct"
  fi

  validate_timeout "$timeout_seconds"
  validate_boolean "$open_browser"

  resolve_corepack_command
  check_port_free "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT" "$frontend_port"
  check_port_free "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT" "$backend_port"
  check_port_free "READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT" "$management_port"

  runtime_dir="$(mktemp -d -t readmates-local-google-oauth.XXXXXX)"
  trap cleanup_with_status EXIT INT TERM

  if ! READMATES_LOCAL_GOOGLE_OAUTH_DRY_RUN=true "$runner" >"$runtime_dir/runner-dry-run.log" 2>&1; then
    fail "local Google OAuth credential preflight failed"
  fi

  env \
    SERVER_PORT="$backend_port" \
    READMATES_MANAGEMENT_PORT="$management_port" \
    READMATES_APP_BASE_URL="http://localhost:$frontend_port" \
    READMATES_AUTH_BASE_URL="http://localhost:$frontend_port" \
    READMATES_ALLOWED_ORIGINS="http://localhost:$frontend_port" \
    "$runner" >/"$runtime_dir/backend.log" 2>&1 &
  backend_pid=$!
  backend_pgid="$(record_process_group "$backend_pid")"

  wait_for_http "backend" "http://127.0.0.1:$management_port/actuator/health" "$backend_pid"

  env \
    READMATES_API_BASE_URL="http://127.0.0.1:$backend_port" \
    VITE_ENABLE_GOOGLE_LOGIN=true \
    "${corepack_cmd[@]}" --dir front exec vite \
    --host localhost --port "$frontend_port" --strictPort \
    >"$runtime_dir/frontend.log" 2>&1 &
  frontend_pid=$!
  frontend_pgid="$(record_process_group "$frontend_pid")"

  wait_for_http "frontend" "http://localhost:$frontend_port/login" "$frontend_pid"

  local_login_url="http://localhost:$frontend_port/oauth2/authorization/google?returnTo=%2Fapp"
  printf 'Local Google OAuth stack is running.\n'
  printf 'Backend API: http://127.0.0.1:%s\n' "$backend_port"
  printf 'Backend management: http://127.0.0.1:%s/actuator/health\n' "$management_port"
  printf 'Frontend: http://localhost:%s\n' "$frontend_port"
  printf 'Login URL: %s\n' "$local_login_url"
  printf 'Smoke check: READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=%s READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=%s READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=%s ./scripts/verify-local-google-oauth-stack.sh\n' \
    "$frontend_port" "$backend_port" "$management_port"
  printf 'Runtime logs: %s\n' "$runtime_dir"
  printf 'Press Ctrl+C to stop.\n'

  if [[ "$open_browser" == "true" ]]; then
    open "$local_login_url"
  fi

  while true; do
    if ! kill -0 -- "$backend_pid" >/dev/null 2>&1; then
      fail "backend exited unexpectedly"
    fi
    if ! kill -0 -- "$frontend_pid" >/dev/null 2>&1; then
      fail "frontend exited unexpectedly"
    fi
    sleep 1
  done
}

main
