#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
stack_script_source="$repo_root/scripts/run-local-google-oauth-stack.sh"
verify_script="$repo_root/scripts/verify-local-google-oauth-stack.sh"
fixture_root="$(mktemp -d -t readmates-google-oauth-stack-fixture-XXXXXX)"
listener_pid=""

cleanup() {
  if [[ -n "$listener_pid" ]]; then
    kill "$listener_pid" >/dev/null 2>&1 || true
  fi
  [[ -d "$fixture_root" ]] && rm -rf -- "$fixture_root"
}
trap cleanup EXIT

mkdir -p "$fixture_root/bin" "$fixture_root/scripts" "$fixture_root/server" "$fixture_root/front" "$fixture_root/state"
cp "$stack_script_source" "$fixture_root/scripts/run-local-google-oauth-stack.sh"
chmod +x "$fixture_root/scripts/run-local-google-oauth-stack.sh"
cp "$repo_root/scripts/run-local-google-oauth.sh" "$fixture_root/scripts/run-local-google-oauth.sh"
chmod +x "$fixture_root/scripts/run-local-google-oauth.sh"
cp "$repo_root/scripts/check-local-google-oauth-redirect.py" "$fixture_root/scripts/check-local-google-oauth-redirect.py"
cp "$verify_script" "$fixture_root/scripts/verify-local-google-oauth-stack.sh"
chmod +x "$fixture_root/scripts/verify-local-google-oauth-stack.sh"
stack_script_source="$fixture_root/scripts/run-local-google-oauth-stack.sh"

cat > "$fixture_root/bin/security" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

case "$*" in
  *readmates.local.google-oauth.client-id*)
    printf '%s' "${MOCK_GOOGLE_CLIENT_ID:-123456789-fixture.apps.googleusercontent.com}"
    ;;
  *readmates.local.google-oauth.client-secret*)
    printf '%s' "${MOCK_GOOGLE_CLIENT_SECRET:-fixture-client-secret}"
    ;;
  *)
    printf 'unexpected Keychain lookup\n' >&2
    exit 64
    ;;
esac
SCRIPT
chmod +x "$fixture_root/bin/security"

cat > "$fixture_root/bin/open" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
state_dir="${READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_STATE_DIR:-.}"
printf '%s\n' "$*" >> "$state_dir/open.invocations"
SCRIPT
chmod +x "$fixture_root/bin/open"

cat > "$fixture_root/bin/mock-backend-server.py" <<'PY'
#!/usr/bin/env python3

import argparse
import os
import signal
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def write_marker(state_dir: str, name: str) -> None:
    os.makedirs(state_dir, exist_ok=True)
    with open(os.path.join(state_dir, name), "w", encoding="utf-8") as stream:
        stream.write("1")


class BackendHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/actuator/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"{}")
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args, **_kwargs) -> None:
        return


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--management-port", type=int, required=True)
    parser.add_argument("--startup-delay", type=int, default=0)
    parser.add_argument("--state-dir", required=True)
    args = parser.parse_args()

    write_marker(args.state_dir, "backend.started")
    with open(os.path.join(args.state_dir, "backend.pid"), "w", encoding="utf-8") as stream:
        stream.write(str(os.getpid()))

    if args.startup_delay > 0:
        time.sleep(args.startup_delay)

    server = ThreadingHTTPServer(("127.0.0.1", args.management_port), BackendHandler)
    write_marker(args.state_dir, "backend.ready")

    def handle_signal(_signo, _frame):
        write_marker(args.state_dir, "backend.terminated")
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
PY
chmod +x "$fixture_root/bin/mock-backend-server.py"

cat > "$fixture_root/bin/mock-frontend-server.py" <<'PY'
#!/usr/bin/env python3

import argparse
import os
import signal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode, parse_qs, urlsplit


def write_marker(state_dir: str, name: str) -> None:
    os.makedirs(state_dir, exist_ok=True)
    with open(os.path.join(state_dir, name), "w", encoding="utf-8") as stream:
        stream.write("1")


class FrontendHandler(BaseHTTPRequestHandler):
    client_id: str = ""
    frontend_port: int = 5174
    state_dir: str = "."

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/login"):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"<html>mock frontend login</html>")
            return

        if self.path.startswith("/oauth2/authorization/google"):
            query = parse_qs(urlsplit(self.path).query)
            params = {
                "response_type": "code",
                "client_id": self.client_id,
                "redirect_uri": f"http://localhost:{self.frontend_port}/login/oauth2/code/google",
                "scope": "openid email profile",
                "state": "fixture-state",
            }

            if query.get("chooseAccount", [""])[0] == "true":
                params["prompt"] = "select_account"

            location = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
            self.send_response(302)
            self.send_header("Location", location)
            self.end_headers()
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, *_args, **_kwargs) -> None:
        return


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frontend-port", type=int, required=True)
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--state-dir", required=True)
    args = parser.parse_args()

    write_marker(args.state_dir, "frontend.started")
    with open(os.path.join(args.state_dir, "frontend.pid"), "w", encoding="utf-8") as stream:
        stream.write(str(os.getpid()))

    FrontendHandler.client_id = args.client_id
    FrontendHandler.frontend_port = args.frontend_port
    FrontendHandler.state_dir = args.state_dir

    server = ThreadingHTTPServer(("127.0.0.1", args.frontend_port), FrontendHandler)
    write_marker(args.state_dir, "frontend.ready")

    def handle_signal(_signo, _frame):
        write_marker(args.state_dir, "frontend.terminated")
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
PY
chmod +x "$fixture_root/bin/mock-frontend-server.py"

cat > "$fixture_root/server/gradlew" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

state_dir="${READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_STATE_DIR:-.}"
management_port="${READMATES_MANAGEMENT_PORT:-28081}"
delay_seconds="${READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_BACKEND_DELAY_SECONDS:-0}"
mode="${READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_BACKEND_MODE:-normal}"

if [[ "$mode" == "fail-immediately" ]]; then
  printf 'fixture backend failure\n' >&2
  exit 2
fi

exec python3 "$PWD/bin/mock-backend-server.py" \
  --management-port "$management_port" \
  --startup-delay "$delay_seconds" \
  --state-dir "$state_dir"
SCRIPT
chmod +x "$fixture_root/server/gradlew"

cat > "$fixture_root/bin/corepack" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "pnpm" ]]; then
  printf 'fixture corepack requires an explicit pnpm command\n' >&2
  exit 64
fi
shift

if [[ "$1" == "--dir" ]]; then
  shift 2
fi

if [[ "$1" == "exec" && "$2" == "vite" ]]; then
  shift 2
fi

frontend_port="5174"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      frontend_port="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

state_dir="${READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_STATE_DIR:-.}"
mode="${READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_FRONTEND_MODE:-normal}"
client_id="${READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_CLIENT_ID:-123456789-fixture.apps.googleusercontent.com}"

if [[ "$mode" == "exit-early" ]]; then
  touch "$state_dir/frontend.ready" "$state_dir/frontend.terminated"
  exit 0
fi

exec python3 "$PWD/bin/mock-frontend-server.py" \
  --frontend-port "$frontend_port" \
  --client-id "$client_id" \
  --state-dir "$state_dir"
SCRIPT
chmod +x "$fixture_root/bin/corepack"

fail() {
  printf 'local Google OAuth stack fixture error: %s\n' "$1" >&2
  exit 1
}

assert_file_exists() {
  local path="$1"
  [[ -f "$path" ]] || fail "expected file to exist: $path"
}

assert_file_not_exists() {
  local path="$1"
  [[ ! -e "$path" ]] || fail "expected file to not exist: $path"
}

assert_contains() {
  local file="$1"
  local expected="$2"

  if ! grep -Fq "$expected" "$file"; then
    fail "expected output in $file to contain: $expected"
  fi
}

assert_not_contains() {
  local file="$1"
  local unexpected="$2"

  if grep -Fq "$unexpected" "$file"; then
    fail "unexpected output in $file: $unexpected"
  fi
}

pick_free_port() {
  python3 - <<'PY'
import socket

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
  sock.bind(("127.0.0.1", 0))
  print(sock.getsockname()[1])
PY
}

run_stack_case() {
  local case_name="$1"
  local stack_path="$2"
  shift 2
  local -a env_assignments=("${@}")
  local output_file="$fixture_root/$case_name.out"
  local state_dir="${fixture_root}/state/$case_name"

  mkdir -p "$state_dir"
  : >"$output_file"

  if [[ ! -x "$stack_path" ]]; then
    printf 'expected executable local Google OAuth stack runner: %s\n' "$stack_path" > "$output_file"
    return 1
  fi

  if (
    cd "$fixture_root" && \
    env \
      "PATH=$fixture_root/bin:$PATH" \
      "READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_STATE_DIR=$state_dir" \
      "${env_assignments[@]}" \
      "$stack_path" >"$output_file" 2>&1
  ); then
    return 0
  fi
  return 1
}

run_stack_case_interrupt() {
  local case_name="$1"
  local stack_path="$2"
  shift 2
  local -a env_assignments=("${@}")
  local output_file="$fixture_root/$case_name.out"
  local state_dir="${fixture_root}/state/$case_name"

  mkdir -p "$state_dir"
  : >"$output_file"

  if [[ ! -x "$stack_path" ]]; then
    printf 'expected executable local Google OAuth stack runner: %s\n' "$stack_path" > "$output_file"
    return 1
  fi

  local stack_pid=""
  (
    cd "$fixture_root" && \
    env \
      "PATH=$fixture_root/bin:$PATH" \
      "READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_STATE_DIR=$state_dir" \
      "${env_assignments[@]}" \
      "$stack_path" >"$output_file" 2>&1
  ) &
  stack_pid=$!
  sleep 1
  kill -INT "$stack_pid" >/dev/null 2>&1 || true

  for _ in 1 2 3 4 5; do
    if ! kill -0 "$stack_pid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  kill -TERM "$stack_pid" >/dev/null 2>&1 || true
  for _ in 1 2 3 4; do
    if ! kill -0 "$stack_pid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  kill -KILL "$stack_pid" >/dev/null 2>&1 || true
  wait "$stack_pid" 2>/dev/null || true
}

run_stack_case_with_verifier() {
  local case_name="$1"
  local stack_path="$2"
  shift 2
  local -a env_assignments=("${@}")
  local output_file="$fixture_root/$case_name.out"
  local verify_output_file="$fixture_root/$case_name.verify.out"
  local state_dir="${fixture_root}/state/$case_name"
  local stack_pid=""

  mkdir -p "$state_dir"
  : >"$output_file"
  : >"$verify_output_file"

  (
    cd "$fixture_root" && \
    env \
      "PATH=$fixture_root/bin:$PATH" \
      "READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_STATE_DIR=$state_dir" \
      "${env_assignments[@]}" \
      "$stack_path" >"$output_file" 2>&1
  ) &
  stack_pid=$!

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [[ -f "$state_dir/frontend.ready" ]] && break
    kill -0 "$stack_pid" >/dev/null 2>&1 || break
    sleep 1
  done

  if [[ -f "$state_dir/frontend.ready" ]]; then
    (
      cd "$fixture_root" && \
      env \
        "PATH=$fixture_root/bin:$PATH" \
        "READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_STATE_DIR=$state_dir" \
        "${env_assignments[@]}" \
        "$fixture_root/scripts/verify-local-google-oauth-stack.sh" >"$verify_output_file" 2>&1
    ) || true
  fi

  kill -INT "$stack_pid" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5; do
    if ! kill -0 "$stack_pid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  kill -TERM "$stack_pid" >/dev/null 2>&1 || true
  wait "$stack_pid" 2>/dev/null || true
}

expect_fail_case() {
  local case_name="$1"
  shift
  if run_stack_case "$case_name" "$stack_script_source" "$@"; then
    fail "$case_name should fail"
  fi
}

expect_fail_custom_stack() {
  local case_name="$1"
  local missing_path="$2"
  shift 2
  if run_stack_case "$case_name" "$missing_path" "$@"; then
    fail "$case_name should fail"
  fi
}

expect_interrupt_case() {
  local case_name="$1"
  shift
  run_stack_case_interrupt "$case_name" "$stack_script_source" "$@"
}

ports_duplicate_port="$(pick_free_port)"
frontend_port_in_use_backend_port="$(pick_free_port)"
frontend_port_in_use_management_port="$(pick_free_port)"
backend_timeout_backend_port="$(pick_free_port)"
backend_timeout_management_port="$(pick_free_port)"
backend_timeout_frontend_port="$(pick_free_port)"
frontend_exit_backend_port="$(pick_free_port)"
frontend_exit_management_port="$(pick_free_port)"
frontend_exit_frontend_port="$(pick_free_port)"
corepack_contract_backend_port="$(pick_free_port)"
corepack_contract_management_port="$(pick_free_port)"
corepack_contract_frontend_port="$(pick_free_port)"
verifier_health_backend_port="$(pick_free_port)"
verifier_health_management_port="$(pick_free_port)"
verifier_health_frontend_port="$(pick_free_port)"
no_open_default_backend_port="$(pick_free_port)"
no_open_default_management_port="$(pick_free_port)"
no_open_default_frontend_port="$(pick_free_port)"
open_true_backend_port="$(pick_free_port)"
open_true_management_port="$(pick_free_port)"
open_true_frontend_port="$(pick_free_port)"
child_output_redaction_backend_port="$(pick_free_port)"
child_output_redaction_management_port="$(pick_free_port)"
child_output_redaction_frontend_port="$(pick_free_port)"
term_cleanup_backend_port="$(pick_free_port)"
term_cleanup_management_port="$(pick_free_port)"
term_cleanup_frontend_port="$(pick_free_port)"

if [[ ! -x "$fixture_root/scripts/run-local-google-oauth-stack.sh" ]]; then
  fail "expected fixture stack runner executable"
fi

expect_fail_custom_stack "missing_stack" "$fixture_root/scripts/missing-stack.sh"
assert_contains "$fixture_root/missing_stack.out" "expected executable local Google OAuth stack runner"

expect_fail_case "port_invalid" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=70000"
assert_contains "$fixture_root/port_invalid.out" "frontend port must be an integer from 1024 to 65535"

expect_fail_case "ports_duplicate" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=$ports_duplicate_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=$ports_duplicate_port"
assert_contains "$fixture_root/ports_duplicate.out" "frontend, backend, and management ports must be distinct"

expect_fail_case "timeout_invalid" "READMATES_LOCAL_GOOGLE_OAUTH_STARTUP_TIMEOUT_SECONDS=0"
assert_contains "$fixture_root/timeout_invalid.out" "startup timeout must be an integer from 1 to 600"

expect_fail_case "open_boolean_invalid" "READMATES_LOCAL_GOOGLE_OAUTH_OPEN_BROWSER=TRUE"
assert_contains "$fixture_root/open_boolean_invalid.out" "open-browser flag must be exactly true or false"

(
  cd "$fixture_root"
  python3 -m http.server 5234 >/dev/null 2>&1
) &
listener_pid=$!
sleep 1
expect_fail_case "frontend_port_in_use" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=5234" \
  "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=$frontend_port_in_use_backend_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=$frontend_port_in_use_management_port"
assert_contains "$fixture_root/frontend_port_in_use.out" "required port is already in use: READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=5234"
kill "$listener_pid" >/dev/null 2>&1 || true
wait "$listener_pid" 2>/dev/null || true
listener_pid=""

expect_fail_case "backend_timeout" \
  "READMATES_LOCAL_GOOGLE_OAUTH_STARTUP_TIMEOUT_SECONDS=1" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_BACKEND_DELAY_SECONDS=5" \
  "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=$backend_timeout_backend_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=$backend_timeout_management_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=$backend_timeout_frontend_port"
assert_contains "$fixture_root/backend_timeout.out" "backend did not become ready"
assert_file_exists "$fixture_root/state/backend_timeout/backend.started"

expect_fail_case "frontend_exit" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_FRONTEND_MODE=exit-early" \
  "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=$frontend_exit_backend_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=$frontend_exit_management_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=$frontend_exit_frontend_port"
assert_contains "$fixture_root/frontend_exit.out" "frontend process exited before readiness"

expect_interrupt_case "corepack_pnpm_contract" \
  "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=$corepack_contract_backend_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=$corepack_contract_management_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=$corepack_contract_frontend_port"
assert_file_exists "$fixture_root/state/corepack_pnpm_contract/frontend.started"
assert_contains "$fixture_root/corepack_pnpm_contract.out" "Open in browser: http://localhost:$corepack_contract_frontend_port"
assert_contains "$fixture_root/corepack_pnpm_contract.out" "Backend API: http://127.0.0.1:$corepack_contract_backend_port"
assert_contains "$fixture_root/corepack_pnpm_contract.out" "Backend health: http://127.0.0.1:$corepack_contract_management_port/actuator/health"
assert_contains "$fixture_root/corepack_pnpm_contract.out" "Google OAuth login: http://localhost:$corepack_contract_frontend_port/oauth2/authorization/google?returnTo=%2Fapp"

run_stack_case_with_verifier "verifier_management_health" "$stack_script_source" \
  "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=$verifier_health_backend_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=$verifier_health_management_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=$verifier_health_frontend_port"
assert_contains "$fixture_root/verifier_management_health.verify.out" "local Google OAuth stack smoke checks passed."

expect_interrupt_case "no_open_default" \
  "READMATES_LOCAL_GOOGLE_OAUTH_OPEN_BROWSER=false" \
  "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=$no_open_default_backend_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=$no_open_default_management_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=$no_open_default_frontend_port"
assert_file_not_exists "$fixture_root/state/no_open_default/open.invocations"

expect_interrupt_case "open_true" \
  "READMATES_LOCAL_GOOGLE_OAUTH_OPEN_BROWSER=true" \
  "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=$open_true_backend_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=$open_true_management_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=$open_true_frontend_port"
assert_file_exists "$fixture_root/state/open_true/open.invocations"
assert_contains "$fixture_root/state/open_true/open.invocations" "http://localhost:$open_true_frontend_port/oauth2/authorization/google?returnTo=%2Fapp"

expect_interrupt_case "child_output_redaction" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_CLIENT_ID=123456789-fixture.apps.googleusercontent.com" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FIXTURE_CLIENT_SECRET=fixture-redacted-secret" \
  "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=$child_output_redaction_backend_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=$child_output_redaction_management_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=$child_output_redaction_frontend_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_OPEN_BROWSER=false"
assert_not_contains "$fixture_root/child_output_redaction.out" "123456789-fixture.apps.googleusercontent.com"
assert_not_contains "$fixture_root/child_output_redaction.out" "fixture-redacted-secret"

expect_interrupt_case "term_cleanup" \
  "READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT=$term_cleanup_backend_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT=$term_cleanup_management_port" \
  "READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT=$term_cleanup_frontend_port"
assert_file_exists "$fixture_root/state/term_cleanup/backend.started"
assert_file_exists "$fixture_root/state/term_cleanup/frontend.started"

printf 'local Google OAuth stack fixture checks passed\n'
