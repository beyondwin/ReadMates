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
python3 scripts/agent-preflight.py --intent release --base origin/main \
  --paths front --paths server --paths docs --paths CHANGELOG.md \
  --isolation-note "Stage 5 host operating room closeout"
```

- [ ] **Step 2:** For every program requirement, point to code + test + runtime evidence. Missing evidence is a failing item.
- [ ] **Step 3:** Review `origin/main..HEAD` with `docs/development/release-readiness-review.md`; include CHANGELOG/Unreleased, migrations, CI/deploy scripts, operator-visible changes, security hygiene, architecture baselines/exceptions and public-release safety.
- [ ] **Step 4:** Run `command -v corepack || true`; use and record `npx --yes corepack@0.35.0 pnpm` when it is absent, as in the reviewed checkout.

### Task 1: Lock responsive layout and interaction contracts

**Files:**
- Modify: Stage 2–4 CSS/components and colocated CT specs.
- Update: tracked CT screenshot baselines through the existing screenshot command.

- [ ] **Step 1:** RED CT at 390, 767, 768, 1024, 1199, 1200, 1440; assert DOM order, no overflow, safe area, 44px targets and one visible primary CTA.
- [ ] **Step 2:** Add long Korean/English, missing image, 0/large counts, partial rows and 200% zoom.
- [ ] **Step 3:** Verify reduced motion, focus-visible, keyboard order, menu escape/return focus and color-independent status.
- [ ] **Step 4:** After semantics pass, use `npx --yes corepack@0.35.0 pnpm --dir front test:ct:update` only for intentional reviewed baseline changes. Inspect the image diff/provenance, then require `npx --yes corepack@0.35.0 pnpm --dir front test:ct` green; update mode is never verification. Compare hierarchy with 07–17; do not pixel-copy.
- [ ] **Step 5:** Commit CT and baselines together.

### Task 2: Prove recovery state machines

**Files:**
- Modify: route/query/model tests and relevant host E2E specs.

- [ ] **Step 1:** 403: revoke host role mid-route; assert query/draft/workbox purge and same-club safe handoff.
- [ ] **Step 2:** 409 schedule edit: preserve input, fetch newest, show comparison, explicit retry.
- [ ] **Step 3:** Unknown mutation: abort after server commit, reconcile by idempotency key, keep action until COMMITTED/NOT_EXECUTED.
- [ ] **Step 4:** Partial source: fail workbox/notification while current meeting remains usable; retry only failed source.
- [ ] **Step 5:** Deferred: clock advance returns NOW; source resolution derives COMPLETED without a completion write.
- [ ] **Step 6:** Schedule lifecycle: DRAFT is explicitly unavailable, OPEN creates UNSEEN, only a successful MEMBER current-session render records the exact revision as CURRENT, schedule edit becomes STALE, and the next successful member render becomes CURRENT again. Host operating-room entry and any GET/loader never write seen state. Assert RSVP/attendance state is unchanged by seen writes.
- [ ] **Step 7:** Access lifecycle: ACTIVE membership coarse club access is independent from seen state. HOST authority loss immediately purges client host cache/drafts/workbox but a HOST→MEMBER downgrade with ACTIVE membership preserves legitimate access/participant seen facts. Server rows are deleted only when membership becomes INACTIVE/deleted or the owning participant/session row is deleted/anonymized, exactly as ADR-0049 declares.
- [ ] **Step 8:** Work lifecycle: preparation → live → closing preserves the authoritative next-action/work-item key. NOW → DEFERRED → expiry → NOW and source resolution → COMPLETED are derived without a completion write.
- [ ] **Step 9:** Notification lifecycle: edited subject/body preview records exact copy, schedule revision and target snapshot; a schedule or target change before confirm returns a conflict with explicit re-preview. Abort-after-commit reconciles partial/unknown delivery state without sending a second delivery.
- [ ] **Step 10:** People/settings lifecycle: person detail rejects cross-club membership ids and excludes unrelated/private account fields; named invitation-link changes keep history; settings changes enforce revision/authority; club-end preview/confirm is exercised only with a local safe fixture.
- [ ] **Step 11:** Commit.

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
./server/gradlew -p server architectureTest
```

- [ ] **Step 2:** Frontend gates.

```bash
npx --yes corepack@0.35.0 pnpm --dir front lint
npx --yes corepack@0.35.0 pnpm --dir front test
npx --yes corepack@0.35.0 pnpm --dir front build
npx --yes corepack@0.35.0 pnpm --dir front test:ct
npx --yes corepack@0.35.0 pnpm --dir front test:e2e
npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures
git diff --exit-code -- front/tests/unit/__fixtures__
```

- [ ] **Step 3:** Public release safety.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

- [ ] **Step 4:** Run `git diff --check` and safety scans. Record exact results; skipped is never passed.
- [ ] **Step 5:** Run migration-policy and concurrency evidence for V61–V65: clean migrate, upgrade from the previous migration, duplicate idempotency, stale revision, parallel seen-upsert, cursor misuse/expiry/key rotation and cleanup-on-role-loss. Record the exact Gradle test selectors or suite output.
- [ ] **Step 6:** Re-run trusted-BFF and authorization contract tests for every new mutation path. Browser-supplied internal headers must remain untrusted.

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

### Task 7: Capture the mandatory browser evidence set

**Files:**
- Modify: the Stage 1–4 host E2E specs and public-safe fixtures.
- Create/update: code-native screenshot baselines produced by the existing CT/E2E commands.

- [ ] **Step 1:** Capture scoped and unscoped entry, legacy redirects, deep-link retention, combined club+role switching and authority loss.
- [ ] **Step 2:** Capture DRAFT unavailable → OPEN UNSEEN → CURRENT → STALE → CURRENT plus unchanged RSVP/attendance.
- [ ] **Step 3:** Capture preparation → live → closing, schedule comparison after 409, person detail/privacy, invitation links, club settings and guarded club-end preview.
- [ ] **Step 4:** Capture notification preview/confirm, schedule/target snapshot conflict, partial failure and unknown-outcome reconciliation. Use the local safe provider; do not send real email.
- [ ] **Step 5:** Capture workbox NOW → DEFERRED → expired NOW and source resolution → COMPLETED, including an invalid/expired cursor recovery.
- [ ] **Step 6:** Capture 403, 409, partial and unknown states at 390, 768, 1024, 1200 and 1440 widths; retain public-safe screenshots and traces only.
- [ ] **Step 7:** Record automated accessibility output and explicitly mark manual VoiceOver/NVDA as `not measured` unless actually run.
- [ ] **Step 8:** Commit evidence and its fixture provenance.

### Task 8: Independent whole-branch review and final handoff

- [ ] **Step 1:** Build a review package for `origin/main..HEAD` and use `superpowers:requesting-code-review` with a fresh strongest-capable reviewer. Review requirements, architecture, security/privacy, migrations, generated contracts, responsive behavior, release readiness and public-repo safety.
- [ ] **Step 2:** Classify findings by severity and task. Run a bounded correction wave with fresh verification; do not exceed the program's five-round fix limit.
- [ ] **Step 3:** Re-run the complete validation matrix after the last code or docs change. Evidence produced before a later change is not final unless the touched-surface hash proves it is reusable.
- [ ] **Step 4:** Report surfaces, migrations, API contracts, routes and visible behavior.
- [ ] **Step 5:** List every command run and every skipped validation with reason.
- [ ] **Step 6:** List residual risks: production migration duration, external provider delivery, manual VoiceOver/NVDA if not run. Use truthful `not measured` labels.
- [ ] **Step 7:** Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. The authorized integration boundary is a safe local merge to `main`; do not push, open a PR, tag, deploy or send real email.
