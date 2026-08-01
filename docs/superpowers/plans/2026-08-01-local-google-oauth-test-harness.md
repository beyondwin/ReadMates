# Local Google OAuth Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a public-repository-safe, one-command local Google OAuth stack and a redacted smoke command that preserve existing services and keep all real Google credentials in macOS Keychain.

**Architecture:** Keep `scripts/run-local-google-oauth.sh` as the only credential-reading boundary. Add a foreground Bash supervisor that starts isolated Spring and Vite process groups, plus a separate HTTP smoke verifier that sends redirect URLs over stdin to a Python standard-library checker so sensitive query values are never printed or passed as command arguments. Package the helpers in the clean public candidate and document the exact setup, verification, cleanup, and troubleshooting contract.

**Tech Stack:** macOS Bash 3.2-compatible shell, macOS Keychain `security`, Python 3 standard library, `curl`, Kotlin/Spring Boot Gradle wrapper, Vite 8, repository-pinned `pnpm@11.13.1` through Corepack.

## Global Constraints

- Keep actual OAuth client ID, client secret, Google Cloud project identifier, test-user email, authorization code, state, session cookie, and full provider response out of tracked files, repository-local runtime files, command arguments, and terminal output.
- Keep Keychain services exactly `readmates.local.google-oauth.client-id` and `readmates.local.google-oauth.client-secret`.
- Keep default frontend at `http://localhost:5174`, backend API at `http://127.0.0.1:28080`, management at `http://127.0.0.1:28081`, and callback at `http://localhost:5174/login/oauth2/code/google`.
- Support only `READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT`, `READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT`, `READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT`, `READMATES_LOCAL_GOOGLE_OAUTH_STARTUP_TIMEOUT_SECONDS`, and `READMATES_LOCAL_GOOGLE_OAUTH_OPEN_BROWSER` as new public runtime controls.
- Default startup timeout to `180` and browser opening to `false`.
- Validate ports as distinct integers in `1024..65535`, timeout as an integer in `1..600`, and boolean input as exactly `true` or `false`.
- Never stop, reconfigure, or reuse an existing listener. Fail closed before child launch when any selected port is occupied.
- Start backend before frontend, wait for the selected loopback management port's `/actuator/health`, then wait for the selected localhost frontend port's `/login`.
- On exit, signal only process groups whose numeric IDs were created and recorded by the supervisor; never use broad process-name matching, unresolved variables, repository roots, or existing listener PIDs as kill targets.
- Use an operating-system temporary directory outside the repository, suppress child logs from terminal output, and delete runtime logs on every exit path.
- Use only Python standard library and existing repository tooling; add no package dependency.
- Do not change product frontend, BFF, Spring auth, database, migration, deploy, dev-login, or production OAuth behavior.
- Do not automate Google Cloud mutation or live account interaction. Automated smoke ends at validating the generated provider redirect contract.
- Resolve the committed plan baseline with `git log -1 --format=%H -- docs/superpowers/plans/2026-08-01-local-google-oauth-test-harness.md` and use that exact SHA for final scoped diff and public-safety checks.

---

## File Structure

- Create `scripts/run-local-google-oauth-stack.sh`: public foreground supervisor for preflight, isolated process-group startup, readiness, optional browser open, monitoring, and owned cleanup.
- Create `scripts/check-local-google-oauth-redirect.py`: stdin-only redirect validator that prints safe pass/fail messages without echoing provider values.
- Create `scripts/verify-local-google-oauth-stack.sh`: local health and normal/recovery/invalid chooser redirect smoke.
- Create `scripts/verify-local-google-oauth-stack-fixtures.sh`: provider-free fixture harness for supervisor lifecycle, collision, timeout, redirect, and output-redaction behavior.
- Modify `scripts/README.md`: concise command reference and security boundary.
- Modify `docs/development/local-setup.md`: canonical one-time setup, quick start, smoke, manual provider check, shutdown, overrides, and troubleshooting.
- Modify `CHANGELOG.md`: extend the existing Unreleased Google login recovery entry with the one-command local harness.
- Modify `scripts/build-public-release-candidate.sh`: include all new public helpers and their fixture.
- Modify `scripts/verify-public-release-fixtures.sh`: assert the clean candidate contains the new helpers.

---

### Task 1: Build the isolated foreground stack supervisor

**Files:**
- Create: `scripts/run-local-google-oauth-stack.sh`
- Create: `scripts/verify-local-google-oauth-stack-fixtures.sh`
- Reuse unchanged: `scripts/run-local-google-oauth.sh`

**Interfaces:**
- Consumes: executable low-level runner, macOS `security`, `curl`, `python3`, `ps`, root `package.json`, Gradle wrapper, and Corepack or documented Corepack fallback.
- Produces: one foreground stack command, the five exact runtime controls above, safe readiness output, and cleanup limited to recorded backend/frontend process groups.
- Fixture contract: copy the supervisor into an isolated pseudo-repository and replace only that copy's low-level runner and `corepack` binary with synthetic HTTP processes. Never invoke real Keychain, Gradle, Vite, Google, or existing listeners.

- [ ] **Step 1: Capture the implementation baseline and write the failing fixture harness**

Run:

```bash
IMPLEMENTATION_BASE="$(git log -1 --format=%H -- docs/superpowers/plans/2026-08-01-local-google-oauth-test-harness.md)"
printf '%s\n' "$IMPLEMENTATION_BASE"
```

Create the fixture with strict mode, exact-target cleanup, and these helpers:

```bash
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
runner="$repo_root/scripts/run-local-google-oauth-stack.sh"
fixture_root="$(mktemp -d -t readmates-google-oauth-stack-fixture)"

fail() {
  printf 'local Google OAuth stack fixture error: %s\n' "$1" >&2
  exit 1
}

free_port() {
  python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
}
```

The pseudo-repository must contain a copied supervisor; a mock low-level runner that returns the safe dry-run sentence or execs a synthetic Python health server; a mock `corepack` that extracts Vite `--port` and execs the same server; a minimal root package manifest pinned to pnpm 11.13.1; and a Python server that records PID/TERM in fixture-owned markers.

Add exact cases for missing supervisor, occupied frontend port, port `70000`, duplicate ports, timeout `0`, boolean `TRUE`, backend timeout cleanup, frontend early-exit cleanup, supervisor TERM cleanup, child-output redaction, default no-open, and exact-true browser open with only the localhost login URL.

- [ ] **Step 2: Run the fixture and verify RED**

```bash
bash scripts/verify-local-google-oauth-stack-fixtures.sh
```

Expected: FAIL with `expected executable local Google OAuth stack runner` because the supervisor does not exist.

- [ ] **Step 3: Implement strict input and dependency preflight**

Create the supervisor with these exact defaults and validators:

```bash
#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
frontend_port="${READMATES_LOCAL_GOOGLE_OAUTH_FRONTEND_PORT:-5174}"
backend_port="${READMATES_LOCAL_GOOGLE_OAUTH_BACKEND_PORT:-28080}"
management_port="${READMATES_LOCAL_GOOGLE_OAUTH_MANAGEMENT_PORT:-28081}"
startup_timeout="${READMATES_LOCAL_GOOGLE_OAUTH_STARTUP_TIMEOUT_SECONDS:-180}"
open_browser="${READMATES_LOCAL_GOOGLE_OAUTH_OPEN_BROWSER:-false}"

fail() {
  printf 'local Google OAuth stack error: %s\n' "$1" >&2
  exit 1
}

validate_port() {
  local label="$1" value="$2"
  [[ "$value" =~ ^[0-9]+$ ]] || fail "$label must be an integer from 1024 to 65535"
  ((value >= 1024 && value <= 65535)) || fail "$label must be an integer from 1024 to 65535"
}
```

Validate the common timeout with the same numeric pattern and range `1..600`, require distinct ports, and accept only exact `true|false`. Require Darwin, `curl`, `python3`, `ps`, `tr`, `mktemp`, `security`, the existing runner, and Gradle wrapper. Resolve the pinned launcher exactly like `scripts/pre-push-check.sh`:

```bash
if command -v corepack >/dev/null 2>&1; then
  corepack_cmd=(corepack)
elif command -v npx >/dev/null 2>&1; then
  corepack_cmd=(npx --yes corepack@0.35.0)
else
  fail "Corepack is unavailable and the documented npx fallback was not found"
fi
pnpm_cmd=("${corepack_cmd[@]}" pnpm)
```

Use a Python bind probe for every selected port. On conflict print only the numeric port and matching override variable, and exit before Keychain dry-run or child launch.

- [ ] **Step 4: Implement owned process groups, readiness, and cleanup**

Enable monitor mode and validate that every background PID is its new process-group ID:

```bash
set -m

record_process_group() {
  local pid="$1" pgid
  pgid="$(ps -o pgid= -p "$pid" | tr -d '[:space:]')"
  [[ "$pid" =~ ^[0-9]+$ && "$pgid" == "$pid" && "$pgid" -gt 1 ]] \
    || fail "could not isolate a child process group"
  printf '%s' "$pgid"
}

terminate_process_group() {
  local pgid="$1" attempt
  [[ "$pgid" =~ ^[0-9]+$ && "$pgid" -gt 1 ]] || return 0
  kill -TERM -- "-$pgid" >/dev/null 2>&1 || return 0
  for attempt in 1 2 3 4 5; do
    kill -0 -- "-$pgid" >/dev/null 2>&1 || return 0
    sleep 1
  done
  kill -KILL -- "-$pgid" >/dev/null 2>&1 || true
}
```

Create runtime logs with `mktemp -d -t readmates-local-google-oauth`, outside the repository. Install one `EXIT INT TERM` cleanup that clears traps, terminates only recorded frontend then backend groups, removes only that exact directory, and exits with the original status.

Run credential preflight silently:

```bash
READMATES_LOCAL_GOOGLE_OAUTH_DRY_RUN=true \
  "$repo_root/scripts/run-local-google-oauth.sh" >/dev/null
```

Start backend with only non-secret overrides and redirect output to the runtime directory:

```bash
env \
  SERVER_PORT="$backend_port" \
  READMATES_MANAGEMENT_PORT="$management_port" \
  READMATES_APP_BASE_URL="http://localhost:$frontend_port" \
  READMATES_AUTH_BASE_URL="http://localhost:$frontend_port" \
  READMATES_ALLOWED_ORIGINS="http://localhost:$frontend_port" \
  "$repo_root/scripts/run-local-google-oauth.sh" \
  >"$runtime_dir/backend.log" 2>&1 &
backend_pid=$!
backend_pgid="$(record_process_group "$backend_pid")"
```

Implement `wait_for_http(label, url, child_pid)` using `curl -fsS --max-time 2 -o /dev/null`, one-second polling, the shared deadline, and `kill -0`. Errors expose only the safe label and localhost URL, never log contents.

After management health succeeds, start Vite:

```bash
env \
  READMATES_API_BASE_URL="http://127.0.0.1:$backend_port" \
  VITE_ENABLE_GOOGLE_LOGIN=true \
  "${pnpm_cmd[@]}" --dir front exec vite \
  --host localhost --port "$frontend_port" --strictPort \
  >"$runtime_dir/frontend.log" 2>&1 &
frontend_pid=$!
frontend_pgid="$(record_process_group "$frontend_pid")"
```

Wait for `/login`, optionally call `open` only for exact true, print the safe login URL, smoke command, and Ctrl+C instruction, then monitor both PIDs until either exits.

- [ ] **Step 5: Verify GREEN and commit**

```bash
bash -n scripts/run-local-google-oauth-stack.sh
bash -n scripts/verify-local-google-oauth-stack-fixtures.sh
./scripts/verify-local-google-oauth-keychain-fixtures.sh
./scripts/verify-local-google-oauth-stack-fixtures.sh
git diff --check -- scripts/run-local-google-oauth-stack.sh scripts/verify-local-google-oauth-stack-fixtures.sh
```

Inspect the diff for `killall`, `pkill`, broad negative PIDs, child-log printing, provider URL printing, or credential material. Then commit:

```bash
git add scripts/run-local-google-oauth-stack.sh scripts/verify-local-google-oauth-stack-fixtures.sh
git commit -m "feat(dev): add isolated Google OAuth stack runner"
```

---

### Task 2: Add the redacted OAuth redirect smoke

**Files:**
- Create: `scripts/check-local-google-oauth-redirect.py`
- Create: `scripts/verify-local-google-oauth-stack.sh`
- Modify: `scripts/verify-local-google-oauth-stack-fixtures.sh`

**Interfaces:**
- Consumes: a running stack, the same three public port variables, low-level credential dry-run, `curl`, and `python3`.
- Produces: `check-local-google-oauth-redirect.py --expected-callback http://localhost:5174/login/oauth2/code/google --expected-prompt absent|select_account`, reading one provider redirect from stdin; and a smoke that runs health, frontend, normal, recovery, and invalid chooser checks.
- Security boundary: raw redirect exists only in one local shell variable and Python stdin; never print, persist, export, or pass it in argv.

- [ ] **Step 1: Extend the fixture with failing redirect cases**

Add this helper to the fixture:

```bash
run_redirect_check() {
  local redirect_url="$1" expected_prompt="$2"
  printf '%s' "$redirect_url" | python3 "$redirect_checker" \
    --expected-callback "http://localhost:5174/login/oauth2/code/google" \
    --expected-prompt "$expected_prompt"
}
```

Use only `123456789-fixture.apps.googleusercontent.com` and `fixture-state`. Require normal/no-prompt and recovery/select-account to pass. Require wrong host, callback, missing client ID, missing state, wrong prompt, and duplicate prompt to fail with generic field-name errors. Assert no output contains the synthetic ID, state, full URL, or query string.

Add a mock local HTTP server whose OAuth start route returns normal/no-prompt, `chooseAccount=true`/select-account, and `chooseAccount=TRUE`/no-prompt redirects. The full smoke must pass those three cases, and a wrong callback fixture must fail without printing its Location.

- [ ] **Step 2: Run the fixture and verify RED**

```bash
bash scripts/verify-local-google-oauth-stack-fixtures.sh
```

Expected: FAIL because the redirect checker and smoke script do not exist.

- [ ] **Step 3: Implement the stdin-only Python checker**

Create `scripts/check-local-google-oauth-redirect.py` using only `argparse`, `sys`, `typing.NoReturn`, and `urllib.parse`. Implement these interfaces:

```python
def fail(message: str) -> NoReturn:
    print(f"local Google OAuth redirect error: {message}", file=sys.stderr)
    raise SystemExit(1)


def single_query_value(query: dict[str, list[str]], name: str) -> str:
    values = query.get(name, [])
    if len(values) != 1 or not values[0]:
        fail(f"expected exactly one non-empty {name} parameter")
    return values[0]


def validate_redirect(raw_url: str, expected_callback: str, expected_prompt: str) -> None:
    parsed = urlsplit(raw_url.strip())
    if parsed.scheme != "https" or parsed.hostname != "accounts.google.com":
        fail("authorization endpoint host did not match Google")
    query = parse_qs(parsed.query, keep_blank_values=True)
    if single_query_value(query, "redirect_uri") != expected_callback:
        fail("redirect_uri did not match the selected localhost callback")
    client_id = single_query_value(query, "client_id")
    if not client_id.endswith(".apps.googleusercontent.com"):
        fail("client_id was not a Google web client identifier")
    single_query_value(query, "state")
    prompts = query.get("prompt", [])
    if expected_prompt == "absent" and prompts:
        fail("prompt must be absent")
    if expected_prompt == "select_account" and prompts != ["select_account"]:
        fail("prompt must be exactly select_account")
```

Use argparse choices `absent` and `select_account`; reject empty or multi-line stdin; invoke validation; and print only `local Google OAuth redirect contract: PASS`. Never include raw or parsed values in exceptions.

- [ ] **Step 4: Implement the smoke shell**

Create `scripts/verify-local-google-oauth-stack.sh` with strict mode and the same three port defaults/ranges from Task 1:

```bash
frontend_url="http://localhost:$frontend_port"
management_url="http://127.0.0.1:$management_port"
expected_callback="$frontend_url/login/oauth2/code/google"

READMATES_LOCAL_GOOGLE_OAUTH_DRY_RUN=true \
  "$repo_root/scripts/run-local-google-oauth.sh" >/dev/null
curl -fsS --max-time 5 -o /dev/null "$management_url/actuator/health"
curl -fsS --max-time 5 -o /dev/null "$frontend_url/login"
```

Capture redirect without headers or body:

```bash
redirect_url_for() {
  local path="$1"
  curl -sS --max-time 10 -o /dev/null -w '%{redirect_url}' "$frontend_url$path"
}

check_redirect() {
  local path="$1" expected_prompt="$2" redirect_url
  redirect_url="$(redirect_url_for "$path")" || fail "OAuth start request failed"
  [[ -n "$redirect_url" ]] || fail "OAuth start did not return a redirect"
  printf '%s' "$redirect_url" | python3 "$redirect_checker" \
    --expected-callback "$expected_callback" \
    --expected-prompt "$expected_prompt"
  unset redirect_url
}
```

Call exactly:

```text
/oauth2/authorization/google?returnTo=%2Fapp                    -> absent
/oauth2/authorization/google?returnTo=%2Fapp&chooseAccount=true -> select_account
/oauth2/authorization/google?returnTo=%2Fapp&chooseAccount=TRUE -> absent
```

Print safe stage and final PASS lines only. Never enable curl verbose, trace, header, cookie, or response-body output.

- [ ] **Step 5: Verify GREEN, redaction, and commit**

```bash
bash -n scripts/verify-local-google-oauth-stack.sh
python3 -m py_compile scripts/check-local-google-oauth-redirect.py
./scripts/verify-local-google-oauth-keychain-fixtures.sh
./scripts/verify-local-google-oauth-stack-fixtures.sh
fixture_output="$(./scripts/verify-local-google-oauth-stack-fixtures.sh 2>&1)"
printf '%s\n' "$fixture_output" | rg -n "123456789-fixture|fixture-state|accounts\.google\.com/.+client_id" && exit 1 || true
git diff --check -- scripts/check-local-google-oauth-redirect.py scripts/verify-local-google-oauth-stack.sh scripts/verify-local-google-oauth-stack-fixtures.sh
```

Remove only generated `scripts/__pycache__` if present. Commit:

```bash
git add scripts/check-local-google-oauth-redirect.py scripts/verify-local-google-oauth-stack.sh scripts/verify-local-google-oauth-stack-fixtures.sh
git commit -m "test(auth): add redacted local OAuth smoke"
```

---

### Task 3: Publish the public-safe workflow and candidate contract

**Files:**
- Modify: `docs/development/local-setup.md:184-215`
- Modify: `scripts/README.md:17-36`
- Modify: `CHANGELOG.md:7-12`
- Modify: `scripts/build-public-release-candidate.sh:460-485`
- Modify: `scripts/verify-public-release-fixtures.sh:1-140`

**Interfaces:**
- Consumes: Task 1 and Task 2 commands and variables.
- Produces: one canonical active-doc workflow and a clean public candidate containing the low-level runner, supervisor, redirect checker, smoke, and both fixture scripts.

- [ ] **Step 1: Add failing candidate assertions**

After the candidate build in `scripts/verify-public-release-fixtures.sh`, add:

```bash
for relative_path in \
  scripts/run-local-google-oauth.sh \
  scripts/run-local-google-oauth-stack.sh \
  scripts/check-local-google-oauth-redirect.py \
  scripts/verify-local-google-oauth-keychain-fixtures.sh \
  scripts/verify-local-google-oauth-stack.sh \
  scripts/verify-local-google-oauth-stack-fixtures.sh
do
  [[ -f "$candidate_dir/$relative_path" ]] \
    || fail "public release candidate omitted local Google OAuth helper: $relative_path"
done
```

- [ ] **Step 2: Run the fixture and verify RED**

```bash
./scripts/verify-public-release-fixtures.sh
```

Expected: FAIL because the candidate builder omits local OAuth helpers.

- [ ] **Step 3: Include the complete helper set**

Add these explicit copies beside the script manifest in `scripts/build-public-release-candidate.sh`:

```bash
copy_optional_file "scripts/run-local-google-oauth.sh"
copy_optional_file "scripts/run-local-google-oauth-stack.sh"
copy_optional_file "scripts/check-local-google-oauth-redirect.py"
copy_optional_file "scripts/verify-local-google-oauth-keychain-fixtures.sh"
copy_optional_file "scripts/verify-local-google-oauth-stack.sh"
copy_optional_file "scripts/verify-local-google-oauth-stack-fixtures.sh"
```

Do not broaden directory copying or include runtime logs, Keychain data, `.env`, `.tmp`, browser output, test results, or `docs/superpowers`.

- [ ] **Step 4: Update the active local setup**

Document both public callbacks, marking `5174` as the one-command stack and `5173` as the optional manual frontend flow:

```text
http://localhost:5174/login/oauth2/code/google
http://localhost:5173/login/oauth2/code/google
```

Keep the interactive Keychain commands. Make the repeated workflow:

```bash
./scripts/run-local-google-oauth-stack.sh
```

and in another terminal:

```bash
./scripts/verify-local-google-oauth-stack.sh
```

State that smoke validates local health and provider redirect fields but does not complete Google login. Add a manual checklist for Google screen entry, test-user completion, ReadMates session return, recovery account chooser, and Ctrl+C cleanup. List all five override variables.

Add a troubleshooting table covering Keychain missing, `invalid_client`, `redirect_uri_mismatch`, port conflict, and readiness timeout. Safe actions are: re-enter Keychain values interactively; verify the current localhost-only pair without printing it; register the exact callback; stop only a developer-owned listener or choose unused distinct ports; and run the low-level runner separately without publishing logs.

- [ ] **Step 5: Update script reference and CHANGELOG**

In `scripts/README.md`, document that the supervisor owns only its process groups, deletes OS-temp logs, and uses defaults `5174/28080/28081`; document that smoke does not print the provider URL or complete login.

Extend the existing Unreleased `Google 로그인 복구` bullet with one sentence stating that the isolated stack and redacted smoke make localhost testing repeatable without storing credential or stopping existing services. Do not add another Unreleased bullet.

- [ ] **Step 6: Verify GREEN and commit**

```bash
bash -n scripts/build-public-release-candidate.sh
bash -n scripts/verify-public-release-fixtures.sh
./scripts/verify-local-google-oauth-keychain-fixtures.sh
./scripts/verify-local-google-oauth-stack-fixtures.sh
./scripts/verify-public-release-fixtures.sh
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check -- CHANGELOG.md docs/development/local-setup.md scripts/README.md scripts/build-public-release-candidate.sh scripts/verify-public-release-fixtures.sh
```

Scan changed files for real email, OAuth identifiers/secrets, Google project identifiers, token/private-key shapes, full provider URLs, and local absolute paths. Only localhost and clearly synthetic fixture values may remain. Commit:

```bash
git add CHANGELOG.md docs/development/local-setup.md scripts/README.md scripts/build-public-release-candidate.sh scripts/verify-public-release-fixtures.sh
git commit -m "docs(dev): publish local Google OAuth workflow"
```

---

### Task 4: Verify the real isolated runtime without disturbing existing services

**Files:**
- Verify only; modify Task 1-3 files only for a concrete defect.

**Interfaces:**
- Consumes: Keychain credential outside Git, current listeners, supervisor, and smoke verifier.
- Produces: fresh evidence for collision safety, isolated startup, redirect contract, owned cleanup, existing-service preservation, and public safety.

- [ ] **Step 1: Snapshot listeners and select the lane**

Probe ports `5173`, `5174`, `8080`, `18080`, `18081`, `28080`, and `28081` using the corresponding concrete command such as `lsof -nP -iTCP:5174 -sTCP:LISTEN` and safe HTTP health. Record only port/status/PID locally.

If defaults are occupied, verify the supervisor fails without changing any captured PID. Then select three unused override ports for supervisor/smoke verification. Do not stop the listener. An unregistered alternate frontend port can prove generated redirect contracts but cannot complete a live Google callback.

- [ ] **Step 2: Verify credential preflight without values**

```bash
READMATES_LOCAL_GOOGLE_OAUTH_DRY_RUN=true ./scripts/run-local-google-oauth.sh
```

Expected: the existing safe readiness sentence and no credential value.

- [ ] **Step 3: Start and smoke the stack**

Use defaults when free:

```bash
./scripts/run-local-google-oauth-stack.sh
```

Otherwise pass three read-only-discovered free numeric ports through the three documented override variables. In a second terminal, run `./scripts/verify-local-google-oauth-stack.sh` with the same overrides. Expected: credential preflight, management health, frontend login, normal/no-prompt, recovery/select-account, invalid chooser ignored, and final PASS.

- [ ] **Step 4: Perform bounded manual provider verification**

Only when `localhost:5174` is the active registered stack, open `/login` and verify Google screen entry, test-user completion, ReadMates session return, and recovery account chooser. Do not record account, provider URL, callback query, cookie, screenshot, or browser storage.

If only an alternate unregistered port is available, explicitly mark callback completion skipped and do not change Google Cloud merely for this test.

- [ ] **Step 5: Stop only the new stack and prove preservation**

Send Ctrl+C to the supervisor. Verify its three selected ports close and every listener/PID captured in Step 1 remains unchanged and healthy. Do not remove shared caches or containers.

- [ ] **Step 6: Run final repository gates**

```bash
bash -n scripts/run-local-google-oauth.sh
bash -n scripts/run-local-google-oauth-stack.sh
bash -n scripts/verify-local-google-oauth-keychain-fixtures.sh
bash -n scripts/verify-local-google-oauth-stack.sh
bash -n scripts/verify-local-google-oauth-stack-fixtures.sh
python3 -m py_compile scripts/check-local-google-oauth-redirect.py
./scripts/verify-local-google-oauth-keychain-fixtures.sh
./scripts/verify-local-google-oauth-stack-fixtures.sh
./scripts/verify-public-release-fixtures.sh
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check "$IMPLEMENTATION_BASE"..HEAD
git status --short --branch --untracked-files=all
```

Remove only generated `scripts/__pycache__` if present. Scan `git diff "$IMPLEMENTATION_BASE"..HEAD` and the clean candidate for real email, OAuth credential/client identifier, Google project identifier, token/private-key shapes, absolute local paths, provider redirects, and session/callback data.

Frontend lint/test/build, Spring CI/integration, and Playwright E2E are not required if the final diff stays limited to developer scripts, docs, CHANGELOG, and public-candidate manifest/fixtures. If any product frontend/BFF/server file changes, add the matching complete gate from `AGENTS.md` before completion.

- [ ] **Step 7: Review final diff and commit only concrete fixes**

```bash
git diff --stat "$IMPLEMENTATION_BASE"..HEAD
git log --oneline "$IMPLEMENTATION_BASE"..HEAD
git status --short --branch --untracked-files=all
```

Expected: three cohesive implementation commits after the plan commit and a clean tree. If runtime finds a defect, fix only its owning file, rerun focused and final gates, and create one `fix(dev): harden local Google OAuth harness` commit. Do not create an empty verification commit.
