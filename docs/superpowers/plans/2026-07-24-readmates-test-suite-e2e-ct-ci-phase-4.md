# ReadMates Test Suite E2E CT And CI Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every Phase 1 browser, visual, script, and observability `UNVERIFIED_ENV`, classify the seven E2E/CT candidates, and remove only proven CI duplication or flake without weakening vertical-slice or visual regression evidence.

**Architecture:** Phase 4 begins with an environment gate rather than treating missing local tools as test failures. It then records semantic decisions for the one Playwright E2E and six visual CT candidates, verifies browser-owned portions of R02–R05/R08/R10 against real local services, audits CI and aggregate scripts for reachability/duplication, validates every config script independently, and accepts performance changes only when three-run evidence improves without reduced failure-mode coverage.

**Tech Stack:** Node.js 24.18.0, pnpm 11.13.1 through Corepack 0.35.0, Playwright 1.61.1, Chromium, Docker/Compose, MySQL 8.4 and CLI, JDK 25, Spring Boot, Playwright CT Docker image, ShellCheck, Prometheus `promtool`, Tempo, jq, GitHub Actions YAML, Bash.

**Review Status:** `APPROVED_FOR_EXECUTION` after the committed Phase 3 report; Phase 5 is blocked until this plan closes the inherited environment gaps.

## Global Constraints

- Do not change product behavior, server domain contracts, coverage thresholds, Playwright retries, timeouts, workers, shard count, screenshot tolerance, Docker image tags, Gradle forks, caches, or existing performance settings unless this plan records a measured defect and an equal-or-better three-run result.
- Keep Playwright local workers at `1` and CI E2E shards at `3`. Do not use parallelism to mask shared-state failures.
- Do not update visual baselines until the product/UI diff is reviewed and the snapshot is proven intentional. Phase 4 is not a visual redesign.
- Generate or update CT baselines only through `pnpm --dir front test:ct:update:docker`; never commit a macOS-rendered baseline.
- A route-mocked browser test is not automatically invalid. Retain it when it uniquely proves router, focus, dialog, accessibility, or browser integration behavior.
- Execute each observability validator independently so one Docker failure cannot hide later results.
- Do not add private domains, secrets, member data, deployment state, local absolute paths, token-shaped examples, or raw provider output to tests, workflow files, reports, or artifacts.
- Do not delete a browser/visual test unless a lower layer catches the same failure mode and the surviving browser suite still covers the vertical slice.
- A missing external prerequisite after the environment-repair step is a blocker for Phase 4, not a PASS and not authorization to skip Phase 5.

---

## Scope And Dependency Check

This is plan 4 of 5 and starts only after the committed Phase 3 report.

```text
Task 1 close environment gaps
  -> Task 2 classify seven candidates
  -> Tasks 3-5 browser, visual, CI/script evidence
  -> Task 6 measured optimization only
  -> Task 7 final Phase 4 gates and handoff
```

Owned risks:

| Risk | Required Phase 4 outcome |
| --- | --- |
| R02 | Browser OAuth invite flow rejects unsafe return-state behavior proven in Phase 3 |
| R03 | Multi-club browser flow preserves independent role and resource context |
| R04 | Public/member/attendee/host visibility is observed in a browser slice |
| R05 | Suspended member and forbidden lifecycle actions remain disabled/rejected |
| R08 | AI cost-cap and commit-recovery UI errors are content-safe and recoverable |
| R10 | Frontend observability proxy, config/profile validators, and label/cardinality policies execute |

## File Structure Map

| Path | Responsibility |
| --- | --- |
| `docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-decisions.tsv` | Seven candidate decisions plus CI/script reachability observations |
| `docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-report.md` | Environment closure, runtime, visual, CI, flake, and residual risk |
| `front/tests/e2e/admin-shell.spec.ts` | Route-mocked platform-admin browser shell candidate |
| `front/features/host/ui/session-closing-board.ct.tsx` | Host blocked/published visual states |
| `front/features/platform-admin/ui/admin-support-workbench.ct.tsx` | Admin risk-review visual state |
| `front/features/public/ui/public-records-page.ct.tsx` | Public record index visual state |
| `front/shared/ui/avatar-chip.ct.tsx` | Deterministic avatar primitive |
| `front/shared/ui/book-cover.ct.tsx` | No-image fallback primitive |
| `front/shared/ui/readmates-brand-mark.ct.tsx` | Brand glyph primitive |
| `front/tests/e2e/google-auth-invite-flow.spec.ts` | R02 browser evidence |
| `front/tests/e2e/multi-club-flow.spec.ts` | R03 browser evidence |
| `front/tests/e2e/public-auth-member-host.spec.ts` | R04 browser evidence |
| `front/tests/e2e/member-lifecycle.spec.ts` | R05 browser evidence |
| `front/tests/e2e/aigen-cost-cap.spec.ts` | R08 cost-cap browser evidence |
| `front/tests/e2e/aigen-commit-recovery.spec.ts` | R08 recovery browser evidence |
| `front/tests/e2e/frontend-observability-local-proxy.spec.ts` | R10 BFF/server telemetry evidence |
| `.github/workflows/ci.yml` | Official lane/shard/reachability mapping; modify only for a proven defect |
| `scripts/pre-push-check.sh` | Local aggregate reachability; modify only for a proven defect |
| `front/playwright.config.ts` | E2E services/workers/retries; inspect but do not tune without evidence |
| `front/playwright-ct.config.ts` | CT selection/tolerance; inspect but do not tune without evidence |

## Decision Ledger Interface

```text
path	lane	flags	failure_mode	observation	duplicate_of	decision	destination	rationale
```

`decision` is `retain`, `strengthen`, `consolidate`, `delete`, `move-layer`, or `split`. CI/script rows use `path` as the workflow/script path, `lane` as `ci-or-script`, `flags` as `reachability`, and are appended after the seven candidate rows.

---

### Task 1: Close Docker MySQL Browser And ShellCheck Gaps

**Files:**
- Create, do not commit: `.tmp/test-suite-phase-4/environment.txt`
- Create, do not commit: `.tmp/test-suite-phase-4/*.log`

**Interfaces:**
- Consumes: host tooling and repo-local Docker/MySQL/browser helpers.
- Produces: executable versions of all Phase 1 `UNVERIFIED_ENV` lanes.

- [ ] **Step 1: Verify or start Docker**

Run:

```bash
git status --short --branch
test -s docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-report.md
if ! docker info >/dev/null 2>&1; then
  if command -v colima >/dev/null 2>&1; then
    colima start
  else
    printf '%s\n' 'Docker daemon is required; start the configured Docker provider.' >&2
    exit 1
  fi
fi
docker info
docker compose version
```

Expected: both Docker commands exit 0. Do not continue with an unreachable daemon.

- [ ] **Step 2: Resolve MySQL CLI and ShellCheck without repository changes**

Run on macOS:

```bash
if ! command -v mysql >/dev/null 2>&1; then
  brew list mysql-client >/dev/null 2>&1 || brew install mysql-client
  phase4_mysql_bin="$(brew --prefix mysql-client)/bin"
  PATH="$phase4_mysql_bin:$PATH" mysql --version
else
  mysql --version
fi

if ! command -v shellcheck >/dev/null 2>&1; then
  brew install shellcheck
fi
shellcheck --version
```

On a non-macOS runner, use its package manager to install the equivalent `mysql` client and `shellcheck`, then run the same version commands. Do not commit PATH or machine-specific configuration.

- [ ] **Step 3: Start the repo-local MySQL and install Chromium**

Run:

```bash
docker compose up -d mysql
docker compose ps mysql
phase4_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase4_node_bin:$PATH" node --version
PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --version
PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec playwright install chromium
```

Expected: MySQL reports healthy, Node is `v24.18.0`, pnpm is `11.13.1`, and Chromium installation exits 0.

- [ ] **Step 4: Re-run every previously unavailable lane once**

Run each command independently:

```bash
mkdir -p .tmp/test-suite-phase-4
./server/gradlew -p server integrationTest
phase4_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:e2e
PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
shellcheck scripts/*.sh deploy/oci/*.sh
./scripts/validate-prometheus-rules.sh
./scripts/validate-prometheus-config.sh
bash scripts/validate-tempo-config.sh
./scripts/lint-grafana-dashboards.sh
```

Expected: all commands exit 0 before candidate changes begin. A genuine baseline failure is classified as production/config/test/flake; it is never fixed by deleting coverage.

---

### Task 2: Classify The Seven Browser And CT Candidates

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-decisions.tsv`

**Interfaces:**
- Consumes: candidate ledger, UI source, router behavior, screenshots, and Task 1 runtime evidence.
- Produces: authorization for Tasks 3–4.

- [ ] **Step 1: Freeze the exact candidate set**

Run:

```bash
phase4_tmp=.tmp/test-suite-phase-4
awk -F '\t' '
  NR==FNR && FNR>1 { lane[$1]=$2; next }
  FNR>1 && (
    lane[$1] == "front-playwright-e2e" ||
    lane[$1] == "front-playwright-ct" ||
    lane[$1] == "design-system-vitest" ||
    lane[$1] == "design-docs-vitest"
  ) { print $1 }
' docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv \
  docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv \
  | sort -u > "$phase4_tmp/browser-ct-candidates.txt"

test "$(wc -l < "$phase4_tmp/browser-ct-candidates.txt" | tr -d ' ')" -eq 7
```

Expected: the admin-shell E2E plus six CT files.

- [ ] **Step 2: Review browser and visual semantics**

For `admin-shell.spec.ts`, identify the browser-only contracts protected despite route mocks: router redirects, dialog/query state, role-specific navigation, focus/accessibility, and host-workspace link. For every CT file, compare its source props and committed PNG and name the concrete layout/state regression it catches.

Write seven complete rows. No snapshot row may be `delete` solely because it uses `toHaveScreenshot`.

- [ ] **Step 3: Append CI/script reachability rows**

Read `.github/workflows/ci.yml`, `scripts/pre-push-check.sh`, package scripts, Vitest projects, Gradle tasks, and Playwright configs. Add one row for each proven missing lane or unintended duplicate. If no defect exists, add explicit `retain` rows for the official `scripts`, `public-release`, `frontend`, `frontend-visual-regression`, `design-system`, `backend`, `backend-integration`, and three-shard `e2e` topology.

- [ ] **Step 4: Validate and commit**

Run:

```bash
test "$(head -n 1 docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-decisions.tsv)" = $'path\tlane\tflags\tfailure_mode\tobservation\tduplicate_of\tdecision\tdestination\trationale'
test "$(awk -F '\t' 'NR>1 && $2 != "ci-or-script" {count++} END {print count+0}' docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-decisions.tsv)" -eq 7
git diff --check -- docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-decisions.tsv
git add docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-decisions.tsv
git commit -m "docs: classify browser visual and ci test evidence"
```

---

### Task 3: Verify The High-Risk Browser Slices

**Files:**
- Modify only if the observed contract is missing: the seven named risk E2E specs in the File Structure Map.

**Interfaces:**
- Consumes: Phase 2/3 server and BFF risk tests.
- Produces: real browser evidence for R02–R05/R08/R10.

- [ ] **Step 1: Run each risk spec independently**

Run:

```bash
phase4_node_bin="$(brew --prefix node@24)/bin"
for phase4_spec in \
  tests/e2e/google-auth-invite-flow.spec.ts \
  tests/e2e/multi-club-flow.spec.ts \
  tests/e2e/public-auth-member-host.spec.ts \
  tests/e2e/member-lifecycle.spec.ts \
  tests/e2e/aigen-cost-cap.spec.ts \
  tests/e2e/aigen-commit-recovery.spec.ts \
  tests/e2e/frontend-observability-local-proxy.spec.ts; do
  PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- "$phase4_spec"
done
```

Expected: every spec exits 0 without retry. If a required matrix cell is absent, add the smallest browser assertion to its existing spec and rerun only that spec.

- [ ] **Step 2: Run the candidate admin shell**

Run:

```bash
phase4_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- \
  tests/e2e/admin-shell.spec.ts
```

Expected: PASS. Apply only the decision ledger action. If retained, document why route mocking is the correct layer.

- [ ] **Step 3: Commit browser strengthening if needed**

Run:

```bash
while IFS= read -r phase4_path; do
  git add -- "$phase4_path"
done < <(git diff --name-only -- front/tests/e2e)
git diff --cached --check
if ! git diff --cached --quiet; then
  git commit -m "test(e2e): strengthen high risk browser slices"
fi
```

---

### Task 4: Verify Visual Baseline Signal And Stability

**Files:**
- Modify/delete: only CT test/PNG paths authorized by the decision ledger.

**Interfaces:**
- Consumes: six CT candidates and their committed Linux-rendered PNGs.
- Produces: stable, intentional visual regression evidence.

- [ ] **Step 1: Run CT verification three times**

Run:

```bash
phase4_node_bin="$(brew --prefix node@24)/bin"
for phase4_run in 1 2 3; do
  PATH="$phase4_node_bin:$PATH" /usr/bin/time -p \
    npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
done
```

Expected: all three runs PASS with identical committed baselines and no update flag.

- [ ] **Step 2: Apply only evidence-backed CT changes**

Retain state-distinct screenshots. Consolidate only identical failure modes. Strengthen weak snapshots with semantic DOM/accessibility assertions before the screenshot when those assertions make the protected state explicit. Do not mask unstable regions or raise `maxDiffPixelRatio` without a renderer-specific diff proving that content signal remains.

If an intentional baseline change is required, run:

```bash
phase4_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:ct:update:docker
PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
git diff -- front/__screenshots__
```

Expected: the second command PASSes and every PNG diff corresponds to a reviewed test/source change.

- [ ] **Step 3: Commit visual changes if any**

Run:

```bash
git add \
  front/features/host/ui/session-closing-board.ct.tsx \
  front/features/platform-admin/ui/admin-support-workbench.ct.tsx \
  front/features/public/ui/public-records-page.ct.tsx \
  front/shared/ui/avatar-chip.ct.tsx \
  front/shared/ui/book-cover.ct.tsx \
  front/shared/ui/readmates-brand-mark.ct.tsx \
  front/__screenshots__
git diff --cached --check
if ! git diff --cached --quiet; then
  git commit -m "test(ct): preserve meaningful visual regression signal"
fi
```

---

### Task 5: Audit CI And Script Reachability

**Files:**
- Modify only for a proven defect: `.github/workflows/ci.yml`
- Modify only for a proven defect: `scripts/pre-push-check.sh`
- Modify only for a proven defect: relevant validation script under `scripts/`
- Modify active documentation only if an official command changes: `docs/development/test-guide.md`

**Interfaces:**
- Consumes: Phase 1 lane mapping and Task 2 reachability rows.
- Produces: one intended execution per official lane and independent config results.

- [ ] **Step 1: Compare local aggregate and CI commands**

Run:

```bash
./scripts/pre-push-check.sh --dry-run
READMATES_SERVER_CI_CHECK_DRY_RUN=true ./scripts/server-ci-check.sh
rg -n 'run:|needs:|strategy:|matrix:|shard|test:coverage|test:ct:docker|integrationTest|server-ci-check|design:check|shellcheck|public-release' \
  .github/workflows/ci.yml scripts/pre-push-check.sh scripts/server-ci-check.sh
```

Expected topology:

- unit/coverage once in frontend;
- CT once in visual regression;
- server unit/architecture once through `server-ci-check.sh`;
- integration once in backend-integration;
- E2E split into exactly three disjoint shards;
- scripts and public release in their own jobs.

- [ ] **Step 2: Fix only a proven reachability defect**

If Task 2 recorded no missing or duplicate execution, leave CI/scripts unchanged. If a defect exists, change the smallest selector or aggregate command and preserve cache, shard, timeout, retry, worker, artifact, and performance settings.

- [ ] **Step 3: Run every script gate independently**

Run:

```bash
python3 scripts/check-agent-guidance.py
for phase4_script in scripts/*.sh deploy/oci/*.sh; do bash -n "$phase4_script"; done
shellcheck scripts/*.sh deploy/oci/*.sh
bash scripts/aigen-pii-check.sh
./scripts/validate-prometheus-rules.sh
./scripts/validate-prometheus-config.sh
bash scripts/validate-tempo-config.sh
bash scripts/validate-production-ai-config.sh
bash scripts/verify-production-ai-config-fixtures.sh
./scripts/lint-grafana-dashboards.sh
```

Expected: every command exits 0. Record each result separately.

- [ ] **Step 4: Commit only if CI/scripts changed**

Run:

```bash
while IFS= read -r phase4_path; do
  git add -- "$phase4_path"
done < <(git diff --name-only -- \
  .github/workflows/ci.yml scripts docs/development/test-guide.md)
git diff --cached --check
if ! git diff --cached --quiet; then
  git commit -m "test(ci): correct suite reachability"
fi
```

---

### Task 6: Accept Only Measured Runtime Improvements

**Files:**
- Modify: only test fixtures/setup selected in Tasks 2–5.

**Interfaces:**
- Consumes: Phase 1 timings and Task 1/3/4 before-state.
- Produces: accepted improvements with preserved failure modes, or explicit no-change evidence.

- [ ] **Step 1: Measure affected lanes three times before and after**

Use identical commands, environment, worker count, Docker state, and warm/cold classification. Record min/median/max for E2E focused specs, complete CT, design check, and any changed script lane.

```bash
phase4_node_bin="$(brew --prefix node@24)/bin"
for phase4_run in 1 2 3; do
  PATH="$phase4_node_bin:$PATH" /usr/bin/time -p \
    npx --yes corepack@0.35.0 pnpm design:check
  PATH="$phase4_node_bin:$PATH" /usr/bin/time -p \
    npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
done
```

Expected: no accepted change increases median runtime or introduces a new failure/retry. Revert any performance-only change that does not improve median runtime while preserving test signal.

- [ ] **Step 2: Preserve existing optimization settings**

Run:

```bash
git diff -- front/playwright.config.ts front/playwright-ct.config.ts \
  front/vitest.config.ts server/build.gradle.kts .github/workflows/ci.yml \
  scripts/pre-push-check.sh
```

Expected: no retries/timeouts/workers/shards/forks/cache/performance values changed unless Task 5 documented a correctness defect and Task 6 proved the replacement.

---

### Task 7: Run Complete Phase 4 Gates And Report

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-report.md`

**Interfaces:**
- Consumes: all Phase 4 commits and runtime evidence.
- Produces: a Phase 5 handoff with no inherited `UNVERIFIED_ENV`.

- [ ] **Step 1: Run all owned gates on one candidate HEAD**

Run:

```bash
phase4_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:e2e
PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
PATH="$phase4_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm design:check
./server/gradlew -p server integrationTest
shellcheck scripts/*.sh deploy/oci/*.sh
./scripts/validate-prometheus-rules.sh
./scripts/validate-prometheus-config.sh
bash scripts/validate-tempo-config.sh
./scripts/lint-grafana-dashboards.sh
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check
```

Expected: every command exits 0. Phase 4 is not complete with `UNVERIFIED_ENV`.

- [ ] **Step 2: Write the Phase 4 report**

Record:

- environment repairs and tool versions without local paths or private values;
- all seven candidate decisions and CI/script rows;
- R02–R05/R08/R10 browser results;
- CT three-run stability and any reviewed PNG changes;
- CI reachability and duplicate-execution conclusion;
- independent script/config results;
- before/after min/median/max wallclock and retry/flake observations;
- public-release result;
- explicit preservation of workers, shards, retries, timeouts, caches, forks, and thresholds;
- any genuine external residual risk. `UNVERIFIED_ENV` must be zero.

- [ ] **Step 3: Commit and seal the handoff**

Run:

```bash
git add docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-report.md
git diff --cached --check
git commit -m "docs: report browser visual and ci optimization"
git status --short --branch
```

Expected: clean worktree. Phase 5 starts from this committed HEAD.
