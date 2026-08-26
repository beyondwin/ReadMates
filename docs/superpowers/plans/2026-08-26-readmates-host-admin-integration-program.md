# ReadMates Host Admin Visual Authority Integration Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 host Focus Deck과 admin Editorial Operations Ledger를 하나의 최신 통합 브랜치에서 충돌 없이 완성하고, 시각 권위·접근성·성능·권한·미병합 브랜치 비유입을 증명한 뒤 안전하게 main 병합 가능한 상태로 만든다.

**Architecture:** authority commit `d4aa0ec0230c920da03810cb29b7326ea1f7367f`를 조상으로 가진 격리 worktree에서 공통 visual contract를 먼저 고정한다. Host와 admin은 서로의 feature 경로와 shared integration 파일을 건드리지 않는 직렬 vertical slice로 구현한다. 마지막 integration owner만 global CSS 잔여 selector, Playwright project, CI, 성능 gate, active docs, ADR 승격과 negative provenance를 소유한다. 오래된 `codex/admin-site-tone-redesign` 브랜치는 merge/cherry-pick하지 않는다.

**Tech Stack:** React 19, React Router 8, TanStack Query v5, TypeScript 6, Vite 8, Vitest 4, Testing Library, Playwright 1.61 component/E2E testing, ReadMates design-system CSS tokens, Git worktrees.

**Spec:** `docs/superpowers/specs/2026-08-26-readmates-host-admin-visual-authority-and-integration-design.md`

## Global Constraints

- ADR impact는 `supersede`다. ADR-0044와 ADR-0045는 구현 완료 전 `Proposed`를 유지하고 코드, tests, `front/DESIGN.md`, active architecture가 일치한 마지막 task에서만 `Accepted`로 승격한다.
- 실행 시작 전에 `superpowers:using-git-worktrees`를 사용한다. 실행 branch의 HEAD에는 이 plan 세트가 포함되어야 하고 `d4aa0ec0`는 반드시 조상이어야 한다.
- 먼저 `2026-08-26-readmates-host-focus-deck.md`, 다음으로 `2026-08-26-readmates-admin-editorial-operations-ledger.md`를 실행한다. 두 plan의 shared 금지 파일을 우회하지 않는다.
- Host owner는 `front/features/host/**`와 host 전용 E2E/fixture만 수정한다. Admin owner는 `front/features/platform-admin/**`와 admin 전용 E2E/fixture만 수정한다.
- Integration owner만 `front/src/styles/globals.css`, `front/package.json`, `front/playwright*.config.ts`, `front/tests/performance/**`, `.github/workflows/ci.yml`, active docs와 ADR index를 수정한다.
- `front/dist`, `front/test-results`, `front/playwright-report`, `front/output/performance`, `.tmp/performance`, Docker CT named volume을 사용하는 검증은 병렬 실행하지 않는다.
- 기존 design-system의 paper, ink, restrained navy, semantic state, spacing, type, focus token을 재사용한다. Host/admin 전용 palette, glass, glow, dark NOC, KPI-card theme를 추가하지 않는다.
- `front/src/styles/globals.css`의 기존 admin/host selector를 새 feature stylesheet와 중복 유지하지 않는다. CSS build budget을 넘기면 threshold를 올리지 말고 dead selector와 eager import를 줄인다.
- `AdminActionDock`, `AdminModalDialog`, `AdminPageFrame`, `AdminStatePanel`, capability parser/API, command recovery, public takedown, host authority-loss/public-convergence 계약을 삭제하거나 우회하지 않는다.
- 일반 admin action은 exact capability projection, Today lifecycle은 server-owned `allowedActions`만 authority로 쓴다. Role 이름으로 권한을 재계산하지 않는다.
- Host record readiness unknown은 false가 아니다. CLOSED primary action은 readiness ready 전까지 fail closed한다.
- 실제 AI/provider 호출, 이메일·알림 발송, 권한 변경, public takedown, live deploy, production data mutation은 비범위다.
- 실제 회원 정보, secret, private domain, 로컬 절대 경로, token-shaped fixture를 tracked source와 최종 응답에 넣지 않는다.
- 각 behavior task는 RED 확인, 최소 GREEN, focused regression, independent review, bounded fix, `git diff --check`, 좁은 commit 순서로 끝낸다.
- 각 slice 종료 시 latest main practice integration은 rebase가 아니라 merge 기반으로 수행하고, shared file 충돌은 integration owner가 직렬로 해결한다. 오래된 redesign branch와는 practice integration하지 않는다.

## Requirement Handoff

| Requirement | Owning plan/task |
| --- | --- |
| 공통 visual/state/accessibility contract | This plan Tasks 1-2 |
| Host original Focus Deck authority | Host plan Tasks 1-5 |
| Admin full Editorial Operations Ledger | Admin plan Tasks 1-9 |
| 320-1440 responsive and cross-browser proof | Host Task 5, Admin Task 9, this plan Tasks 4-5 |
| Exact capability and Today allowedActions | Admin Tasks 3, 6-8 |
| Record-readiness fail-closed | Host Tasks 1-2 |
| CSS budget without threshold increase | This plan Task 4 |
| Old branch selective intent without merge | Admin Tasks 2-3, this plan Task 6 |
| ADR/design/architecture convergence | This plan Task 7 |
| Whole-branch review and merge gate | This plan Tasks 6-8 |

## Dependency Order

`Task 1 → Task 2 → Host plan Tasks 1-5 → Admin plan Tasks 1-9 → Tasks 3-8`.

Host and admin implementation may use separate agents only when their file allowlists do not overlap. All shared config, screenshot update, build output, Docker CT, performance, docs and final Git integration are serial.

## Acceptance-Matrix Selection

- Selected: actor/authorization, meeting lifecycle, cursor collection, async/cache/provider failure, public projection convergence, emergency public takedown survival, UI/runtime state.
- Selected because this program changes host lifecycle presentation, admin permission presentation, polling/selection, recovery, responsive composition and visual evidence.
- Adjacent high-risk exclusion: no server/BFF/API/migration/OAuth contract change. Their code is survival scope only; run focused existing auth/public-convergence tests rather than inventing new server work.
- Runtime boundary: repository and local browser evidence only. VoiceOver/Safari and NVDA/Chrome remain `not measured` until manually recorded. No production/deploy evidence is claimed.

## File Responsibility Map

| Owner | Files |
| --- | --- |
| Foundation | `design/system/src/styles/tokens.css`, `design/system/src/design-system-boundaries.test.ts`, `front/shared/testing/accessibility-checks.ts`, `front/shared/testing/accessibility-checks.test.ts`, create `front/tests/e2e/support/visual-authority-contract.ts` and `front/tests/e2e/support/visual-authority-contract.test.ts` |
| Host | Defined only by `2026-08-26-readmates-host-focus-deck.md` |
| Admin | Defined only by `2026-08-26-readmates-admin-editorial-operations-ledger.md` |
| Integration CSS/config | `front/src/styles/globals.css`, `front/package.json`, `front/playwright.config.ts`, `front/playwright-performance.config.ts`, `.github/workflows/ci.yml` |
| Performance | Create `front/shared/observability/admin-editorial-ledger-performance.ts`, `front/shared/observability/admin-editorial-ledger-performance.test.ts`, `front/tests/performance/admin-editorial-ledger-budget.ts`, `front/tests/performance/admin-editorial-ledger-budget.test.ts`, `front/tests/performance/admin-editorial-ledger-performance.spec.ts` |
| Active documentation | Create `front/DESIGN.md`; modify `docs/development/architecture.md`, `docs/development/adr/0044-host-focus-deck-primary-action-composition.md`, `docs/development/adr/0045-host-admin-focus-deck-editorial-ledger-composition.md`, both ADR indexes, `CHANGELOG.md`; create accessibility evidence template |

---

### Task 1: Create the isolated integration worktree and seal provenance

**Files:**
- No product source changes.
- Create only execution-local ledger if the execution skill requires it; do not commit tool state.

- [ ] **Step 1: Verify clean source and authority ancestry.**

Run:

    git status --short --branch --untracked-files=all
    git show --no-patch --format='%H %s' d4aa0ec0230c920da03810cb29b7326ea1f7367f
    git merge-base --is-ancestor d4aa0ec0230c920da03810cb29b7326ea1f7367f HEAD

Expected: source worktree has no user change overlap; the last command exits 0.

- [ ] **Step 2: Use the worktree skill.** Create branch `codex/readmates-host-admin-visual-authority` from the current plan commit in a repository-local worktree. Do not use the old redesign branch as a base.

- [ ] **Step 3: Record exact immutable starting evidence.**

Run:

    git rev-parse HEAD
    git merge-base --is-ancestor d4aa0ec0230c920da03810cb29b7326ea1f7367f HEAD
    if git merge-base --is-ancestor e9386c81 HEAD; then exit 1; fi
    git status --short --branch

Expected: authority is an ancestor, old branch head is not, worktree is clean.

- [ ] **Step 4: Run preflight classification.**

Run:

    python3 scripts/agent-preflight.py --intent change --paths 'front' 'design/system' 'docs/development' 'CHANGELOG.md' --json

Expected: frontend/design/docs surfaces only; no server, migration or BFF implementation path.

### Task 2: Add shared visual and accessibility contracts

**Files:**
- Modify: `design/system/src/styles/tokens.css`
- Modify: `design/system/src/design-system-boundaries.test.ts`
- Modify: `front/shared/testing/accessibility-checks.ts`
- Modify: `front/shared/testing/accessibility-checks.test.ts`
- Create: `front/tests/e2e/support/visual-authority-contract.ts`
- Create: `front/tests/e2e/support/visual-authority-contract.test.ts`

**Interfaces:**

    export const VISUAL_AUTHORITY_VIEWPORTS = {
      desktopWide: { width: 1440, height: 960 },
      desktop: { width: 1024, height: 900 },
      tablet: { width: 900, height: 960 },
      tabletNarrow: { width: 768, height: 1024 },
      mobile: { width: 390, height: 844 },
      mobileNarrow: { width: 320, height: 720 },
    } as const;

    export async function expectNoHorizontalOverflow(page: Page, tolerance = 1): Promise<void>;
    export async function expectMinimumTargetSize(locator: Locator, minimum = 44): Promise<void>;
    export async function expectVisibleFocus(locator: Locator): Promise<void>;
    export async function expectReducedMotion(page: Page): Promise<void>;

- [ ] **Step 1: Write RED tests.** Assert the six viewport values, overflow tolerance, 44px target failure, visible focus and nested live-region detection. Assert stale tokens alias warning semantics without changing existing warning values.

- [ ] **Step 2: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run shared/testing/accessibility-checks.test.ts tests/e2e/support/visual-authority-contract.test.ts
    corepack pnpm --dir design/system test

Expected: FAIL on missing visual helper, nested-live-region helper and stale aliases. If `corepack` is unavailable, use `npx --yes corepack@0.35.0` and record the exact fallback.

- [ ] **Step 3: Implement the minimum shared contract.** Add `--stale`, `--stale-soft`, `--stale-line` as semantic aliases only. Extend the existing accessibility helper with `findNestedLiveRegions`; do not add axe or a new package dependency.

- [ ] **Step 4: Run GREEN and boundaries.**

Run:

    corepack pnpm --dir front exec vitest run shared/testing/accessibility-checks.test.ts tests/e2e/support/visual-authority-contract.test.ts
    corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
    corepack pnpm --dir design/system test

Expected: PASS.

- [ ] **Step 5: Review and commit.**

Run: `git diff --check`

Commit: `test(design): define host admin visual authority contracts`

### Task 3: Practice-integrate the host and admin vertical slices

**Files:**
- No new shared source by default.
- Resolve only conflicts within the allowlists declared by the two role plans.

- [ ] **Step 1: Execute the host plan fully.** Use subagent-driven development or executing-plans. Require all five host task commits and host independent review before continuing.

- [ ] **Step 2: Practice-integrate latest main.**

Run:

    git fetch origin
    git merge --no-ff --no-commit origin/main

Expected: only current-main conflicts. Abort and classify if the merge introduces a scope outside this program; otherwise resolve, run host focused gate, then commit the practice integration.

- [ ] **Step 3: Execute the admin plan fully.** Require all admin task commits and admin independent review. Do not edit host files or shared integration files.

- [ ] **Step 4: Practice-integrate latest main again.** Repeat the exact merge procedure and run admin focused gate. Never merge or cherry-pick `codex/admin-site-tone-redesign`.

### Task 4: Remove migrated global CSS and wire canonical browser/visual gates

**Files:**
- Modify: `front/src/styles/globals.css`
- Modify: `front/package.json`
- Modify: `front/playwright.config.ts`
- Modify: `front/playwright-performance.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify tracked PNGs under `front/__screenshots__/**` only through the Docker update command.

- [ ] **Step 1: Capture the existing budget failure before cleanup.**

Run:

    corepack pnpm --dir front build
    corepack pnpm --dir front build:budget

Expected at the authority baseline: build succeeds and CSS hard budget may fail near 50KB gzip. Record exact current output; do not weaken the threshold.

- [ ] **Step 2: Write RED config/script tests.** Add package script `test:e2e:visual-authority-browsers`. Add generic Vite-only smoke mode and `firefox-admin`/`webkit-mobile-admin` projects that only match the new admin browser smoke. Preserve the existing host-only script as an alias.

- [ ] **Step 3: Remove only proven-dead migrated selectors.** Use call-site scans before deleting host Meeting Folio and old admin role selectors from `globals.css`. Keep member/public selectors and design-system imports untouched.

Run:

    rg -n 'meeting-folio|meeting-judgment|meeting-local-navigation|admin-today-ledger|admin-operations-queue|admin-operations-inspector' front/src/styles/globals.css front/features

Expected: any deleted selector has no active caller outside the new host/admin scoped styles.

- [ ] **Step 4: Update visual baselines serially.**

Run:

    corepack pnpm --dir front test:ct:update
    corepack pnpm --dir front test:ct

Expected: only approved host/admin PNG names change; no unrelated member/public baseline diff.

- [ ] **Step 5: Run cross-browser gate.**

Run:

    corepack pnpm --dir front test:e2e:visual-authority-browsers

Expected: Chromium, Firefox and mobile WebKit pass host Focus Deck plus admin Today, Clubs, Service and Review representative flows.

- [ ] **Step 6: Prove the budget without threshold change.**

Run:

    corepack pnpm --dir front performance:budget
    git diff -- front/tests/performance/build-budget.ts front/tests/performance/build-budget.test.ts

Expected: budget passes and the hard limits are unchanged.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `test(front): gate host admin visual authority`

### Task 5: Add admin ledger performance evidence without weakening host budgets

**Files:**
- Create: `front/shared/observability/admin-editorial-ledger-performance.ts`
- Create: `front/shared/observability/admin-editorial-ledger-performance.test.ts`
- Create: `front/tests/performance/admin-editorial-ledger-budget.ts`
- Create: `front/tests/performance/admin-editorial-ledger-budget.test.ts`
- Create: `front/tests/performance/admin-editorial-ledger-performance.spec.ts`
- Modify: `front/playwright-performance.config.ts`
- Modify: `front/package.json`
- Modify: `.github/workflows/ci.yml`

**Summary contract:**

    type AdminEditorialLedgerPerformanceSummary = {
      schema: "readmates.admin-editorial-ledger-performance.v1";
      syntheticCaseCount: 100;
      runCount: 5;
      metrics: {
        decodedJsonBytes: MetricSummary;
        routeDataToUsableMs: MetricSummary;
        filterToRafCommitMs: MetricSummary;
        caseSelectionToDocketCommitMs: MetricSummary;
        pollMergeToRafCommitMs: MetricSummary;
        forcedGcHeapDeltaBytes: MetricSummary;
      };
      passed: boolean;
    };

- [ ] **Step 1: Write RED unit tests.** Require five cold runs, 100 public-safe synthetic cases, finite nonnegative metrics and a failing summary when any limit is exceeded.

- [ ] **Step 2: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run shared/observability/admin-editorial-ledger-performance.test.ts tests/performance/admin-editorial-ledger-budget.test.ts

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement instrumentation and one deterministic browser spec.** Write only `front/output/performance/admin-editorial-ledger-summary.json`; do not include case IDs, club names, emails or raw evidence.

- [ ] **Step 4: Run host and admin budgets serially.**

Run:

    corepack pnpm --dir front test:host-workspace-performance
    corepack pnpm --dir front test:admin-editorial-ledger-performance
    corepack pnpm --dir front performance:budget

Expected: all pass; existing host thresholds are unchanged.

- [ ] **Step 5: Commit.**

Run: `git diff --check`

Commit: `perf(admin): budget the editorial ledger`

### Task 6: Prove negative provenance and protected-surface survival

**Files:**
- No implementation changes unless a proof fails.
- Any fix must return to the owning host/admin task and use a bounded fix commit.

- [ ] **Step 1: Prove ancestry and absence of wholesale integration.**

Run:

    git merge-base --is-ancestor d4aa0ec0230c920da03810cb29b7326ea1f7367f HEAD
    if git merge-base --is-ancestor e9386c81 HEAD; then exit 1; fi
    git log --format='%H %P %s' d4aa0ec0230c920da03810cb29b7326ea1f7367f..HEAD
    git log --merges --ancestry-path d4aa0ec0230c920da03810cb29b7326ea1f7367f..HEAD
    git cherry -v HEAD codex/admin-site-tone-redesign
    git diff --name-status d4aa0ec0230c920da03810cb29b7326ea1f7367f..HEAD

Expected: old branch head is not an ancestor; merge commits name only current-main practice integrations; diff matches the three plan allowlists.

- [ ] **Step 2: Scan for rejected provenance.**

Run:

    new_patch_ids=$(git log --no-merges --format=%H d4aa0ec0230c920da03810cb29b7326ea1f7367f..HEAD | while read -r integration_commit; do git show --pretty=format: "$integration_commit" | git patch-id --stable; done | awk '{print $1}')
    for old_admin_commit in e70714ec a4aeaeb8 088acd4f 12b45d60 70149f5b 2c9d8538 99939325 e9386c81 9c39901c 82cd77db 62b01233; do old_patch_id=$(git show --pretty=format: "$old_admin_commit" | git patch-id --stable | awk '{print $1}'); if printf '%s\n' "$new_patch_ids" | rg -qx "$old_patch_id"; then exit 1; fi; done
    if git log --format='%B' d4aa0ec0230c920da03810cb29b7326ea1f7367f..HEAD | rg -n 'cherry picked from commit|e70714ec|a4aeaeb8|088acd4f|12b45d60|70149f5b|2c9d8538|99939325|e9386c81|9c39901c|82cd77db|62b01233'; then exit 1; fi
    if git diff d4aa0ec0230c920da03810cb29b7326ea1f7367f..HEAD -- front | rg -n 'role.*(replay|export|takedown)|legacy-domain|platform-admin-onboarding-result|meeting-folio|glassmorphism|box-shadow:.*glow'; then exit 1; fi
    git diff --stat d4aa0ec0230c920da03810cb29b7326ea1f7367f..HEAD -- front/src/styles/globals.css

Expected: no patch-equivalent old commit, cherry-pick trailer/hash, role-derived authority, stale fixture/onboarding port, Meeting Folio authority or old global CSS bulk patch.

- [ ] **Step 3: Prove protected files survived.**

Run:

    git diff --name-status --diff-filter=D d4aa0ec0230c920da03810cb29b7326ea1f7367f..HEAD -- front/features/platform-admin/model/platform-admin-capabilities.ts front/features/platform-admin/api/platform-admin-capabilities-api.ts front/features/platform-admin/model/platform-admin-command-recovery.ts front/features/platform-admin/ui/admin-action-dock.tsx front/features/platform-admin/ui/admin-modal-dialog.tsx front/features/platform-admin/ui/admin-page-frame.tsx front/features/platform-admin/ui/admin-state-panel.tsx front/features/platform-admin/ui/admin-public-takedown-workbench.tsx front/tests/e2e/platform-admin-public-takedown.spec.ts front/tests/e2e/platform-admin-public-convergence.spec.ts front/tests/e2e/host-authority-loss.spec.ts front/tests/e2e/host-meeting-workspace-browser-smoke.spec.ts front/tests/e2e/host-session-record-revisions.spec.ts

Expected: empty output.

- [ ] **Step 4: Run protected focused tests.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-capabilities.test.ts features/platform-admin/model/platform-admin-command-recovery.test.ts features/platform-admin/ui/admin-action-dock.test.tsx features/platform-admin/ui/admin-modal-dialog.test.tsx features/platform-admin/ui/admin-page-frame.test.tsx features/platform-admin/ui/admin-state-panel.test.tsx
    corepack pnpm --dir front exec playwright test tests/e2e/platform-admin-public-takedown.spec.ts tests/e2e/platform-admin-public-convergence.spec.ts tests/e2e/host-authority-loss.spec.ts tests/e2e/host-meeting-workspace-browser-smoke.spec.ts tests/e2e/host-session-record-revisions.spec.ts --project=chromium

Expected: PASS.

### Task 7: Align the active design, architecture, release note and ADRs

**Files:**
- Create: `front/DESIGN.md`
- Create: `docs/reports/host-admin-visual-authority-accessibility-evidence-template.md`
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/adr/0044-host-focus-deck-primary-action-composition.md`
- Modify: `docs/development/adr/0045-host-admin-focus-deck-editorial-ledger-composition.md`
- Modify: `docs/development/adr/README.md`
- Modify: `docs/development/technical-decisions.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write active design from delivered code.** Document shared tokens, Focus Deck, Editorial Operations Ledger, state/error grammar, responsive/accessibility matrix and screenshot ownership. Do not describe unimplemented behavior.

- [ ] **Step 2: Replace the architecture transitional paragraph.** Focus Deck becomes active, not proposed; admin grammar names route-owned state and domain-owned commands without implying a shell mega-store.

- [ ] **Step 3: Record release-visible behavior in Unreleased.** Mention host visual authority, admin route consistency, exact permission fixes and no server contract change.

- [ ] **Step 4: Complete the evidence template honestly.** Mark automated checks with exact command/output. VoiceOver/Safari and NVDA/Chrome remain `not measured` unless a human actually performed them.

- [ ] **Step 5: Promote ADR-0044 and ADR-0045 only now.** Set both to `Accepted`; update both indexes. Do not change old ADR bodies beyond existing supersession links.

- [ ] **Step 6: Validate docs and public safety.**

Run:

    git diff --check -- front/DESIGN.md docs/development/architecture.md docs/development/adr/0044-host-focus-deck-primary-action-composition.md docs/development/adr/0045-host-admin-focus-deck-editorial-ledger-composition.md docs/development/adr/README.md docs/development/technical-decisions.md CHANGELOG.md
    ./scripts/build-public-release-candidate.sh
    ./scripts/public-release-check.sh .tmp/public-release-candidate

Expected: PASS; no local path, private value, member data or token-shaped example.

- [ ] **Step 7: Commit.**

Commit: `docs: accept host admin visual authority`

### Task 8: Whole-branch review, canonical gate and merge handoff

**Files:**
- Review all files in `origin/main..HEAD`.
- Fix only within the plan allowlists.

- [ ] **Step 1: Run independent whole-branch review.** Use `superpowers:requesting-code-review`. Review requirements, security/authority, route-first boundaries, visual hierarchy, mobile completion, negative provenance and release readiness. Critical/Important findings must be fixed and re-reviewed with a bounded maximum of two waves.

- [ ] **Step 2: Run the canonical gate serially.**

Run:

    corepack pnpm --dir front lint
    corepack pnpm --dir front test
    corepack pnpm --dir front test:coverage
    corepack pnpm --dir front build
    corepack pnpm --dir front test:ct
    corepack pnpm --dir front test:e2e
    corepack pnpm --dir front test:e2e:visual-authority-browsers
    corepack pnpm --dir front test:host-workspace-performance
    corepack pnpm --dir front test:admin-editorial-ledger-performance
    corepack pnpm --dir front performance:budget

Expected: every command PASS. Report any unavailable command as skipped; never infer a pass.

- [ ] **Step 3: Run final branch/release review.**

Run:

    git status --short --branch
    git diff --check origin/main..HEAD
    git log --oneline origin/main..HEAD
    git diff --stat origin/main..HEAD
    git diff --name-only origin/main..HEAD

Apply `docs/development/release-readiness-review.md`. Confirm CHANGELOG, CI/deploy non-impact, security hygiene, architecture baselines, public release safety and operator-visible behavior.

- [ ] **Step 4: Re-run Task 6 provenance after the last fix.** Source hashes and old-branch ancestry must still satisfy the gate.

- [ ] **Step 5: Use `superpowers:finishing-a-development-branch`.** Present the verified integration choice. If local main merge is authorized, merge `codex/readmates-host-admin-visual-authority` into local `main`, re-run the smallest merged-path gate, and leave push/deploy untouched.

Expected handoff: exact commits, exact commands, automated/manual/not-measured evidence, remaining risks, ADR impact `supersede` with ADR-0044/0045 Accepted, and explicit local-vs-remote state.
