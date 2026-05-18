# ReadMates v1.11.0 Post-Release Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development for independent tasks) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close residual operational and process risks identified after the v1.11.0 release pipeline finished. None of these are immediate production blockers, but each one widens future deployment confidence, recoverability, or audit trail.

**Scope boundary:** Secret rotation (Gemini API key, Gmail App Password) is intentionally excluded — those need user-side credential console access and are tracked separately.

**Architecture:** Verification tasks read existing source-of-truth state (Redis, OCI VM, MySQL backup directory, GitHub Actions ledger). Engineering tasks change existing scripts/code while preserving the deploy-attempts ledger schema and current backend transaction boundary policy. Process tasks update documentation, not runtime behavior.

**Tech Stack:** Bash deploy scripts, OCI VM (Ubuntu 22.04 ARM64, Docker Compose), Redis 7.4, MySQL 8.4, Spring Boot 4 (Kotlin), React/Vite frontend, GitHub Actions + Branch Protection, Korean-first docs.

---

## Source Documents

- **Design spec**: `docs/superpowers/specs/2026-05-18-readmates-v1-11-0-post-release-followups-design.md` — invariants, findings, decisions, verification matrix
- Release notes: `CHANGELOG.md` § v1.11.0 - 2026-05-18
- Release management: `docs/development/release-management.md`
- Release publish runbook: `docs/deploy/release-publish-runbook.md`
- Deploy attempts ledger schema: `docs/operations/runbooks/deploy-attempts.md`
- Post-deploy watch: `docs/operations/runbooks/post-deploy-watch.md`
- AI generation state machine spec: `docs/superpowers/specs/2026-05-18-readmates-aigen-job-commit-state-machine-design.md`
- Docs writing rules: `docs/agents/docs.md`

## File Map

### Verification Tasks (read-only against production)

- Inspect: Redis `aigen:job:*` keys on VM (Redis container in compose stack)
- Inspect: Production OAuth flow via real browser session
- Inspect: Host workbench AI generation → preview → commit happy path
- Output: Single audit note appended to release evidence

### Object Storage Backup Automation

- Read: `deploy/oci/backup-mysql-to-object-storage.sh`
- Read: `deploy/oci/compose.yml`, `compose.infra.yml`
- Read: `/etc/systemd/system/readmates-stack.service` (on VM, read-only)
- Modify: `deploy/oci/backup-mysql-to-object-storage.sh` — only if cron wiring or env propagation gaps surface
- Add: `deploy/oci/backup-mysql.timer` + `deploy/oci/backup-mysql.service` (systemd timer pair, if not already present)
- Document: `docs/operations/runbooks/db-backup.md` (new) or update an existing backup-related runbook

### Deploy Ledger AttemptId Propagation

- Read: `deploy/oci/05-deploy-compose-stack.sh` (writes `attemptId` to env)
- Read: `deploy/oci/watch-compose-post-deploy.sh` (consumes — currently logs `attemptId: "unknown"`)
- Modify: `deploy/oci/watch-compose-post-deploy.sh` — accept and forward `READMATES_DEPLOY_ATTEMPT_ID`
- Modify: `deploy/oci/05-deploy-compose-stack.sh` — pass `READMATES_DEPLOY_ATTEMPT_ID="$ATTEMPT_ID"` into the watch invocation env block
- Test/Verify: One controlled re-run of post-deploy-watch (or next real deploy) emits the parent attemptId on every ledger line

### Branch Protection And Release Process Documentation

- Read: `docs/development/release-management.md`, `docs/deploy/release-publish-runbook.md`
- Modify: `docs/development/release-management.md` — note when admin bypass is acceptable vs when PR review is required
- Document: lightweight "release PR" pattern for non-solo or non-trivial multi-commit batches

### CHANGELOG Hygiene

- Modify: `CHANGELOG.md` — ensure `## Unreleased` placeholder line discourages accidental release of stale content
- (Optional) Add: pre-push hook check that fails when a tag is being pushed but `## Unreleased` still contains category headers with non-placeholder content

---

## Task 1: Verify In-flight AI Generation Job Compatibility With v1.11.0 State Machine

**Why:** v1.11.0 added `COMMITTING`/`COMMITTED` terminal states and Redis CAS-enforced transitions (`AiGenerationJobTransitionPolicy`). Any job key written by v1.10.1 in `PENDING`/`RUNNING`/`SUCCEEDED` before the 11:38 UTC redeploy still lives in Redis until its TTL expires (default ~1h). The new code should treat them safely, but the worker completion / regenerate / commit CAS edges were never exercised against pre-existing v1.10.1 schema payloads in a controlled environment.

**Risk if skipped:** A residual v1.10.1 job key with the old payload shape could either (a) refuse to transition (best case — observable 4xx with typed error), or (b) be silently overwritten by a parallel new job under the same id (worst case — accounting drift). Probability is very low because there were no active hosts at deploy time, but the verification is cheap.

- [ ] **Step 1: Snapshot current Redis aigen keys.**
  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
    'sudo docker exec readmates-redis-1 redis-cli --scan --pattern "aigen:job:*" | head -50' \
    | tee /Users/kws/source/web/ReadMates/.tmp/v1.11.0-aigen-residual-keys.txt
  ```
  Record the count and earliest TTL.

- [ ] **Step 2: Inspect any residual job payloads.**
  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
    'for k in $(sudo docker exec readmates-redis-1 redis-cli --scan --pattern "aigen:job:*"); do
       echo "=== $k (TTL: $(sudo docker exec readmates-redis-1 redis-cli ttl "$k")s) ==="
       sudo docker exec readmates-redis-1 redis-cli get "$k"
     done'
  ```
  Confirm `status` field is one of the v1.11.0-allowed values (`PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `COMMITTING`, `COMMITTED`).

- [ ] **Step 3: If residual keys exist, drive the worker to a terminal state.**
  Option A (let TTL expire): record the latest TTL, schedule a 24h watch in `docs/operations/runbooks/post-deploy-watch.md` to recheck.
  Option B (force-cancel): for any key still in `PENDING`/`RUNNING`/`SUCCEEDED` after 1h, call the cancel endpoint with a host session that owns it, or directly `DEL` the key in Redis (last resort — record in deploy-attempts ledger as `MANUAL_REDIS_CLEANUP`).

- [ ] **Step 4: Append a one-line audit note to the v1.11.0 deploy-attempts ledger.**
  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
    'printf "%s\n" "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"stage\":\"post-release-followup\",\"event\":\"AIGEN_RESIDUAL_VERIFIED\",\"status\":\"SUCCESS\",\"detail\":{\"keys\":N,\"action\":\"<no-op|forced|expired>\"},\"attemptId\":\"20260518T113717Z-1563\"}" | sudo tee -a /var/log/readmates/deploy-attempts.jsonl >/dev/null'
  ```

- [ ] **Step 5: Final check — exit criterion.**
  Scan returns zero `aigen:job:*` keys, OR every remaining key has `status ∈ {COMMITTED, FAILED, CANCELLED}` (terminal under v1.11.0). Audit line above written.

## Task 2: Manual Backend Integration + E2E Spot Check

**Why:** CHANGELOG `Verification` notes both Testcontainers integration tests and Playwright E2E were skipped (justified by no contract changes, but not proven for the v1.11.0 specific paths). The two end-to-end paths that exercise newly merged code are: (a) host session editor → AI 생성 → preview → commit, and (b) OWNER login → `/admin` platform-admin workbench.

**Risk if skipped:** Unit tests confirmed transitions and mutations work in isolation. Live, browser-driven flows are what the next real user will hit.

- [ ] **Step 1: Run Playwright E2E suite locally against production-like local stack.**
  ```bash
  pnpm --dir front test:e2e --grep "@aigen|host session editor|platform-admin"
  ```
  If the full suite is too slow, restrict to the AI generation suite and platform-admin suite.

- [ ] **Step 2: Manual host smoke against production frontend (Cloudflare Pages + OCI backend).**
  Use the user's own host account, NOT a test account:
  1. Visit `https://readmates.pages.dev/login`, log in via Google.
  2. Open the host workbench → an open session → `세션 기록 완성` panel.
  3. Upload a small transcript (≤200KB), wait through `GENERATING → PREVIEW`.
  4. Hit `다시 생성` on one item — verify modal sends UPPER_SNAKE payload (DevTools Network tab) and PREVIEW updates.
  5. Hit `commit` — verify the panel shows `COMMITTED` and the editor refresh callback fires (feedback document section reflects the committed payload).
  6. (Optional) Cancel a fresh job mid-`GENERATING` to confirm IDLE return and draft clearance.

- [ ] **Step 3: Manual OWNER admin smoke.**
  1. Confirm own user has `PlatformAdmin` role (or temporarily grant via support-access path).
  2. Visit `https://readmates.pages.dev/admin`.
  3. Verify onboarding queue renders, lifecycle-prioritized order is correct, Support access grant panel is visible for OWNER.
  4. Trigger one no-op operation (e.g., open a club detail → close) and confirm the workbench query cache invalidation behaves as expected (no full page refresh).

- [ ] **Step 4: Record outcome in `docs/development/release-readiness-review.md`.**
  Add a line under a `## v1.11.0 post-release smoke` heading: date, who ran the smoke, observed status for each of (AI gen full flow, regenerate, cancel, platform-admin workbench). Flag any deviation with link to issue.

- [ ] **Step 5: Exit criterion.**
  Both manual flows complete without unexpected errors, OR any defects are filed as separate issues with reproduction steps. No silent failures allowed in the smoke note.

## Task 3: Push v1.11.0 DB Backup To Object Storage

**Why:** The pre-v1.11.0 backup at `/var/backups/readmates/mysql/readmates-pre-v1.11.0-20260518T113652Z.sql.gz` (84KB, sha256 sidecar present) currently lives only on VM disk. If the VM disk fails, the backup is gone — defeating the rollback safety the runbook requires.

**Risk if skipped:** VM hardware failure within the 48h window when this backup is the freshest authoritative snapshot would force a longer rollback chain (v1.8.3 May 13).

- [ ] **Step 1: Inspect `deploy/oci/backup-mysql-to-object-storage.sh` to confirm OCI Object Storage target.**
  ```bash
  head -80 /Users/kws/source/web/ReadMates/deploy/oci/backup-mysql-to-object-storage.sh
  ```
  Note the bucket name, namespace, and any required env vars (e.g., OCI CLI config path).

- [ ] **Step 2: Verify OCI CLI is configured on VM (or set up if missing).**
  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 'which oci && oci --version && ls -la ~/.oci/'
  ```
  If not present, follow the bootstrap section of the backup script (or the dedicated runbook if one exists).

- [ ] **Step 3: Upload the existing pre-v1.11.0 backup manually.**
  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
    'sudo /opt/readmates/deploy/oci/backup-mysql-to-object-storage.sh \
       --file /var/backups/readmates/mysql/readmates-pre-v1.11.0-20260518T113652Z.sql.gz \
       --tag pre-v1.11.0'
  ```
  Adjust flags to match the script's actual interface.

- [ ] **Step 4: Verify object exists in the bucket and integrity sidecar matches.**
  ```bash
  oci os object list -bn <bucket> --prefix readmates-pre-v1.11.0 --query "data[*].name" --output table
  oci os object head -bn <bucket> --name <key> --query 'opc-meta-sha256 // headers."opc-meta-sha256"'
  ```
  Compare with local `.sha256` sidecar contents.

- [ ] **Step 5: Confirm (or schedule) recurring cron / systemd timer for daily backup upload.**
  ```bash
  ssh -i ~/.ssh/readmates_oci ubuntu@140.245.74.76 \
    'systemctl list-timers | grep -i backup; sudo crontab -l 2>/dev/null | grep -i backup'
  ```
  If nothing recurring exists, drop a `deploy/oci/backup-mysql.timer` + `deploy/oci/backup-mysql.service` pair calling the script daily at off-peak (e.g., 04:15 UTC). Owner: `root`. Logs to journald.

- [ ] **Step 6: Document the policy.**
  Either update an existing runbook or add `docs/operations/runbooks/db-backup.md` covering: retention window, bucket name placeholder, manual upload command, restore procedure, and how the daily timer interacts with pre-release manual backups.

- [ ] **Step 7: Exit criterion.**
  The pre-v1.11.0 sql.gz is verifiable in the bucket, AND a recurring upload mechanism is either confirmed running or newly enabled. Runbook reflects current behavior.

## Task 4: Fix Deploy Ledger AttemptId Propagation In Post-Deploy Watch

**Why:** During the v1.11.0 deploy, two ledger lines around the post-deploy-watch stage were recorded with `"attemptId":"unknown"` instead of the parent attempt id `20260518T113717Z-1563`. Correlation by timestamp still works manually, but any automated ledger query (`jq 'select(.attemptId == "<id>")'`) will miss those rows.

**Risk if skipped:** Ledger-based deployment audit and the planned ADR-0016 deploy-ledger event-schema queries lose fidelity at the most critical observation point (post-deploy watch — where regressions surface).

- [ ] **Step 1: Locate the source of `unknown`.**
  ```bash
  grep -n 'attemptId.*unknown\|ATTEMPT_ID' /Users/kws/source/web/ReadMates/deploy/oci/watch-compose-post-deploy.sh
  ```
  Identify the fallback default for `ATTEMPT_ID`.

- [ ] **Step 2: Confirm `05-deploy-compose-stack.sh` does not currently export `READMATES_DEPLOY_ATTEMPT_ID`** into the watch invocation. Read lines around `./deploy/oci/watch-compose-post-deploy.sh` invocation (around line 282).

- [ ] **Step 3: Modify `05-deploy-compose-stack.sh`** — add `READMATES_DEPLOY_ATTEMPT_ID="$ATTEMPT_ID"` to the env block that invokes the watch script.

- [ ] **Step 4: Modify `watch-compose-post-deploy.sh`** — at the top, change the attempt-id default to read from `READMATES_DEPLOY_ATTEMPT_ID` first, falling back to a freshly generated id only when truly unparented.

- [ ] **Step 5: Add a focused test (or shellcheck assertion) that the watch script honors the parent id when set.**
  Cheapest: a dry-run mode flag + a unit-test bash snippet. Acceptable: a comment block with a manual repro command.

- [ ] **Step 6: Verify via the next real deploy (or a forced re-run of watch against the current running stack)** that all ledger lines emitted by watch carry the same `attemptId` as the parent deploy.

- [ ] **Step 7: Update `docs/operations/runbooks/deploy-attempts.md`** — document that `unknown` should never appear in post-v1.11.1 ledger entries and that historical rows from before the fix may need a sed/jq backfill if downstream analysis depends on it.

- [ ] **Step 8: Exit criterion.**
  Subsequent deploy ledger has zero `attemptId == "unknown"` rows under the post-deploy-watch stage. The fix lands in a `v1.11.1` patch (or `v1.12.0` if bundled with feature work).

## Task 5: Verify OAuth End-To-End Happy Path

**Why:** Frontend smoke confirmed the OAuth `redirect_uri` is correct (302 to `accounts.google.com` with `redirect_uri=https://readmates.pages.dev/login/oauth2/code/google`), but the full Google → callback → membership-activated route was not exercised. v1.11.0 includes `current-session` and `host` query migrations that change how the post-login route hydrates — a regression would only surface on real login.

**Risk if skipped:** A first real login after v1.11.0 could fail at the callback (state-mismatch, cookie-domain regression, BFF secret rotation issue) and the user would have no way to confirm it was v1.11.0 vs an unrelated infra hiccup without going through this verification first.

- [ ] **Step 1: Clear cookies for `readmates.pages.dev` in a clean browser profile.**
  Use a private/incognito window so any stale session cookie is gone.

- [ ] **Step 2: Hit `/login`, click Google login, complete the OAuth challenge.**
  Capture (in DevTools Network) the redirect chain: `/oauth2/authorization/google` → Google → `/login/oauth2/code/google` → eventual app route. Each hop should be 302 → 200/302 with no JSON error body.

- [ ] **Step 3: Confirm the eventual landing route matches the user's `recommendedAppEntryUrl`** as returned by `/api/bff/api/auth/me` post-login. For an active host, expect `/host` or the scoped `/app/<club-slug>` route.

- [ ] **Step 4: Inspect the post-login `auth/me` payload.**
  Verify `authenticated=true`, `approvalState=ACTIVE`, `membershipId`, `clubId` populated. Compare with v1.10.1 expectation (no schema change in this release, but worth confirming because of the current-session loader migration).

- [ ] **Step 5: Inspect cookies after login.**
  - `SESSION` (BFF session cookie) — `HttpOnly`, `Secure`, `SameSite=Lax`, domain scoped to `readmates.pages.dev`, no leak to subdomains.
  - No BFF secret value or OAuth token visible in cookies or local storage.

- [ ] **Step 6: Log out and confirm the logout flow.**
  Returns to login route, `auth/me` returns ANONYMOUS again, no residual session cookie.

- [ ] **Step 7: Record outcome in release-readiness-review.md** alongside Task 2 smoke notes.

- [ ] **Step 8: Exit criterion.**
  Full login + logout cycle completes with no defects. If any step fails, file an issue with reproduction steps and roll back to v1.10.1 image via `READMATES_SERVER_IMAGE='ghcr.io/beyondwin/readmates/readmates-server:v1.10.1' ./deploy/oci/05-deploy-compose-stack.sh`.

## Task 6: Tighten Release Process — Branch Protection And Unreleased Section

**Why:** v1.11.0's 57-commit push to main bypassed branch protection (admin override). For solo operation this is acceptable, but the documentation currently does not call out when bypass is appropriate vs when it isn't, which makes the protection rule itself ambiguous. Separately, the `## Unreleased` placeholder in `CHANGELOG.md` survives only because we manually move content into the version section at release time — a one-character typo at the wrong moment could ship stale Unreleased content as a release.

**Risk if skipped:** Process drift. Either branch protection becomes ceremonial (always bypassed) or a future contributor follows the bypass pattern and lands an unreviewed change with real impact. CHANGELOG hygiene is purely defensive but cheap.

- [ ] **Step 1: Update `docs/development/release-management.md`.**
  Add a subsection "Branch protection bypass policy" under the release procedure section:
  - When solo + admin + all CI gates passed locally via `./scripts/pre-push-check.sh`: bypass acceptable.
  - When multiple commits from multiple contributors are being released: open a "release PR" gathering the diff, get one external review, then merge via the PR (no bypass).
  - When the release includes a DB migration or auth/permission-touching server change: PR review required regardless of contributor count.

- [ ] **Step 2: Update `docs/deploy/release-publish-runbook.md`.**
  Cross-link to the bypass policy from the "Tag 발행" section so the runbook stays aligned.

- [ ] **Step 3: Add a CHANGELOG safety check to `scripts/pre-push-check.sh`.**
  When the push includes a `refs/tags/v*` (detect via `git diff --stat HEAD@{u}..HEAD` or env vars set by git hook), assert that `## Unreleased` in `CHANGELOG.md` contains only the placeholder line and no `### Added/Changed/Fixed/Highlights` content. Fail-fast with an actionable message.
  Don't run this check on non-tag pushes — false positives during normal development would erode trust.

- [ ] **Step 4: Update `scripts/README.md`** to document the new check and its bypass (`--no-changelog-check` or environment opt-out for emergency releases).

- [ ] **Step 5: Manual test.**
  Stage a fake `## Unreleased\n### Added\n- x` block, run `./scripts/pre-push-check.sh --dry-run` (or whatever the dry-run interface is), confirm the new check would fail. Revert.

- [ ] **Step 6: Exit criterion.**
  Policy is documented in both release-management.md and the runbook. The pre-push script either gates the typo case or has a tracked TODO to add it in the v1.11.x window.

---

## Final Verification And Review

When all six tasks are complete:

- [ ] All exit criteria above are met. Tasks 1–5 produce ledger or release-readiness-review entries; Task 6 produces doc commits.
- [ ] Open a single follow-up PR titled `chore: v1.11.0 post-release follow-ups` containing the script + docs changes from Tasks 3, 4, 6. Tasks 1, 2, 5 are verification-only and need no code commit, only an audit-log entry.
- [ ] If the follow-up PR includes the deploy-ledger fix (Task 4), tag a `v1.11.1` patch release before the next feature work, with `Verification` covering the controlled post-deploy-watch re-run.
- [ ] Cross-link this plan from `docs/development/release-readiness-review.md` so future post-release reviews check the same surfaces.

### Out Of Scope

- Secret rotation (Gemini API key, Gmail App Password) — needs user-side credential console access; tracked separately.
- AI generation feature additions beyond the state-machine path that v1.11.0 already shipped.
- Frontend visual regression infrastructure (Storybook + Percy/Chromatic) — out of scope for this follow-up; revisit when design-system test policy is next reviewed.
