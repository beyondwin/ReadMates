# ReadMates Host Focus Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host 전 표면을 승인된 quiet editorial 톤으로 통일하고, 현재 모임 detail을 원 시안의 Focus Deck으로 복원하면서 record-readiness, revision/CAS, receipt, recovery, authority-loss, public convergence 계약을 그대로 보존한다.

**Architecture:** 기존 `HostMeetingWorkspaceRoute`가 auth, base detail, URL, panel query, mutation/reconciliation과 authority purge를 계속 소유한다. 기존 `HostSessionEditor`, `HostSessionWorkspace`, `WorkspaceFocusCard`, `WorkspacePanel`, `WorkspaceUndoBar`를 page-level Focus Deck으로 승격하고 바깥 Meeting Folio local navigation/judgment rail만 제거한다. CLOSED/PUBLISHED direct overview는 기존 record editor query를 lifecycle-aware prerequisite로 읽으며, model은 readiness discriminated union을 받아 primary action과 3-5개의 실제 사실을 계산한다. Home/list/new/member/notification route는 Focus Deck을 복제하지 않고 같은 scoped editorial styles와 route-specific grammar를 쓴다.

**Tech Stack:** React 19, React Router 8, TanStack Query v5, TypeScript 6, Vite 8, Vitest, Testing Library, Playwright CT/E2E.

**Spec:** `docs/superpowers/specs/2026-08-26-readmates-host-admin-visual-authority-and-integration-design.md`

ADR impact: supersede — ADR-0020, ADR-0027, ADR-0044, ADR-0045

## Global Constraints

- ADR impact는 `supersede`; ADR-0044/0045는 이 plan 단독 완료 시에도 `Proposed`다. 공통 integration plan의 docs closeout 전에는 승격하지 않는다.
- Authority commit `d4aa0ec0230c920da03810cb29b7326ea1f7367f`와 공통 foundation task가 실행 branch의 조상이어야 한다.
- Host detail의 page-level 시각 권위는 header → `지금 할 일` → 3-5개의 실제 사실 → 관련 작업 → undo/recovery → 선택 panel이다.
- Meeting Folio masthead/local task navigation/judgment rail을 primary composition에서 제거한다. 정보와 동작은 버리지 말고 Focus Deck fact/related-work/panel로 이동한다.
- DRAFT, OPEN, meeting-day, overdue OPEN, CLOSED without record, CLOSED draft/ready, PUBLISHED, trash가 같은 composition을 쓴다.
- Host status label은 정확히 `모임 작성 중`, `멤버와 준비 중`, `기록 정리 중`, `공개 완료`다. Server lifecycle enum은 바꾸지 않는다.
- 참석 응답과 실제 출석, lifecycle과 audience/public placement를 하나의 stepper나 완료율로 합치지 않는다.
- Record facts가 필요한 CLOSED primary action은 `pending|ready|stale|unavailable`을 구분한다. unknown을 false로 내려 `UPLOAD_RECORD`나 `PUBLISH_RECORD`를 노출하지 않는다.
- PUBLISHED는 readiness 실패 때문에 upload/publish로 되돌아가지 않는다. Public state, last receipt, convergence와 revision 진입만 표시한다.
- Existing `hostSessionRecordEditorQuery`와 query key를 재사용한다. Server/API/BFF/migration/contract를 변경하지 않는다.
- Base loader는 auth/scope/base detail만 읽는다. Record prerequisite는 route query이고 record panel/history/notification UI는 계속 lazy-load한다.
- Existing URL `section=basic|responses|attendance|records|notifications|history`, `source=manual|ai|json`, legacy `aigen`/`records=json`, hash와 unrelated params를 보존한다.
- Existing lifecycle actions, revision/CAS, idempotency identity/receipt, history restore, trash, undo, authority-loss purge, public convergence handler를 재구현하지 않는다. 기존 controller를 prop으로 연결한다.
- Primary CTA는 한 media mode에서 하나만 보이고 desktop/mobile 복제 control은 같은 callback/disabled reason을 사용한다. Mobile sticky CTA는 safe area를 존중한다.
- Panel은 sheet/focus trap/Escape/focus restore를 기존 `WorkspacePanel`로 제공한다. Desktop-only 기능은 금지한다.
- Home/list/new/member/notification은 Focus Deck 구조를 강제하지 않는다. 각 route의 목록·form·ledger 의미를 유지하고 typography, rule, spacing, state grammar만 정렬한다.
- Host scoped CSS만 `front/features/host/**`에 추가/수정한다. `front/src/styles/globals.css`, shared mobile CSS, Playwright config/package/CI는 integration owner 경로다.
- 새 role palette, glass/glow, excessive card, decorative book skeuomorphism을 만들지 않는다.
- 320px, 긴 Korean/English, 200% zoom, keyboard/focus, reduced motion, live-region 중복을 테스트한다.
- 각 task는 RED → 최소 GREEN → focused regression → independent review → bounded fix → `git diff --check` → commit 순서다.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Host home/list/new/member/notification editorial tone | 1 |
| Record-readiness fail-closed | 2-3 |
| Focus Deck primary composition | 2, 4 |
| Remove local task nav/judgment rail without feature loss | 4 |
| URL/deep link/panel/focus restoration | 5 |
| Revision/CAS/receipt/recovery/trash survival | 3-5 |
| Responsive/visual/cross-browser proof | 6 |
| Active docs and ADR acceptance | Integration program Task 7 |

## Dependency Order

`1 → 2 → 3 → 4 → 5 → 6`. Tasks 3-5 share route/editor state and must be serial. Task 6 is the only host task that updates tracked host visual baselines.

## Acceptance-Matrix Selection

- Selected: actor/authorization, meeting lifecycle, async/cache/provider, public projection convergence, UI/runtime state.
- Adjacent checks: existing host authority-loss, record revision/preview, public convergence, trash/recovery and frontend-boundary tests.
- Excluded: server/BFF/API schema, database/migration, OAuth, notification send, provider call, deploy. Current contracts are survival targets only.

## File Responsibility Map

| Responsibility | Files |
| --- | --- |
| Route-specific host tone | Create `front/features/host/ui/host-editorial-ledger.css`; modify host dashboard/list/new/member/notification route/UI tests named in Task 1 |
| Readiness mapper | Create `front/features/host/model/host-meeting-record-readiness.ts` and `front/features/host/model/host-meeting-record-readiness.test.ts` |
| Primary model | Modify `front/features/host/model/host-session-workspace-model.ts` and `front/features/host/model/host-session-workspace-model.test.ts` |
| Query orchestration | Modify `front/features/host/queries/host-meeting-panel-queries.ts` and create/modify its test |
| Route composition | Modify `front/features/host/route/host-meeting-workspace-route.tsx`, `front/features/host/route/host-meeting-workspace-route.test.tsx`, `front/features/host/route/host-meeting-workspace.css` |
| Focus UI | Modify `front/features/host/ui/meeting-workspace/host-meeting-workspace.tsx` and `front/features/host/ui/meeting-workspace/host-meeting-workspace.test.tsx`; create the exact facts/related-work files in Task 4 |
| Existing action plumbing | Modify only as Task 4 tests require: `front/features/host/ui/host-session-editor.tsx`, `front/features/host/route/host-session-editor-route.tsx`, `front/features/host/route/host-session-editor-route.test.tsx` |
| Browser evidence | Modify host CT/browser/E2E specs; do not edit Playwright config/package/CI |

---

### Task 1: Align the host shell, home, list and forms to the editorial authority

**Files:**
- Create: `front/features/host/ui/host-editorial-ledger.css`
- Modify: `front/features/host/route/host-dashboard-route.tsx`
- Modify: `front/features/host/route/host-dashboard-route.test.tsx`
- Modify: `front/features/host/ui/meeting-ledger/host-meeting-ledger.tsx`
- Modify: `front/features/host/ui/meeting-ledger/host-meeting-ledger.test.tsx`
- Modify: `front/features/host/route/host-meeting-list-route.tsx`
- Modify: `front/features/host/ui/meeting-list/host-meeting-list.tsx`
- Modify: `front/features/host/ui/meeting-list/host-meeting-list.test.tsx`
- Modify: `front/features/host/route/new-host-meeting-route.tsx`
- Modify: `front/features/host/ui/new-meeting/new-host-meeting-page.tsx`
- Modify: `front/features/host/ui/new-meeting/new-host-meeting-page.test.tsx`
- Modify only for scoped style import/composition: `front/features/host/route/host-members-route.tsx`, `front/features/host/route/host-notifications-route.tsx`, `front/tests/unit/host-members.test.tsx`, `front/tests/unit/host-notifications.test.tsx`, `front/tests/unit/host-notifications-ui-boundary.test.ts`.

**Visual contract:**

- Home owns next meeting identity and one next-action link, followed by attention evidence.
- List owns meeting-to-meeting search/browse, lifecycle statement, public/attention facts and pagination.
- New owns one editable form flow; AI/import suggestions remain optional, editable and never auto-submit.
- Member/notification surfaces keep their domain ledger and command guard; only page context, spacing, typography, state panel and responsive rhythm change.

- [ ] **Step 1: Write RED characterization tests.** Assert each route has one page heading, one concrete primary route action, no duplicate page tabs, honest loading/empty/error state, 44px actions and no inline style additions. Assert the new form does not auto-submit or force AI.

- [ ] **Step 2: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/host/route/host-dashboard-route.test.tsx features/host/ui/meeting-ledger/host-meeting-ledger.test.tsx features/host/ui/meeting-list/host-meeting-list.test.tsx features/host/ui/new-meeting/new-host-meeting-page.test.tsx

Expected: FAIL on the new editorial landmarks/classes and state grammar.

- [ ] **Step 3: Add the scoped stylesheet and minimal semantic wrappers.** Import it from the host feature route entry points, not `main.tsx`. Reuse design-system variables. Move inline presentational styles in touched paths into scoped classes.

- [ ] **Step 4: Preserve route/data behavior.** Do not change loaders, list cursor recovery, record attention query, member actions, notification mutation/controller or new-session mutation semantics.

- [ ] **Step 5: Run GREEN and boundaries.**

Run:

    corepack pnpm --dir front exec vitest run features/host/route/host-dashboard-route.test.tsx features/host/ui/meeting-ledger/host-meeting-ledger.test.tsx features/host/ui/meeting-list/host-meeting-list.test.tsx features/host/ui/new-meeting/new-host-meeting-page.test.tsx
    corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts

Expected: PASS.

- [ ] **Step 6: Review and commit.**

Run: `git diff --check`

Commit: `refactor(host): align host routes to the editorial ledger`

### Task 2: Model record readiness and actual Focus Deck facts

**Files:**
- Create: `front/features/host/model/host-meeting-record-readiness.ts`
- Create: `front/features/host/model/host-meeting-record-readiness.test.ts`
- Modify: `front/features/host/model/host-session-workspace-model.ts`
- Modify: `front/features/host/model/host-session-workspace-model.test.ts`

**Interfaces:**

    export type HostMeetingRecordFacts = {
      hasDraft: boolean;
      draftLiveBaseStale: boolean;
      validationIssueCount: number;
      hasAppliedRecord: boolean;
      publicationReady: boolean;
    };

    export type HostMeetingRecordReadiness =
      | { status: "not-required" }
      | { status: "pending" }
      | { status: "ready"; facts: HostMeetingRecordFacts; observedAt: string }
      | { status: "stale"; facts: HostMeetingRecordFacts; observedAt: string; retryable: true }
      | { status: "unavailable"; observedAt: string | null; retryable: true };

    export type HostFocusFact = {
      id: "identity" | "responses" | "attendance" | "record" | "publication";
      label: string;
      tone: "neutral" | "attention" | "ready" | "complete";
      relatedTask?: HostMeetingTask;
    };

    export type HostMeetingPrimaryAction = {
      kind: string;
      label: string;
      task: HostMeetingTask;
      disabled: boolean;
      reason?: string;
    };

    export type HostMeetingWorkspaceInput = {
      currentUrl: string | URL;
      state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
      meetingDate: string;
      today: string;
      unansweredResponseCount: number;
      unknownAttendanceCount: number;
      recordReadiness: HostMeetingRecordReadiness;
    };

    export type HostMeetingWorkspaceView = {
      lifecycle: HostMeetingWorkspaceInput["state"];
      statusLabel: "모임 작성 중" | "멤버와 준비 중" | "기록 정리 중" | "공개 완료";
      primaryAction: HostMeetingPrimaryAction;
      facts: readonly HostFocusFact[];
      relatedTasks: readonly HostMeetingTaskLink[];
      publicationReady: boolean | null;
    };

- [ ] **Step 1: Write mapper RED tests.** Map existing `HostSessionRecordEditor`: draft presence, `draftLiveBaseStale`, validation issue count, `liveRevision > 0`, and publication readiness. No new API field is allowed.

- [ ] **Step 2: Write primary-action RED matrix.** Cover DRAFT, OPEN before/day/overdue, CLOSED readiness pending/ready/stale/unavailable and PUBLISHED. Assert pending/stale/unavailable CLOSED never returns upload/fix/review/publish mutation; PUBLISHED always remains view-public/new-revision oriented.

- [ ] **Step 3: Require facts, not progress steps.** Assert 3-5 sentences, no ordinal index, no percentage, no `done/current/next` state, and separate response/attendance/publication facts.

- [ ] **Step 4: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/host/model/host-meeting-record-readiness.test.ts features/host/model/host-session-workspace-model.test.ts

Expected: FAIL on missing mapper/readiness union and existing boolean-default primary logic.

- [ ] **Step 5: Implement pure mapping.** Replace the five record booleans in `HostMeetingWorkspaceInput` with `recordReadiness`. Keep the existing lifecycle action order for `ready`. Return disabled `다음 할 일 확인 중` for pending and a retry/freshness reason for stale/unavailable. Rename page navigation `tasks` to secondary `relatedTasks` after every caller migrates.

- [ ] **Step 6: Remove only obsolete Meeting Folio model output after route consumers migrate.** Until Task 4, keep a typed compatibility adapter rather than maintaining two independent primary-action algorithms.

- [ ] **Step 7: Run GREEN and commit.**

Run:

    corepack pnpm --dir front exec vitest run features/host/model/host-meeting-record-readiness.test.ts features/host/model/host-session-workspace-model.test.ts
    git diff --check

Commit: `feat(host): model Focus Deck readiness and facts`

### Task 3: Load lifecycle-aware record prerequisites without blocking the meeting

**Files:**
- Modify: `front/features/host/queries/host-meeting-panel-queries.ts`
- Modify: `front/features/host/queries/host-meeting-panel-queries.test.tsx`
- Modify: `front/features/host/route/host-meeting-workspace-route.tsx`
- Modify: `front/features/host/route/host-meeting-workspace-route.test.tsx`

**Query contract:**

    useHostMeetingPanelQueries({
      task,
      sessionId,
      context,
      recordPrerequisite,
    });

`recordQuery.enabled = recordPrerequisite || task === "records" || task === "history"`. History and notification queries remain task-only. Route sets `recordPrerequisite` for CLOSED and PUBLISHED after base detail is ready.

- [ ] **Step 1: Write query RED tests.** DRAFT/OPEN overview makes zero record calls. CLOSED/PUBLISHED overview makes one editor call. Opening records reuses the same query key/cache. History and dispatch remain unopened.

- [ ] **Step 2: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/host/queries/host-meeting-panel-queries.test.tsx

Expected: FAIL because record query is only task-enabled.

- [ ] **Step 3: Implement prerequisite enabling and observation state.** Use query `dataUpdatedAt` for observed time. Pending preserves meeting identity/unrelated navigation. Stale/unavailable keeps last safe facts when present, exposes retry, and locks publication/overwrite.

- [ ] **Step 4: Write route RED tests.** Direct CLOSED overview must show pending label/disabled action before readiness. A 503 keeps meeting header and unrelated links. Cached-then-refetch failure shows observed time and retry. Ready chooses exact action. PUBLISHED never shows upload/publish.

- [ ] **Step 5: Preserve authority and recovery.** On 403 use existing host purge/guest handoff. Do not auto-retry mutation. Do not edit `host-meeting-workspace-actions.ts`, record contracts/API or loader unless a focused failing test proves required plumbing.

- [ ] **Step 6: Run GREEN and regression.**

Run:

    corepack pnpm --dir front exec vitest run features/host/queries/host-meeting-panel-queries.test.tsx features/host/route/host-meeting-workspace-route.test.tsx
    corepack pnpm --dir front exec vitest run src/app/host-authority-loss-controller.test.tsx src/app/host-session-editor-authority-navigation.test.tsx

Expected: PASS.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `feat(host): load lifecycle record prerequisites`

### Task 4: Promote the Focus Deck to the page-level composition

**Files:**
- Modify: `front/features/host/ui/meeting-workspace/host-meeting-workspace.tsx`
- Modify: `front/features/host/ui/meeting-workspace/host-meeting-workspace.test.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-focus-facts.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-focus-facts.test.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-related-work.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-related-work.test.tsx`
- Modify: `front/features/host/ui/session-workspace/host-session-workspace.tsx`
- Modify: `front/features/host/ui/session-workspace/host-session-workspace.test.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify only for prop plumbing: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/route/host-meeting-workspace.css`
- Delete after call-site scan: `front/features/host/ui/meeting-workspace/meeting-local-navigation.tsx`, `front/features/host/ui/meeting-workspace/meeting-local-navigation.test.tsx`, `front/features/host/ui/meeting-workspace/meeting-local-navigation.ct.tsx`.
- Delete after call-site scan: `front/features/host/ui/meeting-workspace/meeting-judgment-rail.tsx`, `front/features/host/ui/meeting-workspace/meeting-judgment-rail.test.tsx`.

**Composition props:**

    type HostMeetingWorkspaceProps = {
      view: HostMeetingWorkspaceView;
      header: WorkspaceHeaderModel;
      facts: readonly HostFocusFact[];
      focusContent?: ReactNode;
      relatedWork?: ReactNode;
      recordReadiness?: HostMeetingRecordReadiness;
      panel?: ReactNode;
      recovery?: ReactNode;
      onPrimaryAction: () => void;
      onRetryReadiness?: () => void;
    };

- [ ] **Step 1: Write component RED tests.** Assert no `현재 모임 작업` page navigation, no judgment complementary rail, exactly one visible primary CTA per viewport, and DOM order header → 지금 할 일 → facts → related work → recovery → panel.

- [ ] **Step 2: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/host/ui/meeting-workspace/host-meeting-workspace.test.tsx features/host/ui/meeting-workspace/meeting-focus-facts.test.tsx features/host/ui/meeting-workspace/meeting-related-work.test.tsx features/host/ui/session-workspace/host-session-workspace.test.tsx

Expected: FAIL because outer Meeting Folio still owns navigation/judgment.

- [ ] **Step 3: Recompose, do not duplicate controllers.** Promote the existing inner `HostSessionWorkspace`; wire `HostSessionEditor` record/lifecycle/attendance/history/undo callbacks directly. Remove `embeddedInMeetingFolio` only after all callers use the canonical Focus Deck.

- [ ] **Step 4: Rehome every removed fact.** Task badges become fact sentences or related-work labels. Judgment projections become audience/public facts. Notifications and history remain secondary panel links. No fact disappears without a test mapping it.

- [ ] **Step 5: Implement scoped CSS.** Use max-width, `minmax(0, 1fr)`, rules, 16-24px rhythm, 44px controls, visible focus, `env(safe-area-inset-bottom)`, reduced motion. Do not touch global CSS.

- [ ] **Step 6: Run GREEN, call-site and boundary scans.**

Run:

    corepack pnpm --dir front exec vitest run features/host/ui/meeting-workspace/host-meeting-workspace.test.tsx features/host/ui/meeting-workspace/meeting-focus-facts.test.tsx features/host/ui/meeting-workspace/meeting-related-work.test.tsx features/host/ui/session-workspace/host-session-workspace.test.tsx features/host/route/host-session-editor-route.test.tsx
    rg -n 'MeetingLocalNavigation|MeetingJudgmentRail|embeddedInMeetingFolio' front/features/host
    corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts

Expected: PASS; scan has no active page-level caller. Any remaining symbol is a migration test explicitly removed in this task.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `feat(host): promote the Focus Deck composition`

### Task 5: Preserve panels, deep links, recovery and mobile completion

**Files:**
- Modify: `front/features/host/route/host-meeting-workspace-route.tsx`
- Modify: `front/features/host/route/host-meeting-workspace-route.test.tsx`
- Modify: `front/features/host/ui/session-workspace/workspace-panel.tsx`
- Create: `front/features/host/ui/session-workspace/workspace-panel.test.tsx`
- Modify: `front/features/host/ui/session-workspace/workspace-undo-bar.tsx`
- Modify: `front/features/host/ui/session-workspace/workspace-trash-tombstone.test.tsx`
- Modify focused E2E expectations in `front/tests/e2e/host-meeting-workspace.spec.ts` and `front/tests/e2e/host-club-operations.spec.ts`.

- [ ] **Step 1: Write RED navigation tests.** Direct info/attendance/records/history/notification links open the matching panel. Escape closes and restores originating control. Back/Forward restores section, source, filter and focus. Panel failure leaves Focus Deck and sibling links usable.

- [ ] **Step 2: Write RED recovery tests.** 409 shows latest values and requires reconfirmation; response loss queries authoritative state/receipt; authority loss purges sensitive drafts and does not auto-retry; trash restore conflict and 7-day copy stay intact.

- [ ] **Step 3: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/host/route/host-meeting-workspace-route.test.tsx features/host/ui/session-workspace/workspace-panel.test.tsx features/host/ui/session-workspace/workspace-trash-tombstone.test.tsx

Expected: FAIL on the new originating-focus and composition expectations, not on removed domain behavior.

- [ ] **Step 4: Implement route-owned panel state only.** Keep parser/builder contracts. Update focus target when related work opens a panel. Do not add a global store or duplicate query.

- [ ] **Step 5: Run focused browser regression.**

Run:

    corepack pnpm --dir front exec playwright test tests/e2e/host-meeting-workspace.spec.ts --project=chromium
    corepack pnpm --dir front exec playwright test tests/e2e/host-club-operations.spec.ts --project=chromium --grep 'DRAFT workspace|OPEN before|OPEN meeting day|CLOSED JSON|recovery|trash tombstone|workspace viewports|keyboard'

Expected: PASS.

- [ ] **Step 6: Commit.**

Run: `git diff --check`

Commit: `feat(host): preserve Focus Deck panel recovery`

### Task 6: Lock the Focus Deck visual, browser and performance evidence

**Files:**
- Create: `front/features/host/ui/meeting-workspace/host-focus-deck.fixtures.ts`
- Replace: `front/features/host/ui/meeting-workspace/host-meeting-workspace.ct.tsx` with `host-focus-deck.ct.tsx`
- Update host-only tracked baselines under `front/__screenshots__/features/host/**` through Docker CT update.
- Modify: `front/tests/e2e/host-meeting-workspace-browser-smoke.spec.ts`
- Modify: `front/tests/e2e/host-meeting-workspace.spec.ts`
- Modify: `front/tests/performance/host-meeting-workspace-budget.test.ts` only if the delivered composition changes an asserted host metric; never change thresholds without evidence.

**Tracked baseline names:**

- `focus-deck-draft-1440.png`
- `focus-deck-open-900.png`
- `focus-deck-closed-768.png`
- `focus-deck-published-390.png`
- `focus-deck-readiness-pending-320.png`

- [ ] **Step 1: Replace transient screenshots with screenshot assertions.** Use public-safe fixture data, long Korean/English, reduced motion and the shared viewport contract. Remove Meeting Folio names/assertions.

- [ ] **Step 2: Run RED visual verify before update.**

Run:

    corepack pnpm --dir front test:ct

Expected: FAIL only for missing/new host Focus Deck baselines.

- [ ] **Step 3: Generate and review baselines serially.**

Run:

    corepack pnpm --dir front test:ct:update
    corepack pnpm --dir front test:ct

Expected: PASS after visual inspection; no admin/member/public PNG change in this host task.

- [ ] **Step 4: Run cross-browser host smoke and performance.**

Run:

    corepack pnpm --dir front test:e2e:host-workspace-browsers
    corepack pnpm --dir front test:host-workspace-performance

Expected: PASS in Chromium, Firefox and mobile WebKit; existing host budget remains green.

- [ ] **Step 5: Run complete host focused gate.**

Run:

    corepack pnpm --dir front exec vitest run features/host/model/host-meeting-record-readiness.test.ts features/host/model/host-session-workspace-model.test.ts features/host/queries/host-meeting-panel-queries.test.tsx features/host/route/host-meeting-workspace-route.test.tsx features/host/ui/meeting-workspace/host-meeting-workspace.test.tsx features/host/ui/session-workspace/host-session-workspace.test.tsx
    corepack pnpm --dir front lint
    corepack pnpm --dir front build

Expected: PASS.

- [ ] **Step 6: Independent host review.** Use `superpowers:requesting-code-review`; require no Critical/Important issue on Focus Deck authority, readiness fail-closed, action/recovery survival, mobile completion and file allowlist. Fix at most two bounded waves.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `test(host): lock Focus Deck responsive workflows`

## Host Plan Handoff

Before returning to the integration program, report:

- the six task commits and exact files outside the allowlist, which must be empty;
- readiness matrix results and whether any state remains `not measured`;
- exact Vitest, CT, Chromium, Firefox, WebKit and performance commands;
- preserved authority-loss, CAS/revision, receipt, trash and public convergence evidence;
- ADR-0044/0045 still `Proposed`;
- no server/BFF/API/migration, live send, provider or deploy work.
