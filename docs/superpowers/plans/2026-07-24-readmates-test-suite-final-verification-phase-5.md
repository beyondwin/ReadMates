# ReadMates Test Suite Final Verification Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile all 510 baseline test paths and every Phase 2–4 change, prove selected R01–R10 guards through reversible defect injection, run the complete official suite on one candidate HEAD, and publish a source-grounded final effectiveness and residual-risk report.

**Architecture:** Phase 5 makes no independent cleanup decisions. It consumes the three committed decision ledgers and reports, constructs a complete baseline-to-final inventory, runs one controlled production mutation at a time with mandatory failing and restored-green evidence, then executes all frontend, server, browser, visual, design, script, config, public-release, and release-readiness gates. Completion is fail-closed: every mutation must be restored, every executable official lane must pass, and every remaining external risk must be explicitly classified.

**Tech Stack:** Git, Bash/zsh, ripgrep, jq, Node.js 24.18.0, pnpm 11.13.1 through Corepack 0.35.0, Vitest 4.1.10, Playwright 1.61.1, JDK 25, Gradle 9.6.1, JUnit 5, MySQL/Flyway, Redis, Kafka, Docker/Testcontainers, ShellCheck, Prometheus, Tempo, JaCoCo.

**Review Status:** `APPROVED_FOR_EXECUTION` after the committed Phase 4 report; completion still requires an independent same-candidate implementation review.

## Global Constraints

- Do not add new cleanup candidates in Phase 5. Any changed/deleted/moved candidate must be authorized by the Phase 2, 3, or 4 decision ledger.
- Do not change product behavior, API contracts, migrations, thresholds, retries, timeouts, workers, shards, forks, caches, heap defaults, Docker image pins, screenshot tolerance, or performance settings.
- Defect injection is temporary and sequential. Exactly one production mutation may exist at a time; it is never committed.
- A mutation is successful only when the intended focused test fails for the intended assertion, the patch is fully reversed, the worktree returns to the pre-mutation diff, and the same test then passes.
- Never use real secrets, providers, member data, private domains, deployment identifiers, production databases, or destructive migrations.
- Keep frontend thresholds at `80/79/80/75` and server JaCoCo minimum at `0.23`.
- Do not mark a lane PASS from Phase 1–4 evidence after the candidate HEAD changes. Phase 5 final gates run fresh on the final candidate.
- `UNVERIFIED_ENV` is allowed only for a genuinely external dependency that cannot be prepared locally. It remains an open residual risk and prevents a claim that the affected risk is closed.
- Do not merge, push, open a PR, tag, publish, or deploy in this plan.

---

## Scope And Dependency Check

This is plan 5 of 5. It starts only after committed Phase 2, Phase 3, and Phase 4 reports.

```text
Task 1 reconcile 510 paths and changed tests
  -> Task 2 controlled mutation evidence
  -> Task 3 three-run flake and performance comparison
  -> Task 4 complete official gates
  -> Task 5 release-readiness and public-safety review
  -> Task 6 final report and handoff
```

## File Structure Map

| Path | Responsibility |
| --- | --- |
| `docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv` | One final row for every Phase 1 baseline path plus explicit rows for new paths |
| `docs/superpowers/reports/2026-07-24-test-suite-mutation-evidence.tsv` | Mutation, expected detector, fail/restore/pass result, and log digest |
| `docs/superpowers/reports/2026-07-24-test-suite-effectiveness-final-report.md` | Before/after inventory, coverage, runtime, risk closure, and residual risk |
| `docs/superpowers/reports/2026-07-24-test-suite-release-readiness-review.md` | Whole-branch release/public-safety review |
| `.tmp/test-suite-phase-5/` | Ignored raw lists, logs, timings, mutation patches, and digests |

Production files named in Task 2 are temporary mutation targets only and must have no final diff.

## Final Decision Interface

```text
baseline_path	final_path	baseline_lane	final_lane	flags	final_decision	failure_mode	evidence	owner_phase
```

- `baseline_path`: one of the 510 Phase 1 paths, or `-` for a newly added test.
- `final_path`: surviving repo-relative path, or `-` only for an authorized deletion.
- `final_decision`: `retain`, `strengthen`, `consolidate`, `delete`, `move-layer`, `split`, or `added`.
- `evidence`: focused command/report reference, not a local absolute path.
- `owner_phase`: `phase-1`, `phase-2`, `phase-3`, or `phase-4`.

## Mutation Evidence Interface

```text
risk_id	mutation_target	mutation	expected_detector	fail_result	restore_result	green_result	log_sha256
```

Every R01–R10 row is either a completed mutation or an explicit `not-injected` row with a concrete safety reason and the alternative evidence. R03/R04 and R08 may share one mutation only when the detector asserts both boundaries.

---

### Task 1: Reconcile The Full Baseline And Final Test Topology

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv`
- Generate, do not commit: `.tmp/test-suite-phase-5/final-test-files.txt`

**Interfaces:**
- Consumes: the Phase 1 inventory and all Phase 2–4 decision ledgers/reports.
- Produces: complete path-level accountability before mutation or final gates.

- [ ] **Step 1: Verify all prerequisite reports and a clean candidate**

Run:

```bash
git status --short --branch
test -s docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-decisions.tsv
test -s docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-report.md
test -s docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-decisions.tsv
test -s docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-report.md
test -s docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-decisions.tsv
test -s docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-report.md
```

Expected: clean worktree and all six committed inputs present.

- [ ] **Step 2: Collect the final runner-native file set**

Run:

```bash
mkdir -p .tmp/test-suite-phase-5
phase5_node_bin="$(brew --prefix node@24)/bin"

PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest list \
  --filesOnly --staticParse --project node --json=../.tmp/test-suite-phase-5/front-node.json
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest list \
  --filesOnly --staticParse --project jsdom --json=../.tmp/test-suite-phase-5/front-jsdom.json
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec playwright test \
  --list --reporter=json > .tmp/test-suite-phase-5/front-e2e.json
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec playwright test \
  --config=playwright-ct.config.ts --list --reporter=json > .tmp/test-suite-phase-5/front-ct.json
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm \
  --filter @readmates/design-system exec vitest list \
  --filesOnly --staticParse --json=../../.tmp/test-suite-phase-5/design-system.json
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm \
  --filter @readmates/design-system-docs exec vitest list \
  --filesOnly --staticParse --json=../../.tmp/test-suite-phase-5/design-docs.json

{
  jq -r --arg root "$PWD/" '.[] | .file | ltrimstr($root)' .tmp/test-suite-phase-5/front-node.json
  jq -r --arg root "$PWD/" '.[] | .file | ltrimstr($root)' .tmp/test-suite-phase-5/front-jsdom.json
  jq -r --arg root "$PWD/" '[.. | objects | .file? // empty] | unique[] | ltrimstr($root)' .tmp/test-suite-phase-5/front-e2e.json
  jq -r --arg root "$PWD/" '[.. | objects | .file? // empty] | unique[] | ltrimstr($root)' .tmp/test-suite-phase-5/front-ct.json
  jq -r --arg root "$PWD/" '.[] | .file | ltrimstr($root)' .tmp/test-suite-phase-5/design-system.json
  jq -r --arg root "$PWD/" '.[] | .file | ltrimstr($root)' .tmp/test-suite-phase-5/design-docs.json
  rg --files server/src/test -g '*Test.kt' -g '*Tests.kt'
} | sort -u > .tmp/test-suite-phase-5/final-test-files.txt
```

Expected: every listed path exists and no path is absolute.

- [ ] **Step 3: Build and validate the final decision ledger**

Merge the three decision ledgers onto all 510 Phase 1 rows. Untouched non-candidates receive `retain` only after confirming they still exist in the final runner set and are covered by the owning lane/risk evidence. Add `baseline_path=-` rows for new tests. A deleted baseline path must cite its authorizing decision and surviving final path.

Run:

```bash
test "$(awk -F '\t' 'NR>1 && $1 != "-" {count++} END {print count+0}' docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv)" -eq 510
test "$(awk -F '\t' 'NR>1 && $1 != "-" {print $1}' docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv | sort -u | wc -l | tr -d ' ')" -eq 510
if comm -23 \
  <(tail -n +2 docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv | cut -f1 | sort) \
  <(awk -F '\t' 'NR>1 && $1 != "-" {print $1}' docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv | sort) \
  | grep -q .; then
  exit 1
fi
git diff --check -- docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv
```

Expected: all 510 baseline paths appear exactly once; every new/deleted/moved path is explicit.

- [ ] **Step 4: Commit the reconciliation**

Run:

```bash
git add docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv
git commit -m "docs: reconcile final test suite decisions"
```

---

### Task 2: Run Controlled Defect Injection

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-mutation-evidence.tsv`
- Temporarily modify and fully restore:
  - `front/functions/_shared/proxy.ts`
  - `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt`
  - `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt`
  - `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
  - `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt`
  - `server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt`
  - `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapter.kt`
  - `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt`
  - `front/shared/observability/frontend-observability-client.ts`

**Interfaces:**
- Consumes: strengthened risk tests from Phases 2–4.
- Produces: failing detector evidence for selected R01–R10 branches and a clean restored tree.

- [ ] **Step 1: Establish the mutation harness contract**

Before each mutation:

```bash
git status --porcelain=v1
git diff --quiet
```

Expected: no output and exit 0. For each step set `phase5_mutation_id` and `phase5_mutation_target` to that step's risk ID and target path, apply the exact diff, then seal it with:

```bash
git diff -- "$phase5_mutation_target" \
  > ".tmp/test-suite-phase-5/${phase5_mutation_id}.patch"
test -s ".tmp/test-suite-phase-5/${phase5_mutation_id}.patch"
```

Run the detector expecting non-zero, record the failing log digest, then restore and prove a clean target:

```bash
git apply -R ".tmp/test-suite-phase-5/${phase5_mutation_id}.patch"
git diff --quiet -- "$phase5_mutation_target"
```

Rerun the same detector expecting zero.

- [ ] **Step 2: Inject R01 response-header leakage**

Temporarily remove this line from `copyUpstreamHeaders`:

```diff
-  copiedHeaders.delete("x-readmates-bff-secret");
```

Set:

```bash
phase5_mutation_id=R01
phase5_mutation_target=front/functions/_shared/proxy.ts
```

Detector:

```bash
phase5_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  tests/unit/cloudflare-bff.test.ts tests/unit/cloudflare-oauth-proxy.test.ts
```

Expected mutated result: FAIL on internal response-header stripping. Restore and expect PASS.

- [ ] **Step 3: Inject R02 signature bypass**

Temporarily replace the signature mismatch condition:

```diff
-        if (!MessageDigest.isEqual(expectedSignature.toByteArray(Charsets.UTF_8), parts[2].toByteArray(Charsets.UTF_8))) {
+        if (false) {
```

Set:

```bash
phase5_mutation_id=R02
phase5_mutation_target=server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt
```

Detector:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.auth.infrastructure.security.OAuthReturnStateTest
```

Expected mutated result: FAIL on tampered signature. Restore and expect PASS.

- [ ] **Step 4: Inject R03 trusted-context confusion**

Temporarily resolve a supplied slug through the host resolver:

```diff
-            context = resolveClubContextUseCase.resolveBySlug(slug),
+            context = resolveClubContextUseCase.resolveByHost(slug),
```

Set:

```bash
phase5_mutation_id=R03
phase5_mutation_target=server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt
```

Detector:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.auth.api.AuthenticatedMemberSecurityTest \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest
```

Expected mutated result: FAIL on slug/resource club isolation. Restore and expect PASS.

- [ ] **Step 5: Inject R04 public visibility leakage**

In one public-session SQL predicate, temporarily replace:

```diff
-and public_session_publications.visibility = 'PUBLIC'
+and public_session_publications.visibility in ('MEMBER', 'PUBLIC')
```

Set:

```bash
phase5_mutation_id=R04
phase5_mutation_target=server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt
```

Detector:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.publication.api.PublicControllerDbTest
```

Expected mutated result: FAIL on member-only/host-only public exclusion. Restore and expect PASS.

- [ ] **Step 6: Inject R05 duplicate lifecycle side effect**

In the `publish` branch, temporarily force its existing side-effect guard:

```diff
-                if (result.changed) {
+                if (true) {
```

Set:

```bash
phase5_mutation_id=R05
phase5_mutation_target=server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt
```

Detector:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.session.application.service.HostSessionServicesTest
```

Expected mutated result: FAIL on no-op/duplicate transition side effects. Restore and expect PASS.

- [ ] **Step 7: Inject R07 incomplete cache invalidation**

Temporarily skip notes invalidation:

```diff
-        val notesEvicted = evictNotesContent(clubId)
+        val notesEvicted = true
```

Set:

```bash
phase5_mutation_id=R07
phase5_mutation_target=server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt
```

Detector:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.shared.adapter.out.redis.RedisReadCacheInvalidationAdapterTest
```

Expected mutated result: FAIL on target notes keys or stale read. Restore and expect PASS.

- [ ] **Step 8: Inject R08 incorrect call-slot reconciliation**

Temporarily force call-slot release in `reconcile`:

```diff
-                    if (command.releaseCallSlot) "1" else "0",
+                    "1",
```

Set:

```bash
phase5_mutation_id=R08
phase5_mutation_target=server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapter.kt
```

Detector:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.aigen.adapter.out.redis.RedisProviderCallReservationAdapterTest
```

Expected mutated result: FAIL on unknown/failure reconciliation or concurrency cap. Restore and expect PASS.

- [ ] **Step 9: Inject R09 immediate outbox reclaim**

Temporarily change:

```diff
-private const val PUBLISHING_LEASE_TIMEOUT_MINUTES = 15
+private const val PUBLISHING_LEASE_TIMEOUT_MINUTES = 0
```

Set:

```bash
phase5_mutation_id=R09
phase5_mutation_target=server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt
```

Detector:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest \
  --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest
```

Expected mutated result: FAIL on fresh-lease preservation or duplicate dispatch. Restore and expect PASS.

- [ ] **Step 10: Inject R10 client sanitization bypass**

Temporarily replace the record-time sanitizer:

```diff
-    const safe = sanitizeFrontendObservabilityBatch([event]).events[0];
+    const safe = event as FrontendObservabilityEvent;
```

Set:

```bash
phase5_mutation_id=R10
phase5_mutation_target=front/shared/observability/frontend-observability-client.ts
```

Detector:

```bash
phase5_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  shared/observability/frontend-observability-contracts.test.ts \
  shared/observability/frontend-observability-client.test.ts
```

Expected mutated result: FAIL on unsafe field, bounded enum/hash, or dropped event. Restore and expect PASS.

- [ ] **Step 11: Record R06 and complete the evidence ledger**

R06 uses the Phase 2 test-only failure seam and old-schema fixture rather than a production mutation that could create a destructive or ambiguous database state. Record it as `not-injected` with the focused rollback/Flyway commands and safety rationale.

Run:

```bash
git diff --quiet
awk -F '\t' '
  NR>1 { seen[$1]=1 }
  END {
    for (i=1; i<=10; i++) {
      if (!seen[sprintf("R%02d", i)]) exit 1
    }
  }
' docs/superpowers/reports/2026-07-24-test-suite-mutation-evidence.tsv
git diff --check -- docs/superpowers/reports/2026-07-24-test-suite-mutation-evidence.tsv
git add docs/superpowers/reports/2026-07-24-test-suite-mutation-evidence.tsv
git commit -m "docs: record test defect injection evidence"
```

Expected: all R01–R10 rows exist and no production diff remains.

---

### Task 3: Compare Flake And Wallclock On Stable Lanes

**Files:**
- Create, do not commit: `.tmp/test-suite-phase-5/timing-*.log`

**Interfaces:**
- Consumes: Phase 1 baselines and Phase 2–4 timing reports.
- Produces: comparable min/median/max and retry evidence.

- [ ] **Step 1: Run major focused lanes three times**

Run without changing environment, workers, retries, timeouts, forks, or cache settings:

```bash
phase5_node_bin="$(brew --prefix node@24)/bin"
for phase5_run in 1 2 3; do
  PATH="$phase5_node_bin:$PATH" /usr/bin/time -p \
    npx --yes corepack@0.35.0 pnpm --dir front test
  /usr/bin/time -p ./scripts/server-ci-check.sh
  PATH="$phase5_node_bin:$PATH" /usr/bin/time -p \
    npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
  PATH="$phase5_node_bin:$PATH" /usr/bin/time -p \
    npx --yes corepack@0.35.0 pnpm design:check
done
```

Expected: all twelve commands PASS. Record min/median/max, failures, retries, Gradle re-execution, and Docker cold/warm state.

- [ ] **Step 2: Reject regressions**

If a lane's median worsens materially, trace it to an added failure-mode test, fixture change, or infrastructure regression. Keep justified added risk coverage and report its cost; revert performance-only restructuring that worsens the lane or introduces flake.

---

### Task 4: Run The Complete Official Gates On One Candidate

**Files:**
- No committed files.

**Interfaces:**
- Consumes: the final candidate after all restored mutations.
- Produces: same-HEAD acceptance evidence.

- [ ] **Step 1: Verify frontend, design, and contracts**

Run:

```bash
phase5_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front lint
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:coverage
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front build
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures
git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm design:check
```

Expected: PASS; coverage remains above `80/79/80/75`.

- [ ] **Step 2: Verify server and real boundaries**

Run:

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

Expected: PASS; JaCoCo remains at or above `0.23`.

- [ ] **Step 3: Verify browser and visual lanes**

Run:

```bash
phase5_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:e2e
PATH="$phase5_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
```

Expected: PASS without update flags or unexpected retries.

- [ ] **Step 4: Verify scripts, configs, and public release independently**

Run:

```bash
python3 scripts/check-agent-guidance.py
for phase5_script in scripts/*.sh deploy/oci/*.sh; do bash -n "$phase5_script"; done
shellcheck scripts/*.sh deploy/oci/*.sh
bash scripts/aigen-pii-check.sh
./scripts/validate-prometheus-rules.sh
./scripts/validate-prometheus-config.sh
bash scripts/validate-tempo-config.sh
bash scripts/validate-production-ai-config.sh
bash scripts/verify-production-ai-config-fixtures.sh
./scripts/lint-grafana-dashboards.sh
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: every command exits 0.

- [ ] **Step 5: Seal candidate identity**

Run:

```bash
git status --porcelain=v1
git rev-parse HEAD
git diff --check
git diff --name-only -- server/src/main front/functions front/shared
```

Expected: clean worktree and no uncommitted production mutation.

---

### Task 5: Perform Whole-Branch Release And Safety Review

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-release-readiness-review.md`
- Modify only if required by a real operator/user-visible change: `CHANGELOG.md`

**Interfaces:**
- Consumes: `origin/main..HEAD`, `docs/development/release-readiness-review.md`, and Task 4 evidence.
- Produces: findings-first review beyond test pass/fail.

- [ ] **Step 1: Review the entire branch**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
git diff --name-only origin/main..HEAD
git diff --check origin/main..HEAD
rg -n '^## Unreleased|\(없음\)' CHANGELOG.md
rg -n '[T]ODO|baseline|exception|allowlist|fallback|audit|secret|token|scan|deploy|watch|POLICY_MISMATCH|CHECK_FAILURE|MISSING_EVIDENCE' \
  CHANGELOG.md .github deploy scripts server/src/main/kotlin server/src/test/kotlin
```

Review CHANGELOG/Unreleased, CI/deploy scripts, operator-facing behavior, security-code hygiene, architecture baselines/exceptions, public-release contents, PII/token safety, and residual `UNVERIFIED_ENV`. Tests passing is not sufficient.

- [ ] **Step 2: Write findings in required priority order**

Use:

```text
Blocker
High
Medium
Low
Not an issue
```

Every finding names the file/line, impact, recommended action, and validating or skipped command. If no operator/user-visible behavior or CI command changed, state why `CHANGELOG.md` remains unchanged.

- [ ] **Step 3: Run docs and public-safety scans**

Run:

```bash
git diff --check -- \
  docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv \
  docs/superpowers/reports/2026-07-24-test-suite-mutation-evidence.tsv \
  docs/superpowers/reports/2026-07-24-test-suite-release-readiness-review.md
rg -n '(^|[^A-Za-z0-9_])([o]cid1\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)' \
  docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv \
  docs/superpowers/reports/2026-07-24-test-suite-mutation-evidence.tsv \
  docs/superpowers/reports/2026-07-24-test-suite-release-readiness-review.md
```

Expected: diff check PASS and safety scan returns no match.

- [ ] **Step 4: Commit the review**

Run:

```bash
git add docs/superpowers/reports/2026-07-24-test-suite-release-readiness-review.md CHANGELOG.md
git diff --cached --check
git commit -m "docs: review optimized test suite release risk"
```

If `CHANGELOG.md` did not change, the commit contains only the review.

---

### Task 6: Publish The Final Effectiveness Report

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-effectiveness-final-report.md`

**Interfaces:**
- Consumes: final decisions, mutation evidence, all Phase 2–4 reports, Task 3 timing, Task 4 gates, and Task 5 review.
- Produces: the ready-for-integration audit handoff.

- [ ] **Step 1: Write the final report**

Include:

- starting and final candidate HEAD;
- before/after test file and case counts by all nine Phase 1 lanes;
- every disposition count and exact deleted/consolidated/strengthened/added/moved/split path;
- runner/CI reachability changes;
- R01–R10 final evidence and mutation results;
- frontend and server coverage before/after;
- major lane wallclock before/after and three-run min/median/max;
- flake/retry observations;
- environment repairs;
- full command table with `PASS`, `FAIL`, and `UNVERIFIED_ENV`;
- release-readiness findings;
- remaining technical, environment, operational, billing, PII, security, lifecycle, and public-release risks;
- explicit confirmation that thresholds, retries, timeouts, workers, shards, forks, caches, and performance settings did not regress;
- `integration=not_observed`;
- no merge, push, PR, tag, publish, or deployment.

- [ ] **Step 2: Validate all final artifacts**

Run:

```bash
test -s docs/superpowers/reports/2026-07-24-test-suite-effectiveness-final-report.md
test -s docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv
test -s docs/superpowers/reports/2026-07-24-test-suite-mutation-evidence.tsv
test -s docs/superpowers/reports/2026-07-24-test-suite-release-readiness-review.md
git diff --check -- docs/superpowers/reports
rg -n '(^|[^A-Za-z0-9_])([o]cid1\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)' \
  docs/superpowers/reports/2026-07-24-test-suite-effectiveness-final-report.md \
  docs/superpowers/reports/2026-07-24-test-suite-final-decisions.tsv \
  docs/superpowers/reports/2026-07-24-test-suite-mutation-evidence.tsv \
  docs/superpowers/reports/2026-07-24-test-suite-release-readiness-review.md
```

Expected: all files non-empty, diff check PASS, no safety matches.

- [ ] **Step 3: Commit and seal final candidate**

Run:

```bash
git add docs/superpowers/reports/2026-07-24-test-suite-effectiveness-final-report.md
git diff --cached --check
git commit -m "docs: close test suite effectiveness optimization"
git status --short --branch
git rev-parse HEAD
git log --oneline --decorate -16
```

Expected: clean worktree. The branch is ready for a separate same-HEAD review/integration decision; this plan performs no integration operation.
