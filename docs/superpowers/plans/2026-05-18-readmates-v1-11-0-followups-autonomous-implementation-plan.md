# ReadMates v1.11.0 Post-Release Follow-ups — Autonomous Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is the autonomous-execution variant of the original `2026-05-18-readmates-v1-11-0-post-release-followups-implementation-plan.md` — every task has explicit `**Files:**`, `**Resource Key:**`, and `## Acceptance Criteria` blocks. Sub-agents run with full SSH (`~/.ssh/readmates_oci`) and OCI CLI access per the paired spec's §Automation Policy.

**Goal:** Close residual operational and process risks identified after the v1.11.0 release pipeline finished, executed autonomously via `kws-claude-multi-agent-executor`.

**Paired spec:** `docs/superpowers/specs/2026-05-18-readmates-v1-11-0-followups-autonomous-design.md`

**Scope boundary:** Secret rotation (Gemini API key, Gmail App Password) excluded.

**Tech Stack:** Bash deploy scripts, OCI VM (Ubuntu 22.04 ARM64, Docker Compose), Redis 7.4, MySQL 8.4, Spring Boot 4 (Kotlin), React/Vite frontend, GitHub Actions + Branch Protection, Korean-first docs.

---

## File Map (high-level)

- **Verification artifacts (gitignored):** `.tmp/v1.11.0-followups/aigen-residual-keys.txt`, `.tmp/v1.11.0-followups/playwright-e2e-output.log`, `.tmp/v1.11.0-followups/production-smoke-results.json`, `.tmp/v1.11.0-followups/oci-object-head.json`, `.tmp/v1.11.0-followups/oauth-flow-results.json`.
- **Committed deliverables:** `deploy/oci/05-deploy-compose-stack.sh`, `deploy/oci/watch-compose-post-deploy.sh`, `deploy/oci/backup-mysql.timer`, `deploy/oci/backup-mysql.service`, `docs/operations/runbooks/db-backup.md`, `docs/operations/runbooks/deploy-attempts.md`, `docs/development/release-management.md`, `docs/deploy/release-publish-runbook.md`, `docs/development/release-readiness-review.md`, `scripts/pre-push-check.sh`, `scripts/README.md`, `CHANGELOG.md`.

---

## Phase 1: Verification Tasks (no code commits; ledger/audit only)

### Task 1: Verify In-flight AI Generation Job Compatibility With v1.11.0 State Machine

**Files:**
- `.tmp/v1.11.0-followups/aigen-residual-keys.txt` (write — verification artifact)
- `docs/development/release-readiness-review.md` (write — append smoke note row)

**Resource Key:** prod-vm-ssh

**Spec Refs:** P1 AI job 호환성

**Why:** v1.11.0 added `COMMITTING`/`COMMITTED` terminal states and Redis CAS-enforced transitions. Any v1.10.1-era job key still in Redis should be terminal or naturally expire.

**Risk if skipped:** A residual v1.10.1 job key with the old payload shape could refuse to transition (observable 4xx) or be silently overwritten (accounting drift).

- [ ] **Step 1: Snapshot current Redis aigen keys.**
  ```bash
  mkdir -p .tmp/v1.11.0-followups
  ssh -i ~/.ssh/readmates_oci -o StrictHostKeyChecking=accept-new ubuntu@140.245.74.76 \
    'sudo docker exec readmates-redis-1 redis-cli --scan --pattern "aigen:job:*" | head -50' \
    | tee .tmp/v1.11.0-followups/aigen-residual-keys.txt
  ```
  Record the count and earliest TTL.

- [ ] **Step 2: Inspect any residual job payloads.**
  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
    'KEYS=$(sudo docker exec readmates-redis-1 redis-cli --scan --pattern "aigen:job:*"); \
     for k in $KEYS; do \
       echo "=== $k (TTL: $(sudo docker exec readmates-redis-1 redis-cli ttl "$k")s) ==="; \
       sudo docker exec readmates-redis-1 redis-cli get "$k"; \
     done' | tee -a .tmp/v1.11.0-followups/aigen-residual-keys.txt
  ```
  Confirm `status` ∈ `{PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED, COMMITTING, COMMITTED}`.

- [ ] **Step 3: If residual non-terminal keys exist, record TTL and let them expire (Option A).** Do NOT force-DEL unless TTL > 2 hours AND status is `PENDING`/`RUNNING`/`SUCCEEDED`. If forced DEL is required, append a `MANUAL_REDIS_CLEANUP` line to the ledger first.

- [ ] **Step 4: Append `AIGEN_RESIDUAL_VERIFIED` event to deploy-attempts ledger.**
  ```bash
  KEY_COUNT=$(wc -l < .tmp/v1.11.0-followups/aigen-residual-keys.txt | tr -d ' ')
  ACTION="no-op"
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
    "printf '%s\n' '{\"ts\":\"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'\",\"stage\":\"post-release-followup\",\"event\":\"AIGEN_RESIDUAL_VERIFIED\",\"status\":\"SUCCESS\",\"detail\":{\"keys\":${KEY_COUNT},\"action\":\"${ACTION}\"},\"attemptId\":\"20260518T113717Z-1563\"}' | sudo tee -a /var/log/readmates/deploy-attempts.jsonl >/dev/null"
  ```

- [ ] **Step 5: Append a row to release-readiness-review.md.** Under (creating if absent) the `## v1.11.0 post-release smoke` section, add:
  ```markdown
  - Task 1 (Redis aigen residual): <date UTC>, automated. Keys: <N>. Action: <no-op|forced|expired>. Ledger event: AIGEN_RESIDUAL_VERIFIED.
  ```

## Acceptance Criteria

```bash
# Scan returns 0 OR all remaining keys are terminal
ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
  'KEYS=$(sudo docker exec readmates-redis-1 redis-cli --scan --pattern "aigen:job:*"); \
   if [ -z "$KEYS" ]; then exit 0; fi; \
   for k in $KEYS; do \
     STATUS=$(sudo docker exec readmates-redis-1 redis-cli get "$k" | grep -oE "\"status\":\"[A-Z_]+\"" | head -1); \
     case "$STATUS" in *COMMITTED*|*FAILED*|*CANCELLED*) ;; *) echo "non-terminal: $k status=$STATUS"; exit 1 ;; esac; \
   done'
# Ledger has the new event
ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
  'sudo tail -20 /var/log/readmates/deploy-attempts.jsonl | grep -c AIGEN_RESIDUAL_VERIFIED' | grep -qE '^[1-9]'
# Doc updated
grep -q "Task 1 (Redis aigen residual)" docs/development/release-readiness-review.md
```

---

### Task 2: Local Playwright E2E Smoke + Production Host Path

**Files:**
- `.tmp/v1.11.0-followups/playwright-e2e-output.log` (write — verification artifact)
- `.tmp/v1.11.0-followups/production-smoke-results.json` (write — verification artifact)
- `docs/development/release-readiness-review.md` (write — append rows)

**Resource Key:** playwright-browser

**Spec Refs:** P1 Live 검증, Automation Policy §OAuth automation escape hatch

**Why:** CHANGELOG `Verification` notes Playwright E2E and Testcontainers integration were skipped. v1.11.0 ships host session AI commit + OWNER `/admin` workbench + current-session loader migration.

**Risk if skipped:** A first real user could hit an unknown regression with no v1.11.0 baseline confirmation.

- [ ] **Step 1: Run Playwright E2E suite locally against the configured stack.**
  ```bash
  pnpm --dir front test:e2e --grep "@aigen|host session editor|platform-admin" \
    2>&1 | tee .tmp/v1.11.0-followups/playwright-e2e-output.log
  ```
  If the grep produces 0 specs, fall back to `--grep "@aigen|host"` or the full suite. Record the resulting pass/fail count.

- [ ] **Step 2: Attempt production host smoke via Playwright MCP.** Use `mcp__plugin_playwright_playwright__browser_navigate` to open `https://readmates.pages.dev/login`, then `mcp__plugin_playwright_playwright__browser_click` on Google login. **If any of these block-signals appears within 60s — `accounts.google.com/signin/v2/challenge`, `captcha-form`, "이 브라우저를 신뢰할 수 없습니다", or no redirect to `readmates.pages.dev`** — STOP and emit `ESCALATE type=ENV_BLOCKER blocker="Google OAuth automation blocked at <URL>"`. Do NOT retry. The orchestrator will SKIP this step and add a manual TODO.

- [ ] **Step 3: If Step 2 SUCCEEDED (user already authenticated session was reused, or Google passed the challenge):** drive the host workbench:
  1. Navigate to `/host` (or whatever the recommended entry route is).
  2. Open a recent session in the workbench, navigate to `세션 기록 완성` panel.
  3. Skip the file upload step (cannot fabricate user transcripts in automation); instead snapshot the panel state, confirm UPPER_SNAKE payload format in any pending Network requests.
  4. If a PREVIEW item exists, click `다시 생성` once; capture the Network request body using `mcp__plugin_playwright_playwright__browser_network_requests` and confirm `status: "GENERATING"` returns. Capture into `production-smoke-results.json`.

- [ ] **Step 4: Append rows to release-readiness-review.md.** Under `## v1.11.0 post-release smoke`:
  ```markdown
  - Task 2 Step 1 (Local Playwright E2E): <date UTC>, automated. Specs: <N> pass / <M> fail. Log: .tmp/v1.11.0-followups/playwright-e2e-output.log.
  - Task 2 Step 2-3 (Production host smoke): <date UTC>, <automated|MANUAL REQUIRED>. <result summary OR blocker URL>.
  ```
  When Step 2/3 was SKIPPED, also add:
  ```markdown
  - [ ] [MANUAL REQUIRED] Task 2 production host smoke — Google OAuth automation blocked. Owner: kws. Target: within 7 days.
  ```

## Acceptance Criteria

```bash
# E2E log exists and has a clear pass/fail signature
test -s .tmp/v1.11.0-followups/playwright-e2e-output.log
grep -qE '([Pp]assed|[Ff]ailed|[Tt]ests?:)' .tmp/v1.11.0-followups/playwright-e2e-output.log
# Doc has a smoke row for Task 2 Step 1 at minimum
grep -q "Task 2 Step 1 (Local Playwright E2E)" docs/development/release-readiness-review.md
# Step 2-3 is either a smoke row OR a MANUAL REQUIRED TODO
grep -qE "Task 2 Step 2-3 \(Production host smoke\)|MANUAL REQUIRED\] Task 2 production host smoke" docs/development/release-readiness-review.md
```

---

### Task 5: Verify OAuth End-To-End Happy Path

**Files:**
- `.tmp/v1.11.0-followups/oauth-flow-results.json` (write — verification artifact)
- `docs/development/release-readiness-review.md` (write — append row)

**Resource Key:** playwright-browser

**Spec Refs:** P2 OAuth 흐름

**Why:** Frontend smoke confirmed redirect to Google but never executed the full callback → membership-activated path.

**Risk if skipped:** A first real login after v1.11.0 could fail at the callback (state-mismatch, cookie regression) with no v1.11.0 baseline.

- [ ] **Step 1: Attempt OAuth happy-path via Playwright MCP.**
  1. Open a fresh isolated browser context.
  2. Navigate to `https://readmates.pages.dev/login`.
  3. Click the Google login button.
  4. Within 60s: if any block-signal from the spec §Automation Policy hits (challenge page, CAPTCHA, "신뢰할 수 없습니다"), emit `ESCALATE type=ENV_BLOCKER blocker="Google OAuth automation blocked at <URL>"`. Do NOT retry.
  5. If the OAuth completes successfully: capture the post-callback URL, the `/api/bff/api/auth/me` payload (via `mcp__plugin_playwright_playwright__browser_evaluate` issuing fetch), and the session cookies. Write to `.tmp/v1.11.0-followups/oauth-flow-results.json`:
     ```json
     {
       "ts": "<iso8601>",
       "redirectChain": ["/login", "/oauth2/authorization/google", "<google url>", "/login/oauth2/code/google", "<landing route>"],
       "authMe": {"authenticated": true, "approvalState": "ACTIVE", "membershipId": "...", "clubId": "..."},
       "cookies": {"SESSION": {"httpOnly": true, "secure": true, "sameSite": "Lax", "domain": "readmates.pages.dev"}}
     }
     ```
  6. Then click logout, verify `/api/bff/api/auth/me` returns ANONYMOUS, append `"logoutVerified": true` to the JSON.

- [ ] **Step 2: Append a row to release-readiness-review.md.**
  ```markdown
  - Task 5 (OAuth happy path): <date UTC>, <automated|MANUAL REQUIRED>. <result summary>.
  ```
  If SKIPPED:
  ```markdown
  - [ ] [MANUAL REQUIRED] Task 5 OAuth happy-path — automation blocked at <step>. Owner: kws. Target: within 7 days.
  ```

## Acceptance Criteria

```bash
# Either the JSON artifact exists with the expected fields, OR a MANUAL REQUIRED TODO is present.
if [ -s .tmp/v1.11.0-followups/oauth-flow-results.json ]; then
  jq -e '.authMe.authenticated == true and .cookies.SESSION.httpOnly == true and .logoutVerified == true' \
    .tmp/v1.11.0-followups/oauth-flow-results.json
else
  grep -q "MANUAL REQUIRED\] Task 5 OAuth happy-path" docs/development/release-readiness-review.md
fi
grep -qE "Task 5 \(OAuth happy path\)|MANUAL REQUIRED\] Task 5" docs/development/release-readiness-review.md
```

---

## Phase 2: Engineering Tasks (code/script changes)

### Task 4: Fix Deploy Ledger AttemptId Propagation In Post-Deploy Watch

**Files:**
- `deploy/oci/05-deploy-compose-stack.sh` (edit — add env var to watch invocation)
- `deploy/oci/watch-compose-post-deploy.sh` (edit — read parent id first)
- `docs/operations/runbooks/deploy-attempts.md` (edit — document fix)

**Spec Refs:** P2 Ledger attemptId

**Why:** Two ledger lines from the v1.11.0 post-deploy-watch stage carry `"attemptId":"unknown"` instead of the parent attempt id.

**Risk if skipped:** Ledger-based deployment audit and ADR-0016 deploy-ledger schema queries lose fidelity at the post-deploy watch surface.

- [ ] **Step 1: Locate the `unknown` fallback in `watch-compose-post-deploy.sh`.**
  ```bash
  grep -n 'attemptId.*unknown\|ATTEMPT_ID' deploy/oci/watch-compose-post-deploy.sh
  ```
  Identify the line where the default is computed.

- [ ] **Step 2: Confirm `05-deploy-compose-stack.sh` does NOT export `READMATES_DEPLOY_ATTEMPT_ID` for the watch invocation.** Read around the `./deploy/oci/watch-compose-post-deploy.sh` call site (the original notes line ~282; verify in current file).

- [ ] **Step 3: Modify `05-deploy-compose-stack.sh`.** Add `READMATES_DEPLOY_ATTEMPT_ID="$ATTEMPT_ID"` to the env block that invokes the watch script. Preserve quoting style of nearby env exports.

- [ ] **Step 4: Modify `watch-compose-post-deploy.sh`.** Change the attempt-id default to `${READMATES_DEPLOY_ATTEMPT_ID:-${ATTEMPT_ID:-unknown}}` (parent wins, then any local var, then `unknown` as a true last resort).

- [ ] **Step 5: Add a guard test or assertion.** Cheapest path: add a `--dry-run` mode flag to `watch-compose-post-deploy.sh` (or a `WATCH_DRY_RUN=true` env gate) that prints the chosen attempt id and exits 0. Then add a shell test snippet at `deploy/oci/tests/watch-attempt-id.test.sh` that runs the script with and without `READMATES_DEPLOY_ATTEMPT_ID` set and asserts the parent id wins. If a shell test directory does not exist, place an inline `# Manual repro:` block at the top of `watch-compose-post-deploy.sh` instead — do NOT invent a test framework.

- [ ] **Step 6: Update `docs/operations/runbooks/deploy-attempts.md`.** Document that `unknown` should never appear in post-v1.11.1 ledger entries; record the fix commit sha placeholder.

## Acceptance Criteria

```bash
# Env var added to deploy script
grep -q 'READMATES_DEPLOY_ATTEMPT_ID="\$ATTEMPT_ID"' deploy/oci/05-deploy-compose-stack.sh
# Watch script honors parent id
grep -qE 'READMATES_DEPLOY_ATTEMPT_ID:-\$\{ATTEMPT_ID:-unknown\}|READMATES_DEPLOY_ATTEMPT_ID:-unknown' deploy/oci/watch-compose-post-deploy.sh
# Dry-run mode or manual repro comment exists
grep -qE 'WATCH_DRY_RUN|--dry-run|# Manual repro:' deploy/oci/watch-compose-post-deploy.sh
# Runbook documents the fix
grep -q 'attemptId.*unknown' docs/operations/runbooks/deploy-attempts.md
# Shell parses
bash -n deploy/oci/watch-compose-post-deploy.sh
bash -n deploy/oci/05-deploy-compose-stack.sh
```

---

### Task 3: Push v1.11.0 DB Backup To Object Storage + Daily Timer

**Files:**
- `deploy/oci/backup-mysql.service` (create — systemd unit file)
- `deploy/oci/backup-mysql.timer` (create — systemd timer)
- `docs/operations/runbooks/db-backup.md` (create — restore + retention runbook)
- `.tmp/v1.11.0-followups/oci-object-head.json` (write — verification artifact)

**Resource Key:** prod-vm-ssh

**Spec Refs:** P2 Object Storage 백업

**Why:** Pre-v1.11.0 backup (84KB sql.gz) lives only on VM disk. VM disk failure → backup gone.

**Risk if skipped:** Hardware failure within 48h forces a longer rollback chain to v1.8.3 (May 13).

- [ ] **Step 1: Inspect existing backup script and identify bucket/namespace.**
  ```bash
  head -100 deploy/oci/backup-mysql-to-object-storage.sh
  grep -nE '(BUCKET|NAMESPACE|--bucket-name|--namespace-name|OCI_CLI_PROFILE)' deploy/oci/backup-mysql-to-object-storage.sh
  ```
  Capture the bucket name and namespace into local notes.

- [ ] **Step 2: Verify OCI CLI on the VM.**
  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 'which oci && oci --version && ls -la ~/.oci/ 2>&1'
  ```
  If OCI CLI is missing on the VM, this task SHOULD escalate `ESCALATE type=ENV_BLOCKER blocker="OCI CLI not configured on VM"`. Do NOT attempt to bootstrap from scratch in this autonomous run.

- [ ] **Step 3: Run the manual upload of the pre-v1.11.0 backup.**
  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
    'sudo /opt/readmates/deploy/oci/backup-mysql-to-object-storage.sh \
       --file /var/backups/readmates/mysql/readmates-pre-v1.11.0-20260518T113652Z.sql.gz \
       --tag pre-v1.11.0 2>&1'
  ```
  If the actual script interface differs from `--file`/`--tag`, read its `--help` output first and adjust the flags. Capture stdout/stderr.

- [ ] **Step 4: Verify the object exists in the bucket.** Run locally:
  ```bash
  BUCKET="<from Step 1>"
  oci os object list -bn "$BUCKET" --prefix readmates-pre-v1.11.0 --query "data[*].name" --output json \
    > .tmp/v1.11.0-followups/oci-object-head.json
  ```
  Then `oci os object head` to confirm the sha256 metadata matches the VM-side `.sha256` sidecar.

- [ ] **Step 5: Confirm or install a daily timer.**
  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
    'systemctl list-timers | grep -i backup; sudo crontab -l 2>/dev/null | grep -i backup'
  ```
  If nothing recurring exists, create `deploy/oci/backup-mysql.timer` + `deploy/oci/backup-mysql.service` locally with these contents (sub-agent writes these files):
  - `backup-mysql.service`: `[Unit]` Description, `[Service]` Type=oneshot, ExecStart=`/opt/readmates/deploy/oci/backup-mysql-to-object-storage.sh --daily`, User=root.
  - `backup-mysql.timer`: `[Timer]` OnCalendar=*-*-* 04:15:00 UTC, Persistent=true, `[Install]` WantedBy=timers.target.
  Then copy via `scp` to `/etc/systemd/system/` on the VM, `systemctl daemon-reload && systemctl enable --now backup-mysql.timer`.

  **If the daily backup script lacks a `--daily` mode**, adjust the `ExecStart` to call the script with no args and let the script's default behavior run. Do not modify the backup script itself in this task — that's out of scope.

- [ ] **Step 6: Create `docs/operations/runbooks/db-backup.md`.** Korean-first per repo docs guide. Cover: retention window (30 daily / 6 weekly / 1 monthly), bucket placeholder, manual upload command, restore procedure (`oci os object get` + `gunzip` + `mysql --execute`), interaction between daily timer and pre-release manual backups.

## Acceptance Criteria

```bash
# Object listed in bucket
test -s .tmp/v1.11.0-followups/oci-object-head.json
jq -e '.[] | select(. == "readmates-pre-v1.11.0-20260518T113652Z.sql.gz" or contains("readmates-pre-v1.11.0"))' \
  .tmp/v1.11.0-followups/oci-object-head.json
# Systemd timer files exist locally (committed to repo)
test -f deploy/oci/backup-mysql.timer && test -f deploy/oci/backup-mysql.service
# Timer enabled on VM
ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
  'systemctl is-enabled backup-mysql.timer 2>/dev/null' | grep -qE '^enabled$'
# Runbook exists with the required headings
test -f docs/operations/runbooks/db-backup.md
grep -qE '복구|restore|보관|retention' docs/operations/runbooks/db-backup.md
grep -qE 'oci os object get' docs/operations/runbooks/db-backup.md
```

---

### Task 6: Tighten Release Process — Branch Protection And Unreleased Section

**Files:**
- `docs/development/release-management.md` (edit — add bypass policy subsection)
- `docs/deploy/release-publish-runbook.md` (edit — cross-link)
- `scripts/pre-push-check.sh` (edit — add CHANGELOG guard)
- `scripts/README.md` (edit — document new check)
- `CHANGELOG.md` (verify — Unreleased placeholder)

**Spec Refs:** P3 Release process

**Why:** v1.11.0 used admin bypass to push 57 commits. Policy is undocumented; CHANGELOG `## Unreleased` survives only via manual discipline.

**Risk if skipped:** Process drift; future contributor follows bypass pattern; stale Unreleased content lands on a tag.

- [ ] **Step 1: Add "Branch protection bypass policy" subsection to `docs/development/release-management.md`.** Three conditions per the spec:
  - 허용: solo admin + `./scripts/pre-push-check.sh` 통과 + no DB migration + no auth/permission-touching change.
  - 비허용 → release PR: multi-contributor commits OR DB migration OR auth/permission/RLS change OR public API contract change.
  - Emergency bypass: requires ledger entry with reason.

- [ ] **Step 2: Add cross-link from `docs/deploy/release-publish-runbook.md`.** From the `Tag 발행` (or equivalent) section, add: "Branch protection bypass 정책은 [release-management.md#branch-protection-bypass-policy](...)를 참조."

- [ ] **Step 3: Add the CHANGELOG safety check to `scripts/pre-push-check.sh`.**
  - Detect tag push via env var: `READMATES_PRE_PUSH_RELEASE=true` or `--release` flag in `$@`. Do NOT attempt to auto-detect from git stdin (false positives).
  - When the release flag is set: extract the `## Unreleased` section from `CHANGELOG.md` (between `## Unreleased` and the next `## ` header).
  - Fail if the section contains any `### ` category headers (`### Highlights`, `### Added`, `### Changed`, `### Fixed`, `### Engineering`, etc.) or any non-blank/non-comment line beyond a single placeholder.
  - Acceptable placeholder: a single line like `_No unreleased changes._` or `<!-- placeholder -->`.
  - Print actionable message on fail: `CHANGELOG Unreleased section is not empty. Move content into the version section before tagging.`
  - Honor `--no-changelog-check` to bypass.

- [ ] **Step 4: Document the new check in `scripts/README.md`.** Cover the flags (`--release`, `--no-changelog-check`) and the env var.

- [ ] **Step 5: Run a self-test of the new guard.**
  ```bash
  # With clean Unreleased (current state), guard should pass
  READMATES_PRE_PUSH_RELEASE=true ./scripts/pre-push-check.sh --release 2>&1 | tail -20
  # Stage a fake stale Unreleased block in a temp file, point the script at it via env override IF supported,
  # OR manually verify by inserting "### Added\n- fake" into a copy of CHANGELOG.md and running the script there.
  # Do NOT modify the real CHANGELOG.md for this self-test.
  ```
  Record outcome in commit message.

- [ ] **Step 6: Verify `CHANGELOG.md`'s `## Unreleased` is currently a placeholder (do NOT edit unless it isn't).**

## Acceptance Criteria

```bash
# Policy subsection in release-management
grep -qE '(Branch protection bypass policy|## Branch protection bypass|## 브랜치 보호 우회)' docs/development/release-management.md
# Cross-link in runbook
grep -q 'release-management.md' docs/deploy/release-publish-runbook.md
# Pre-push script has the new guard
grep -qE 'Unreleased|UNRELEASED' scripts/pre-push-check.sh
grep -qE '(--release|READMATES_PRE_PUSH_RELEASE)' scripts/pre-push-check.sh
grep -qE '(--no-changelog-check)' scripts/pre-push-check.sh
# Script remains syntactically valid
bash -n scripts/pre-push-check.sh
# scripts/README documents the new flags
grep -qE '(--release|--no-changelog-check|CHANGELOG)' scripts/README.md
```

---

## Final Verification And Review

When all six tasks are processed (COMPLETE or SKIPPED):

- [ ] All committed deliverables on the worktree branch with one or more `feat:`/`fix:`/`docs:`/`chore:` commits.
- [ ] `docs/development/release-readiness-review.md` updated with a `## v1.11.0 post-release smoke` section that includes one row per verification task. SKIPPED Google-OAuth-dependent tasks are listed as `- [ ] [MANUAL REQUIRED] ...` items.
- [ ] CHANGELOG.md is NOT touched by sub-agents in this run (Task 6 only verifies it; no entry added because tag work is human-gated).
- [ ] Plan back-reference: cross-link this plan from `docs/development/release-readiness-review.md` under the smoke section.

### Out Of Scope

- Secret rotation, AI generation feature additions, frontend visual regression infra, integration test automation expansion.
- Modifying `backup-mysql-to-object-storage.sh` beyond what's required to make the timer work.
- Backfilling pre-v1.11.0 ledger rows with the corrected `attemptId`.
- Creating any git tag or pushing to remote.
