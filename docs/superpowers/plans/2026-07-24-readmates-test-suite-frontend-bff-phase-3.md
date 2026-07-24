# ReadMates Test Suite Frontend And BFF Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify all 33 frontend unit/BFF candidates, close R01–R02 and the browser-facing portions of R03/R10, and simplify only tests whose user-visible or trust-boundary regression signal is demonstrably preserved.

**Architecture:** Phase 3 keeps route-first ownership intact: feature API/query/model/route/UI tests stay at their truthful layer, Cloudflare Functions remain under the existing node/jsdom unit lane, and Spring return-state validation is tested at its owning server class. The plan records a semantic decision before cleanup, adds explicit negative BFF/OAuth contracts, removes real-time waiting from AI polling tests, then runs the pinned frontend and cross-surface auth gates.

**Tech Stack:** Node.js 24.18.0, pnpm 11.13.1 through Corepack 0.35.0, React 19, Vite 8, React Router 7, TanStack Query 5, Vitest 4.1.10, Testing Library, Cloudflare Pages Functions, Kotlin/JUnit for `OAuthReturnState`, Playwright.

**Review Status:** `APPROVED_FOR_EXECUTION` after the committed Phase 2 report; execute before Phase 4.

## Global Constraints

- Do not change product behavior, route contracts, API schemas, production auth policy, coverage thresholds, visual baselines, retries, timeouts, or workers.
- Keep frontend coverage thresholds at lines `80`, statements `79`, functions `80`, and branches `75`.
- Existing `front/tests/unit/` files remain there; do not move them into co-located source paths because server contract fixtures depend on that tree.
- New feature-local tests may be co-located only under `front/src`, `front/features`, or `front/shared`. New `front/functions` tests stay under `front/tests/unit/`.
- UI tests assert user-observable output and callbacks. Query tests assert keys, API calls, cache writes/removals, and invalidation. BFF tests assert exact request/response trust boundaries.
- Browser-supplied `x-readmates-*` headers are never trusted, secrets never use `VITE_*`, and same-origin `/api/bff/**` remains the browser API path.
- A `mock-heavy` flag is not a deletion decision. Adapter/query tests may legitimately mock their outbound boundary.
- Do not add real member data, private domains, secrets, deployment identifiers, local absolute paths, token-shaped values, or raw AI content.
- Do not update snapshots or run browser E2E in this phase except the exact auth/BFF focused command after unit gates. Phase 4 owns complete browser and visual evidence.
- Stop and classify a production defect if a new security assertion fails; do not weaken the assertion or change the documented contract.

---

## Scope And Dependency Check

This is plan 3 of 5 and starts only after the committed Phase 2 report.

```text
Task 1 frontend baseline
  -> Task 2 33-file semantic decisions
  -> Tasks 3-6 security, query, UI, and timer improvements
  -> Task 7 ledger-approved cleanup
  -> Task 8 final frontend/BFF verification
```

Owned risks:

| Risk | Required Phase 3 outcome |
| --- | --- |
| R01 | Cookie, redirect, internal-header, secret, and trusted-host negative contract is explicit |
| R02 | Tampered/expired/malformed/scheme-relative/external OAuth return targets are rejected |
| R03 | Browser-provided club context cannot override route/server-derived context |
| R10 | Frontend/BFF error and observability tests prove content/token/PII sanitization at the unit boundary |

## File Structure Map

| Path | Responsibility |
| --- | --- |
| `docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-decisions.tsv` | One semantic decision for each of the 33 frontend node/jsdom candidates |
| `docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-report.md` | Coverage, timing, changes, risk closure, and retained candidates |
| `front/tests/unit/cloudflare-bff.test.ts` | Same-origin BFF request/response trust contract |
| `front/tests/unit/cloudflare-oauth-proxy.test.ts` | OAuth start/callback proxy contract |
| `front/tests/unit/proxy-bff-secret.test.ts` | Secret selection without browser exposure |
| `server/src/test/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnStateTest.kt` | Signed-state and return-target validation |
| `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx` | Deterministic polling state machine |
| `front/features/host/aigen/queries/aigen-job-queries.test.tsx` | Recoverable-job polling options |
| `front/features/current-session/queries/current-session-queries.test.tsx` | Current-session cache/invalidation |
| `front/features/host/queries/host-session-queries.hooks.test.tsx` | Host mutation cache effects |
| `front/features/host/queries/host-session-record-queries.test.tsx` | Record apply/draft cache effects |
| `front/shared/observability/frontend-observability-client.test.ts` | R10 client sanitization, if selected for strengthening |

Oversized route/UI files may be split only when their Phase 3 decision row gives exact new paths and a shared fixture strategy.

## Decision Ledger Interface

```text
path	lane	flags	production_target	failure_mode	observation	test_double	duplicate_of	decision	destination	rationale
```

`decision` is one of `retain`, `strengthen`, `consolidate`, `delete`, `move-layer`, or `split`. All paths are repo-relative; `-` means not applicable.

---

### Task 1: Establish The Pinned Frontend Baseline

**Files:**
- Create, do not commit: `.tmp/test-suite-phase-3/front-coverage-before.log`
- Create, do not commit: `.tmp/test-suite-phase-3/front-lint-before.log`
- Create, do not commit: `.tmp/test-suite-phase-3/front-build-before.log`

**Interfaces:**
- Consumes: Phase 2 committed HEAD and Phase 1 frontend baseline.
- Produces: the before-state for Phase 3 coverage and wallclock.

- [ ] **Step 1: Activate the repository package manager**

Run:

```bash
git status --short --branch
test -s docs/superpowers/reports/2026-07-24-test-suite-phase-2-server-report.md
phase3_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase3_node_bin:$PATH" node --version
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --version
```

Expected: clean worktree, Node `v24.18.0`, pnpm `11.13.1`.

- [ ] **Step 2: Record one clean frontend baseline**

Run:

```bash
mkdir -p .tmp/test-suite-phase-3
phase3_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase3_node_bin:$PATH" /usr/bin/time -p \
  npx --yes corepack@0.35.0 pnpm --dir front test:coverage \
  > .tmp/test-suite-phase-3/front-coverage-before.log 2>&1
PATH="$phase3_node_bin:$PATH" /usr/bin/time -p \
  npx --yes corepack@0.35.0 pnpm --dir front lint \
  > .tmp/test-suite-phase-3/front-lint-before.log 2>&1
PATH="$phase3_node_bin:$PATH" /usr/bin/time -p \
  npx --yes corepack@0.35.0 pnpm --dir front build \
  > .tmp/test-suite-phase-3/front-build-before.log 2>&1
```

Expected: all commands exit 0; record 183-file/1,425-test Phase 1 values only as the comparison baseline, not as the new result.

---

### Task 2: Classify All 33 Frontend Candidates

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-decisions.tsv`

**Interfaces:**
- Consumes: Phase 1 candidate ledger, frontend production modules, assertions, and Task 1 runtime evidence.
- Produces: the only authorization source for Phase 3 cleanup.

- [ ] **Step 1: Freeze the exact candidate set**

Run:

```bash
phase3_tmp=.tmp/test-suite-phase-3
awk -F '\t' '
  NR==FNR && FNR>1 { lane[$1]=$2; next }
  FNR>1 && (lane[$1] == "front-vitest-node" || lane[$1] == "front-vitest-jsdom") { print $1 }
' docs/superpowers/reports/2026-07-24-test-suite-file-inventory.tsv \
  docs/superpowers/reports/2026-07-24-test-suite-candidate-ledger.tsv \
  | sort -u > "$phase3_tmp/frontend-candidates.txt"

test "$(wc -l < "$phase3_tmp/frontend-candidates.txt" | tr -d ' ')" -eq 33
```

Expected: exactly 33 unique paths.

- [ ] **Step 2: Record one complete semantic row per path**

Read the whole test and its production target. For query/hook tests, distinguish legitimate outbound mocks from mocks that copy cache logic. For oversized route/UI tests, identify independent user contracts before choosing `split`. A file with multiple flags still receives one row.

- [ ] **Step 3: Validate and commit the ledger**

Run:

```bash
test "$(tail -n +2 docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-decisions.tsv | wc -l | tr -d ' ')" -eq 33
test "$(tail -n +2 docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-decisions.tsv | cut -f1 | sort -u | wc -l | tr -d ' ')" -eq 33
git diff --check -- docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-decisions.tsv
git add docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-decisions.tsv
git commit -m "docs: classify frontend test effectiveness candidates"
```

---

### Task 3: Strengthen The BFF Trust Boundary

**Files:**
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Modify: `front/tests/unit/cloudflare-oauth-proxy.test.ts`
- Modify if the ledger authorizes consolidation: `front/tests/unit/proxy-bff-secret.test.ts`

**Interfaces:**
- Consumes: `front/functions/_shared/proxy.ts`, BFF catch-all, OAuth authorization proxy, and OAuth callback proxy.
- Produces: R01/R03 negative request and response contracts.

- [ ] **Step 1: Add request-side hostile-header cases**

Cover browser-supplied `X-Readmates-Bff-Secret`, client IP, club host, and route-selected slug conflicts for both ordinary BFF and OAuth start/callback. Assert the upstream request contains only server-derived values, invalid route slugs never call upstream, and query parameters on the configured API base URL are ignored.

- [ ] **Step 2: Add response-side cookie, redirect, and header cases**

Use an upstream manual redirect carrying multiple `Set-Cookie` values, a `Location`, and internal `x-readmates-*` response headers. Assert:

- `Domain` is stripped from every cookie;
- `Path`, `HttpOnly`, `Secure`, `SameSite`, expiry, and multiple-cookie cardinality are preserved;
- the intended `Location` and status are preserved;
- internal response headers are absent;
- no secret or token-shaped value appears in the public response.

- [ ] **Step 3: Run the focused BFF suite**

Run:

```bash
phase3_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  tests/unit/cloudflare-bff.test.ts \
  tests/unit/cloudflare-oauth-proxy.test.ts \
  tests/unit/proxy-bff-secret.test.ts
```

Expected: PASS; no production Functions source changes.

- [ ] **Step 4: Commit R01/R03**

Run:

```bash
git add front/tests/unit/cloudflare-bff.test.ts \
  front/tests/unit/cloudflare-oauth-proxy.test.ts \
  front/tests/unit/proxy-bff-secret.test.ts
git diff --cached --check
git commit -m "test(front): strengthen bff trust contracts"
```

---

### Task 4: Close OAuth Return-State And Open-Redirect Gaps

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnStateTest.kt`
- Modify: `front/tests/unit/cloudflare-oauth-proxy.test.ts`

**Interfaces:**
- Consumes: `OAuthReturnState.signReturnTarget`, `validatedReturnTarget`, invite state helpers, and proxy redirect handling.
- Produces: R02 direct rejection evidence.

- [ ] **Step 1: Add deterministic signed-state tests**

Create a fixture with a fixed secret, app origin, cookie domain, controllable expiry passed to `signReturnTarget(returnTo, expiresAt)`, and a `TrustedReturnHostPort` containing one active club domain. Cover:

- valid relative path;
- tampered payload and tampered signature;
- expired state;
- malformed/base64-invalid state;
- `//external.example`, backslash, user-info, unsupported scheme, and untrusted absolute host;
- trusted app, preview, and active club hosts;
- invite token/club mismatch.

Assert every invalid state returns `DEFAULT_RETURN_TARGET` or `null` according to the public method contract.

- [ ] **Step 2: Run server and proxy focused tests**

Run:

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.auth.infrastructure.security.OAuthReturnStateTest
phase3_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  tests/unit/cloudflare-oauth-proxy.test.ts
```

Expected: PASS. If current production behavior accepts an untrusted target, stop and report a product security defect.

- [ ] **Step 3: Commit R02**

Run:

```bash
git add server/src/test/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnStateTest.kt \
  front/tests/unit/cloudflare-oauth-proxy.test.ts
git diff --cached --check
git commit -m "test(auth): reject unsafe oauth return state"
```

---

### Task 5: Replace Mock-Shape Assertions With Cache Contracts

**Files:**
- Modify: `front/features/current-session/queries/current-session-queries.test.tsx`
- Modify: `front/features/host/queries/host-session-queries.hooks.test.tsx`
- Modify: `front/features/host/queries/host-session-record-queries.test.tsx`
- Modify: `front/features/host/aigen/queries/aigen-job-queries.test.tsx`
- Modify only when authorized by its ledger row: other `mock-heavy` query tests in the 33-file set.

**Interfaces:**
- Consumes: query keys, query options, mutation hooks, feature API wrappers, and the shared QueryClient test wrapper.
- Produces: assertions on cache state/invalidation rather than copied mock call sequences.

- [ ] **Step 1: Strengthen each selected query contract**

For each selected test:

1. keep API mocks only at the feature API boundary;
2. seed a real `QueryClient`;
3. invoke the actual query option or mutation hook;
4. assert normalized keys, cached value, removal, and invalidated dependent surfaces;
5. assert a failed response leaves cache unchanged;
6. remove assertions that merely repeat the mock setup.

- [ ] **Step 2: Run the focused query suite**

Run:

```bash
phase3_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  features/current-session/queries/current-session-queries.test.tsx \
  features/host/queries/host-session-queries.hooks.test.tsx \
  features/host/queries/host-session-record-queries.test.tsx \
  features/host/aigen/queries/aigen-job-queries.test.tsx
```

Expected: PASS with no production query code changes.

- [ ] **Step 3: Commit query improvements**

Run:

```bash
git add front/features/current-session/queries/current-session-queries.test.tsx \
  front/features/host/queries/host-session-queries.hooks.test.tsx \
  front/features/host/queries/host-session-record-queries.test.tsx \
  front/features/host/aigen/queries/aigen-job-queries.test.tsx
git diff --cached --check
git commit -m "test(front): assert query cache contracts"
```

---

### Task 6: Make AI Polling Deterministic

**Files:**
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`
- Modify if selected by the ledger: `front/features/host/aigen/queries/aigen-job-queries.test.tsx`

**Interfaces:**
- Consumes: polling intervals and terminal/recoverable job states.
- Produces: equivalent polling coverage without wallclock sleeps.

- [ ] **Step 1: Replace elapsed-time waiting with fake time**

Use Vitest fake timers and explicit timer advancement. Preserve coverage for disabled/null/undefined IDs, terminal states, `COMMITTING`, `COMMIT_RETRY`, initial cadence, later cadence, no-early-poll, and transient network recovery. Restore real timers in cleanup.

- [ ] **Step 2: Run the polling tests three times**

Run:

```bash
phase3_node_bin="$(brew --prefix node@24)/bin"
for phase3_run in 1 2 3; do
  PATH="$phase3_node_bin:$PATH" /usr/bin/time -p \
    npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
    features/host/aigen/hooks/useAiGenerationJob.test.tsx \
    features/host/aigen/queries/aigen-job-queries.test.tsx
done
```

Expected: all runs PASS with no real sleep, retry, or open-timer warning.

- [ ] **Step 3: Commit deterministic timing**

Run:

```bash
git add front/features/host/aigen/hooks/useAiGenerationJob.test.tsx \
  front/features/host/aigen/queries/aigen-job-queries.test.tsx
git diff --cached --check
git commit -m "test(front): make ai polling deterministic"
```

---

### Task 7: Apply Only Ledger-Approved Splits Or Consolidation

**Files:**
- Modify/delete/create: only paths named by `docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-decisions.tsv`.

**Interfaces:**
- Consumes: 33 decisions and strengthened tests from Tasks 3–6.
- Produces: smaller responsibility-focused files without losing user or boundary assertions.

- [ ] **Step 1: Process authorized decisions**

Apply `split`, `move-layer`, `consolidate`, then `delete`. A split groups tests by user contract, not arbitrary line count. Shared test helpers must stay test-only and must not become a new production import surface.

After every group, run:

```bash
phase3_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  --project node \
  --project jsdom
```

Expected: PASS; every new file is selected by exactly one Vitest project.

- [ ] **Step 2: Re-run the boundary and fixture contracts**

Run:

```bash
phase3_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run \
  tests/unit/frontend-boundaries.test.ts
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures
git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/
```

Expected: PASS and no fixture drift.

- [ ] **Step 3: Commit cleanup**

Run:

```bash
git add front docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-decisions.tsv
git diff --cached --check
git commit -m "test(front): apply evidence-backed suite cleanup"
```

If no cleanup decision survives review, do not create an empty commit.

---

### Task 8: Verify And Report Phase 3

**Files:**
- Create: `docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-report.md`

**Interfaces:**
- Consumes: all Phase 3 commits and Task 1 baseline.
- Produces: the Phase 4 input and same-HEAD frontend/BFF evidence.

- [ ] **Step 1: Run final frontend and server-auth gates**

Run:

```bash
phase3_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front lint
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:coverage
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front build
./scripts/server-ci-check.sh
```

Expected: PASS; frontend thresholds remain `80/79/80/75`, server minimum remains `0.23`.

- [ ] **Step 2: Run the focused auth/BFF browser evidence**

Run:

```bash
phase3_node_bin="$(brew --prefix node@24)/bin"
PATH="$phase3_node_bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front test:e2e -- \
  tests/e2e/google-auth-invite-flow.spec.ts \
  tests/e2e/multi-club-flow.spec.ts
```

Expected: PASS. If MySQL or browser prerequisites are unavailable, record `UNVERIFIED_ENV`; Phase 4 must close it before Phase 5.

- [ ] **Step 3: Write the report**

Record:

- before/after file and case counts;
- all 33 decisions and disposition counts;
- R01/R02/R03/R10 exact unit and browser evidence;
- split/consolidated/deleted files with surviving failure modes;
- frontend coverage before/after;
- full-lane and polling min/median/max timing;
- retry/flake observations;
- any `UNVERIFIED_ENV` delegated to Phase 4;
- explicit statement that production code, thresholds, retries, timeouts, workers, and visual baselines were unchanged.

- [ ] **Step 4: Commit and seal the handoff**

Run:

```bash
git add docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-report.md
git diff --cached --check
git commit -m "docs: report frontend test suite optimization"
git status --short --branch
```

Expected: clean worktree. Phase 4 starts from this committed HEAD.
