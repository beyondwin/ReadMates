# Host Responsive Recovery and Closeout Stage 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 호스트 경험의 모바일 완료성, 접근성, 복구, deep-link 호환, visual evidence와 active docs를 닫고 ADR-0048/0049의 승격 여부를 증거로 결정한다.

**Architecture:** whole-program verification/rollout 단계다. responsive behavior를 승인 breakpoints에 고정하고 authority/revision/unknown recovery를 E2E로 증명하며, 새 routes가 안정된 뒤 legacy routes를 replace redirect한다. docs는 구현 사실만 반영한다.

**Tech Stack:** Playwright CT/E2E, Vitest, React/CSS, repo docs and release checks.

**Spec:** design §4/7–13, ADR-0048/0049 verification, approved 07–17.

ADR impact: `Accepted` only if every named gate is green; otherwise Proposed with explicit missing evidence.

## Global Constraints

- 390px order is meeting context → phase → next action → preparation → workbox; mobile is not scaled desktop.
- 768–1199 moves workbox below content and exposes summary counts after phase tabs.
- body/sticky CTA cannot expose the same accessible name simultaneously.
- 403, 409, partial failure and unknown outcome each keep a concrete recovery action.
- redirect only after destination parity tests. Preserve query/search/hash/state where meaningful.
- screenshot baselines contain public-safe fixtures and code-native UI only.

---

### Task 0: Whole-branch change and requirement audit

- [ ] **Step 1:** Inspect branch and classify release surface.

```bash
git status --short --branch
git diff --stat origin/main..HEAD
python3 scripts/agent-preflight.py --intent release --base origin/main --paths front,server,docs,CHANGELOG.md --isolation-note "Stage 5 host operating room closeout"
```

- [ ] **Step 2:** For every program requirement, point to code + test + runtime evidence. Missing evidence is a failing item.

### Task 1: Lock responsive layout and interaction contracts

**Files:**
- Modify: Stage 2–4 CSS/components and colocated CT specs.
- Update: tracked CT screenshot baselines through the existing screenshot command.

- [ ] **Step 1:** RED CT at 390, 767, 768, 1024, 1199, 1200, 1440; assert DOM order, no overflow, safe area, 44px targets and one visible primary CTA.
- [ ] **Step 2:** Add long Korean/English, missing image, 0/large counts, partial rows and 200% zoom.
- [ ] **Step 3:** Verify reduced motion, focus-visible, keyboard order, menu escape/return focus and color-independent status.
- [ ] **Step 4:** Update baselines only after semantics pass. Compare hierarchy with 07–17; do not pixel-copy.
- [ ] **Step 5:** Commit CT and baselines together.

### Task 2: Prove recovery state machines

**Files:**
- Modify: route/query/model tests and relevant host E2E specs.

- [ ] **Step 1:** 403: revoke host role mid-route; assert query/draft/workbox purge and same-club safe handoff.
- [ ] **Step 2:** 409 schedule edit: preserve input, fetch newest, show comparison, explicit retry.
- [ ] **Step 3:** Unknown mutation: abort after server commit, reconcile by idempotency key, keep action until COMMITTED/NOT_EXECUTED.
- [ ] **Step 4:** Partial source: fail workbox/notification while current meeting remains usable; retry only failed source.
- [ ] **Step 5:** Deferred: clock advance returns NOW; source resolution derives COMPLETED without a completion write.
- [ ] **Step 6:** Commit.

### Task 3: Switch legacy host routes

**Files:**
- Modify: `front/src/app/routes/host.tsx`
- Modify/create: compatibility redirects/tests, route inventory and E2E.

**Redirect map:**

```text
/host/members     -> /host/people
/host/invitations -> /host/settings#invitations
/host/operations  -> /host
```

`/host/records` is canonical and must not redirect. Session edit/closing deep links remain when redirect would lose a non-current session context.

- [ ] **Step 1:** RED scoped/unscoped tests for replace, search/hash/state preservation and non-current session safety.
- [ ] **Step 2:** Change only redirects whose destination parity is proven.
- [ ] **Step 3:** Update current tab matching and return/focus restoration.
- [ ] **Step 4:** Run route tests/E2E and commit.

### Task 4: Run the complete validation matrix

- [ ] **Step 1:** Server gates.

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

- [ ] **Step 2:** Frontend gates.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

- [ ] **Step 3:** Public release safety.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

- [ ] **Step 4:** Run `git diff --check` and safety scans. Record exact results; skipped is never passed.

### Task 5: Synchronize active docs

**Files:**
- Modify: `front/DESIGN.md`
- Modify: `docs/development/architecture.md`
- Modify: ADR-0048, ADR-0049, ADR index and `technical-decisions.md`
- Modify: `CHANGELOG.md`
- Modify: mockup README only for final CT authority links.

- [ ] **Step 1:** Replace active ADR-0046 3-tab/today/diary text with actual 4-area behavior; keep ADR-0046 as superseded history.
- [ ] **Step 2:** Document exact seen revision/write timing/privacy, workbox semantics, canonical routes and responsive contract.
- [ ] **Step 3:** Add Unreleased operator summary and migration note; do not claim production rollout.
- [ ] **Step 4:** Link code-native CT evidence; 07–17 remain design references.
- [ ] **Step 5:** Run docs checks and public-safety scans.

### Task 6: Decide ADR status with evidence

- [ ] **Step 1:** Accept ADR-0049 only if migration, policy, concurrency, BFF, mark timing, privacy and browser flow passed.
- [ ] **Step 2:** Accept ADR-0048 only if all destinations/utilities, phases, next action, ledger, workbox, responsive, recovery and docs passed.
- [ ] **Step 3:** Otherwise keep Proposed and add dated missing-evidence bullets with commands/scenarios.
- [ ] **Step 4:** Commit docs/ADR closeout separately.

### Task 7: Final handoff

- [ ] **Step 1:** Report surfaces, migrations, API contracts, routes and visible behavior.
- [ ] **Step 2:** List every command run and every skipped validation with reason.
- [ ] **Step 3:** List residual risks: production migration duration, external provider delivery, manual VoiceOver/NVDA if not run.
- [ ] **Step 4:** Use `superpowers:requesting-code-review`, then `superpowers:finishing-a-development-branch`. Do not push/merge/deploy without authorization.
