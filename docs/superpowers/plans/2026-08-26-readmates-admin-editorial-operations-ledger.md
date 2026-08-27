# ReadMates Admin Editorial Operations Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/**` 전체를 근거를 읽고 판단을 기록하는 Editorial Operations Ledger로 통일하고, Today polling·selection·mobile recovery를 안정화하며, notification replay·analytics export·public takedown을 서버 exact capability와 command safety 등급에 맞게 교정한다.

**Architecture:** ADR-0039의 Today/Clubs/Service/Review primary area와 route-first dependency를 유지한다. 공통 UI primitive는 page context, work view, evidence ledger, case docket, safe action dock, receipt timeline을 props/callback only로 제공한다. Route가 URL, query, capability, mutation, authority-loss purge와 reconciliation을 소유한다. Today는 server-owned `allowedActions`로 L1 lifecycle을 수행하고 polling snapshot model로 표시 순서와 최신 evidence를 분리한다. Domain route는 실제 command/receipt가 있을 때만 L2/L3 component를 조합한다. 오래된 redesign branch는 pure model/test invariant만 current contract에서 다시 구현한다.

**Tech Stack:** React 19, React Router 8, TanStack Query v5, TypeScript 6, Vite 8, Vitest, Testing Library, Playwright CT/E2E.

**Spec:** `docs/superpowers/specs/2026-08-26-readmates-host-admin-visual-authority-and-integration-design.md`

ADR impact: supersede — ADR-0020, ADR-0027, ADR-0044, ADR-0045

## Global Constraints

- ADR impact는 `supersede`; ADR-0045는 host plan과 공통 integration closeout이 끝나기 전 `Proposed`다.
- Authority commit `d4aa0ec0230c920da03810cb29b7326ea1f7367f`와 공통 foundation task가 실행 branch의 조상이어야 한다.
- Primary area는 오늘, 클럽, 서비스, 검토를 유지한다. 새 dashboard/area를 만들지 않는다.
- Shell은 navigation, breadcrumb, account/workspace context와 onboarding modal boundary만 소유한다. Domain operations/summary를 preload/poll하는 mega-store가 되지 않는다.
- 일반 read/action은 `platform-admin-capabilities.ts`의 exact capability projection을 쓴다. OWNER/OPERATOR/SUPPORT role 이름에서 권한을 파생하지 않는다.
- Today lifecycle action authority는 selected case의 server-owned `allowedActions`다. 가상의 manage capability나 role matrix를 추가하지 않는다.
- 실행 eligibility는 permission 외에도 target identity/state, source freshness, version/concurrency, preview expiry/consumption을 확인한다.
- L1은 authoritative list/detail/history로 결과를 증명한다. Receipt timeline을 만들지 않는다.
- L2는 existing preview/confirm/idempotency/receipt가 있을 때만 receipt timeline을 렌더링한다.
- L3 public takedown만 receipt/convergence/resume를 사용한다. 다른 route에 convergence를 꾸며내지 않는다.
- 403은 network retry state가 아니다. 민감 state, preview, reason, idempotency identity, result와 platform-admin cache를 purge하고 automatic retry를 금지한다.
- 409는 최신 evidence를 다시 읽고 사용자 재확인을 요구한다. Response loss는 성공/실패를 추측하거나 blind retry하지 않는다.
- Today polling은 selected row version/evidence와 counts/freshness를 즉시 갱신하되 기존 순서/focus를 이동하지 않는다. 새 WARNING/READY/INFO는 pending, 새 CRITICAL은 pending + polite one-time urgent notice다.
- Club list/detail와 audit selection은 URL/return state가 authority다. Same-origin `/admin/**` 외 return URL, unsafe focus, unbounded scroll을 거부한다.
- Support private search term과 sensitive audit target은 URL, storage, query key, receipt, log에 넣지 않는다.
- Existing `AdminActionDock`, `AdminModalDialog`, `AdminPageFrame`, `AdminStatePanel`, capability parser/API, command recovery, public takedown을 보존·확장한다.
- Admin scoped stylesheet는 `front/features/platform-admin/ui/admin-editorial-ledger.css` 하나가 소유하고 shell lazy import와 CT-local import만 사용한다. `front/src/styles/globals.css`, `front/src/main.tsx`, `front/playwright/index.tsx`, package/config/CI는 integration owner 경로다.
- Old branch의 auth, shell, fixture, onboarding, 899-line global CSS, action wiring을 복사하지 않는다. Commit hash는 provenance 설명과 test intent 표에서만 사용한다.
- 320px mobile은 queue → record → review → result의 전체 화면 흐름으로 끝나야 한다. Desktop two-column을 축소해 쌓지 않는다.
- 44px target, visible focus, reduced motion, Korean/English wrapping, loading/empty/stale/partial/forbidden/conflict/unknown-outcome/unavailable을 명시한다.
- 실제 알림 replay, public takedown, permission mutation, deploy, provider call을 실행하지 않는다. Synthetic interception fixture만 쓴다.
- 각 task는 RED → 최소 GREEN → focused regression → independent review → bounded fix → `git diff --check` → commit 순서다.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Shared page/state/evidence grammar | 1 |
| Saved view/search/pending-new and stable polling | 2-3 |
| Today allowedActions and L1 recovery | 3 |
| Clubs return state/onboarding safety | 4 |
| Health read-only evidence | 5 |
| Notification replay exact capability | 6 |
| AI L2 and takedown L3 integrity | 7 |
| Support/audit/analytics Review area | 8 |
| Responsive/visual/cross-browser evidence | 9 |
| CSS global cleanup, CI, performance, ADR/docs | Integration program Tasks 4-7 |

## Dependency Order

`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9`. All tasks share the admin scoped stylesheet and are serial. Common config/baseline update happens only after Task 9 in the integration program.

## Acceptance-Matrix Selection

- Selected: actor/authorization, cursor collection, async/cache/provider, public convergence survival, emergency public takedown survival, UI/runtime state.
- Adjacent high-risk: exact capability parser, command recovery, public takedown and public-convergence focused tests.
- Excluded: server/BFF/API schema, migration/persistence, OAuth, live operation/deploy. Current server contract remains source of truth and is not redesigned.

## Command Authority Matrix

| Route | Read authority | Action authority and level |
| --- | --- | --- |
| `/admin/today` | `VIEW_TODAY` | selected case `allowedActions`, L1 |
| `/admin/clubs` | `VIEW_CLUBS` | `CREATE_CLUB`, L2 onboarding |
| `/admin/clubs/:clubId` | `VIEW_CLUB_OPERATIONS` | `MANAGE_CLUBS`/`MANAGE_CLUB_DOMAINS`, current command levels |
| `/admin/health` | `VIEW_SERVICE_HEALTH` | none |
| `/admin/notifications` | `VIEW_NOTIFICATION_OPERATIONS` | `REPLAY_NOTIFICATIONS`, L2 |
| `/admin/ai-ops` | `VIEW_AI_OPERATIONS` | `MANAGE_AI_OPERATIONS`, L2 |
| `/admin/public-takedown` | `EMERGENCY_PUBLIC_TAKEDOWN` | same exact capability, L3 |
| `/admin/support` | `VIEW_SUPPORT` | `MANAGE_SUPPORT_ACCESS`, L2 |
| `/admin/audit` | `VIEW_AUDIT` | sensitive search only `VIEW_SENSITIVE_AUDIT` |
| `/admin/analytics` | `VIEW_ANALYTICS` | export only `EXPORT_ANALYTICS` |

## Old Branch Intent Mapping

| Old commit | Current-main re-expression |
| --- | --- |
| `e70714ec` | Task 2 work views, loaded-only search, frozen locator |
| `a4aeaeb8` | Task 2 displayed/latest/pending/urgent/removal snapshot |
| `088acd4f` | Tasks 1-3 work-view/search/filter controls |
| `12b45d60`, `70149f5b` | Tasks 1 and 3 semantic queue/evidence docket |
| `2c9d8538` | Task 9 tracked CT baseline intent |
| `99939325`, `e9386c81` | Tasks 3, 6-8 polling/recovery/capability-loss tests |
| `9c39901c` | Tasks 1 and 9 44px invariant |
| `82cd77db` | Task 3 mutation context/selection/background recovery |
| `62b01233` | Task 2 first-page polling/continuation/version monotonicity |

No old commit is cherry-picked and no old patch is copied wholesale.

---

### Task 1: Establish Editorial Operations Ledger primitives and a thin shell

**Files:**
- Create: `front/features/platform-admin/ui/admin-page-context.tsx`
- Create: `front/features/platform-admin/ui/admin-page-context.test.tsx`
- Create: `front/features/platform-admin/ui/admin-work-view-bar.tsx`
- Create: `front/features/platform-admin/ui/admin-work-view-bar.test.tsx`
- Create: `front/features/platform-admin/ui/admin-evidence-ledger.tsx`
- Create: `front/features/platform-admin/ui/admin-evidence-ledger.test.tsx`
- Create: `front/features/platform-admin/ui/admin-case-docket.tsx`
- Create: `front/features/platform-admin/ui/admin-case-docket.test.tsx`
- Create: `front/features/platform-admin/ui/admin-receipt-timeline.tsx`
- Create: `front/features/platform-admin/ui/admin-receipt-timeline.test.tsx`
- Create: `front/features/platform-admin/model/admin-route-state.ts`
- Create: `front/features/platform-admin/model/admin-route-state.test.ts`
- Create: `front/features/platform-admin/ui/admin-editorial-ledger.css`
- Modify: `front/features/platform-admin/ui/admin-action-dock.tsx`
- Modify: `front/features/platform-admin/ui/admin-action-dock.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-state-panel.tsx`
- Modify: `front/features/platform-admin/ui/admin-state-panel.test.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.test.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-data.ts`
- Modify: `front/features/platform-admin/route/admin-shell-data.test.ts`

**Interfaces:**

    export type AdminCommandLevel = "L1" | "L2" | "L3";
    export type AdminSafeActionState =
      | "ready" | "pending" | "stale" | "conflict"
      | "unknown-outcome" | "complete" | "forbidden";

    export type AdminWorkView = {
      id: string;
      label: string;
      count?: number | null;
    };

    export type AdminPageContextProps = {
      eyebrow?: ReactNode;
      heading: ReactNode;
      description?: ReactNode;
      freshness?: ReactNode;
      scope?: ReactNode;
      authority?: ReactNode;
      action?: ReactNode;
      children?: ReactNode;
    };

    export type AdminWorkViewBarProps = {
      views?: readonly AdminWorkView[];
      activeView?: string;
      onViewChange?: (id: string) => void;
      search?: {
        label: string;
        value: string;
        placeholder?: string;
        onChange: (value: string) => void;
      };
      filters?: ReactNode;
      pending?: {
        count: number;
        urgentCount: number;
        onApply: () => void;
      };
    };

    export type AdminEvidenceLedgerProps = {
      label: string;
      count?: number;
      state: AdminPageState;
      sources?: readonly AdminStateSource[];
      controls?: ReactNode;
      action?: ReactNode;
      children?: ReactNode;
    };

    export type AdminCaseDocketProps = {
      label: string;
      title: ReactNode;
      identity?: ReactNode;
      status?: ReactNode;
      evidence?: ReactNode;
      history?: ReactNode;
      related?: ReactNode;
      actions?: ReactNode;
    };

    export type AdminSafeActionDockProps = {
      level: AdminCommandLevel;
      authority: "allowed" | "denied";
      state: AdminSafeActionState;
      reason?: ReactNode;
      primary?: ReactNode;
      secondary?: ReactNode;
      status?: ReactNode;
    };

    export type AdminReceiptTimelineEntry = {
      key: string;
      label: ReactNode;
      state: "pending" | "succeeded" | "failed" | "unknown";
      occurredAt?: string;
      detail?: ReactNode;
    };

    export type AdminReceiptTimelineProps = {
      level: "L2" | "L3";
      receiptId: string;
      entries: readonly AdminReceiptTimelineEntry[];
      convergence?: ReactNode;
    };

    export type AdminRouteReturnState = {
      returnTo: string;
      focusId: string | null;
      scrollTop: number;
    };

    export function buildAdminDetailHref(
      detailPath: string,
      state: AdminRouteReturnState,
    ): string;

    export function parseAdminRouteReturnState(
      params: URLSearchParams,
      options: { fallback: string; allowedPath: string },
    ): AdminRouteReturnState;

- [ ] **Step 1: Write primitive RED tests.** L1 cannot render `AdminReceiptTimeline`; denied/stale/unknown-outcome action dock cannot trigger primary callback; docket is absent without a target; evidence ledger distinguishes empty/partial/stale; work-view pending CTA reports count and urgent count without moving focus.

- [ ] **Step 2: Write route-state RED tests.** Accept only same-origin `/admin/**`, bounded safe focus IDs and nonnegative bounded scroll. Reject external URL, different primary area when the caller allows only clubs, encoded control characters and negative/huge scroll.

- [ ] **Step 3: Write shell RED tests.** Loader/layout no longer prefetch or poll operation cases/summary for `AdminCommandStatus`. Shell still loads exact capabilities, navigation, breadcrumb, workspace switcher and onboarding authority. Authority loss closes/purges onboarding state.

- [ ] **Step 4: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-page-context.test.tsx features/platform-admin/ui/admin-work-view-bar.test.tsx features/platform-admin/ui/admin-evidence-ledger.test.tsx features/platform-admin/ui/admin-case-docket.test.tsx features/platform-admin/ui/admin-receipt-timeline.test.tsx features/platform-admin/ui/admin-action-dock.test.tsx features/platform-admin/ui/admin-state-panel.test.tsx features/platform-admin/model/admin-route-state.test.ts features/platform-admin/route/admin-shell-layout.test.tsx features/platform-admin/route/admin-shell-data.test.ts

Expected: FAIL on missing primitives/state parser and current shell domain preload.

- [ ] **Step 5: Implement props/callback-only primitives.** `AdminPageContext` composes existing `AdminPageFrame`; `AdminSafeActionDock` is the semantic use of existing `AdminActionDock`, not a duplicate mutation controller. Receipt timeline type accepts only L2/L3.

- [ ] **Step 6: Thin the shell.** Remove operations/summary query and `AdminCommandStatus` rendering from shell ownership. Keep the file if used elsewhere; do not delete it as provenance cleanup.

- [ ] **Step 7: Import scoped CSS lazily from shell layout.** Direct CT files import the same stylesheet themselves. Do not edit main/playwright global entries.

- [ ] **Step 8: Run GREEN and boundary tests.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-page-context.test.tsx features/platform-admin/ui/admin-work-view-bar.test.tsx features/platform-admin/ui/admin-evidence-ledger.test.tsx features/platform-admin/ui/admin-case-docket.test.tsx features/platform-admin/ui/admin-receipt-timeline.test.tsx features/platform-admin/ui/admin-action-dock.test.tsx features/platform-admin/ui/admin-state-panel.test.tsx features/platform-admin/model/admin-route-state.test.ts features/platform-admin/route/admin-shell-layout.test.tsx features/platform-admin/route/admin-shell-data.test.ts
    corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts

Expected: PASS.

- [ ] **Step 9: Commit.**

Run: `git diff --check`

Commit: `refactor(admin): establish editorial ledger primitives`

### Task 2: Model stable Today work views and polling snapshots

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-operations-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-operations-model.test.ts`
- Create: `front/features/platform-admin/model/platform-admin-operations-snapshot.ts`
- Create: `front/features/platform-admin/model/platform-admin-operations-snapshot.test.ts`

**Interfaces:**

    export type AdminOperationsWorkViewId =
      | "briefing" | "mine" | "snoozed" | "resolved-today";

    export type AdminOperationsSearchState = {
      caseId: string | null;
      mode: "list" | "detail";
      workView: AdminOperationsWorkViewId;
      query: string;
      filter: AdminOperationCaseFilter;
    };

    export type AdminOperationsSnapshot = {
      scopeKey: string;
      displayed: AdminOperationCasesResponse;
      latest: AdminOperationCasesResponse;
      pendingNewIds: readonly string[];
      urgentNewCriticalIds: readonly string[];
      pendingRemovalIds: readonly string[];
    };

- [ ] **Step 1: Write search/parser RED tests.** URL keys are `view`, `q`, `case`, `mode` plus current filters. Search only loaded records. Locator is assigned before search filtering and remains stable.

- [ ] **Step 2: Write immutable snapshot RED tests.** Existing ID order freezes; same ID takes max version; equal version takes latest list projection for `allowedActions`/evidence; missing row becomes pending removal; new noncritical rows become pending; new CRITICAL also becomes urgent; counts/sources/generatedAt update immediately.

- [ ] **Step 3: Write pagination/pending RED tests.** Explicit continuation appends immediately without applying concurrent first-page new rows. Retry preserves old rows/opaque cursor. Applying pending uses latest server priority order and updates selected/focus target explicitly.

- [ ] **Step 4: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-operations-model.test.ts features/platform-admin/model/platform-admin-operations-snapshot.test.ts

Expected: FAIL on missing work-view/search/snapshot functions.

- [ ] **Step 5: Implement pure functions only.** No React/router/query/window import. Do not mutate response arrays. Preserve current case summary allowlist and unknown safe copy.

- [ ] **Step 6: Run GREEN and commit.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-operations-model.test.ts features/platform-admin/model/platform-admin-operations-snapshot.test.ts
    git diff --check

Commit: `feat(admin): model stable operations work views`

### Task 3: Compose Today ledger, docket and L1 recovery

**Files:**
- Modify: `front/features/platform-admin/route/admin-today-data.ts`
- Modify: `front/features/platform-admin/route/admin-today-data.test.ts`
- Modify: `front/features/platform-admin/route/admin-today-route.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`
- Modify: `front/features/platform-admin/queries/platform-admin-operations-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-operations-queries.test.tsx`
- Create: `front/features/platform-admin/ui/admin-today-controls.tsx`
- Create: `front/features/platform-admin/ui/admin-today-controls.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-queue.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-queue.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-state-actions.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-state-actions.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.css`
- Modify: `front/tests/e2e/admin-today.spec.ts`, `admin-operations-command-center.spec.ts`.

**Route invariants:**

- Read gate `VIEW_TODAY`; lifecycle controls only from selected `allowedActions`.
- Selected list version newer than detail, non-authoritative source or pending removal locks action.
- Open confirmation is keyed by `caseId:version:allowedActions`; a changed key closes stale confirmation.
- Mutation captures `{caseId, version}`; a later selection never receives the old result message.
- L1 success completes only after list/detail/history authoritative refetch.
- Response loss enters `unknown-outcome` and reconciles list/detail/history; no automatic repeated mutation.
- Mobile URL is `?case=<id>&mode=detail`; Back returns to list and restores row focus/scroll.

- [ ] **Step 1: Write RED route/query tests.** Cover stable polling merge, selected version update in place, stale action lock, source freshness update, pending-new, one-time polite critical notice, apply pending, continuation retry and background failure preserving last-known-good.

- [ ] **Step 2: Write RED authority/recovery tests.** SUPPORT with empty `allowedActions` cannot mutate even if role is renamed; OWNER with empty `allowedActions` also cannot. 403 purges platform-admin state. 409 refetches and requires reconfirmation. Response loss performs zero blind retry.

- [ ] **Step 3: Write RED UI/mobile tests.** Desktop persistent ledger+docket; mobile list/detail route; no stacked two columns at 768; `목록으로` focus then original row focus; 44px; long safe ID wraps; no nested live region.

- [ ] **Step 4: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-today-data.test.ts features/platform-admin/route/admin-today-route.test.tsx features/platform-admin/queries/platform-admin-operations-queries.test.tsx features/platform-admin/ui/admin-today-controls.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-operations-inspector.test.tsx features/platform-admin/ui/admin-operation-mobile-detail.test.tsx features/platform-admin/ui/admin-operation-state-actions.test.tsx

Expected: FAIL on new snapshot/URL/L1 semantics.

- [ ] **Step 5: Implement route-owned snapshot and URL state.** UI receives view/state/callbacks only. Keep source retry separate from lifecycle mutation.

- [ ] **Step 6: Run GREEN and Chromium flows.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-today-data.test.ts features/platform-admin/route/admin-today-route.test.tsx features/platform-admin/queries/platform-admin-operations-queries.test.tsx features/platform-admin/ui/admin-today-controls.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-operations-inspector.test.tsx features/platform-admin/ui/admin-operation-mobile-detail.test.tsx features/platform-admin/ui/admin-operation-state-actions.test.tsx
    corepack pnpm --dir front exec playwright test tests/e2e/admin-today.spec.ts tests/e2e/admin-operations-command-center.spec.ts --project=chromium

Expected: PASS.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `feat(admin): compose today editorial ledger`

### Task 4: Preserve Clubs ledger return state and onboarding safety

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-club-list-filters.ts`
- Create: `front/features/platform-admin/model/platform-admin-club-list-filters.test.ts`
- Modify: `front/features/platform-admin/route/admin-clubs-route.tsx`
- Modify: `front/features/platform-admin/route/admin-clubs-route.test.tsx`
- Create: `front/features/platform-admin/ui/admin-clubs-ledger.tsx`
- Create: `front/features/platform-admin/ui/admin-clubs-ledger.test.tsx`
- Modify: `front/features/platform-admin/route/admin-club-detail-route.tsx`
- Modify: `front/features/platform-admin/route/admin-club-detail-route.test.tsx`
- Modify: `front/features/platform-admin/ui/domain-provisioning-panel.tsx`
- Modify: `front/features/platform-admin/ui/domain-provisioning-panel.test.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-onboarding-wizard.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-onboarding-wizard.test.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.css`
- Modify: `front/tests/e2e/admin-clubs-triage.spec.ts`, `admin-club-operations.spec.ts`.

- [ ] **Step 1: Write RED list/detail return tests.** Preserve current search/lifecycle/visibility/domain/onboarding filters. Detail link carries validated `returnTo`, `focusId`, `scrollTop`. Back restores exact list URL, row focus and scroll. Invalid return state falls back to `/admin/clubs`.

- [ ] **Step 2: Write RED capability purge tests.** Gate `CREATE_CLUB`, `MANAGE_CLUBS`, `MANAGE_CLUB_DOMAINS` independently. Capability loss/403 clears metadata draft, visibility/domain preview, confirmation, idempotency, receipt and onboarding draft.

- [ ] **Step 3: Preserve command contracts.** Current admin revision CAS, preview expiry, response-loss identity, immutable receipt, domain recheck and command recovery remain unchanged.

- [ ] **Step 4: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-club-list-filters.test.ts features/platform-admin/model/admin-route-state.test.ts features/platform-admin/route/admin-clubs-route.test.tsx features/platform-admin/ui/admin-clubs-ledger.test.tsx features/platform-admin/route/admin-club-detail-route.test.tsx features/platform-admin/ui/domain-provisioning-panel.test.tsx features/platform-admin/ui/platform-admin-onboarding-wizard.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx

Expected: FAIL on return restoration and full authority purge.

- [ ] **Step 5: Implement minimal route/model/UI changes and run GREEN.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-club-list-filters.test.ts features/platform-admin/model/admin-route-state.test.ts features/platform-admin/route/admin-clubs-route.test.tsx features/platform-admin/ui/admin-clubs-ledger.test.tsx features/platform-admin/route/admin-club-detail-route.test.tsx features/platform-admin/ui/domain-provisioning-panel.test.tsx features/platform-admin/ui/platform-admin-onboarding-wizard.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx
    corepack pnpm --dir front exec playwright test tests/e2e/admin-clubs-triage.spec.ts tests/e2e/admin-club-operations.spec.ts --project=chromium

Expected: PASS.

- [ ] **Step 6: Commit.**

Run: `git diff --check`

Commit: `feat(admin): preserve club ledger return state`

### Task 5: Compose Service Health as read-only evidence

**Files:**
- Modify: `front/features/platform-admin/route/admin-health-route.tsx`
- Modify: `front/features/platform-admin/route/admin-health-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-grid.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-grid.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-card.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-card.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-deploy-strip.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-deploy-strip.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.css`
- Modify: `front/tests/e2e/admin-health.spec.ts`.

- [ ] **Step 1: Write RED grammar tests.** Health composes `AdminPageContext` + `AdminEvidenceLedger` only. It renders no case lifecycle, action dock or receipt timeline.

- [ ] **Step 2: Preserve state evidence.** FRESH/REFRESHING/STALE/UNAVAILABLE, source-specific retry, last-known-good and drill links remain explicit.

- [ ] **Step 3: Run RED then GREEN.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-health-route.test.tsx features/platform-admin/ui/admin-health-grid.test.tsx features/platform-admin/ui/admin-health-card.test.tsx features/platform-admin/ui/admin-health-deploy-strip.test.tsx
    corepack pnpm --dir front exec playwright test tests/e2e/admin-health.spec.ts --project=chromium

Expected before implementation: grammar assertions FAIL. Expected after minimal composition: PASS.

- [ ] **Step 4: Commit.**

Run: `git diff --check`

Commit: `refactor(admin): compose service health evidence ledger`

### Task 6: Gate notification replay by exact capability and purge authority loss

**Files:**
- Modify: `front/features/platform-admin/route/admin-notifications-route.tsx`
- Modify: `front/features/platform-admin/route/admin-notifications-route.test.tsx`
- Modify: `front/features/platform-admin/queries/platform-admin-notifications-queries.ts`
- Create: `front/features/platform-admin/queries/platform-admin-notifications-queries.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-notifications-page.tsx`
- Modify: `front/features/platform-admin/ui/admin-notifications-page.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.css`
- Modify: `front/tests/e2e/admin-notifications.spec.ts`.

- [ ] **Step 1: Write RED permission tests.** Remove `role === OWNER || OPERATOR`. OWNER without `REPLAY_NOTIFICATIONS` has no control and direct handler makes zero request. OPERATOR with exact capability can preview.

- [ ] **Step 2: Write RED purge tests.** Preview/confirm 403 makes exactly one request, then clears preview, reason, idempotency key, submitted flag, result and platform-admin cache. Capability projection loss performs the same purge. No automatic retry.

- [ ] **Step 3: Write RED response-loss tests.** Preserve same identity and reconcile existing receipt/result; do not generate another preview or replay request.

- [ ] **Step 4: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-notifications-route.test.tsx features/platform-admin/queries/platform-admin-notifications-queries.test.tsx features/platform-admin/ui/admin-notifications-page.test.tsx

Expected: FAIL because current route derives replay from role and does not fully purge.

- [ ] **Step 5: Implement exact capability and L2 composition.** Use existing capabilities query and global authority-loss handler. Receipt timeline appears only after actual replay receipt/result.

- [ ] **Step 6: Run GREEN and E2E.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-notifications-route.test.tsx features/platform-admin/queries/platform-admin-notifications-queries.test.tsx features/platform-admin/ui/admin-notifications-page.test.tsx
    corepack pnpm --dir front exec playwright test tests/e2e/admin-notifications.spec.ts --project=chromium

Expected: PASS.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `fix(admin): gate notification replay by capability`

### Task 7: Preserve AI L2 actions and public takedown L3 convergence

**Files:**
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.tsx`
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.test.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`
- Modify: `front/features/platform-admin/model/platform-admin-takedown-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-takedown-model.test.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-takedown-queries.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-takedown-queries.test.tsx`
- Modify: `front/features/platform-admin/route/admin-public-takedown-route.tsx`
- Modify: `front/features/platform-admin/route/admin-public-takedown-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-public-takedown-workbench.tsx`
- Modify: `front/features/platform-admin/ui/admin-public-takedown-workbench.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.css`
- Modify: `front/tests/e2e/platform-admin-ai-ops.spec.ts`, `platform-admin-public-takedown.spec.ts`, `platform-admin-public-convergence.spec.ts`.

- [ ] **Step 1: Write AI composition RED tests.** Keep `VIEW_AI_OPERATIONS`/`MANAGE_AI_OPERATIONS`, job URL selection, preview revision, same-idempotency response-loss recovery and authority purge. Only actual L2 receipt uses timeline.

- [ ] **Step 2: Write takedown authority RED tests.** Replace role input with `EMERGENCY_PUBLIC_TAKEDOWN`. Capability absent/direct handler gives zero request. Add `adminTakedownKeys.all` mutation keys.

- [ ] **Step 3: Write takedown purge RED tests.** Do not restore/render/query sessionStorage receipt before capability ready. Capability loss/403 clears preview, idempotency ref, receipt, convergence cache and `readmates:admin-public-takedown:latest-receipt`. Preserve same-identity response loss and L3 convergence resume.

- [ ] **Step 4: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-ai-ops-route.test.tsx features/platform-admin/ui/platform-admin-ai-ops.test.tsx features/platform-admin/model/platform-admin-takedown-model.test.ts features/platform-admin/queries/platform-admin-takedown-queries.test.tsx features/platform-admin/route/admin-public-takedown-route.test.tsx features/platform-admin/ui/admin-public-takedown-workbench.test.tsx

Expected: FAIL on new composition/takedown capability/purge assertions.

- [ ] **Step 5: Implement without changing API contracts.** L3 timeline includes receipt/convergence only for public takedown.

- [ ] **Step 6: Run GREEN and focused E2E.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-ai-ops-route.test.tsx features/platform-admin/ui/platform-admin-ai-ops.test.tsx features/platform-admin/model/platform-admin-takedown-model.test.ts features/platform-admin/queries/platform-admin-takedown-queries.test.tsx features/platform-admin/route/admin-public-takedown-route.test.tsx features/platform-admin/ui/admin-public-takedown-workbench.test.tsx
    corepack pnpm --dir front exec playwright test tests/e2e/platform-admin-ai-ops.spec.ts tests/e2e/platform-admin-public-takedown.spec.ts tests/e2e/platform-admin-public-convergence.spec.ts --project=chromium

Expected: PASS.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `fix(admin): preserve safe action convergence`

### Task 8: Complete Review routes and analytics export authority

**Files:**
- Modify: `front/features/platform-admin/route/admin-support-route.tsx`
- Modify: `front/features/platform-admin/route/admin-support-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.test.tsx`
- Modify: `front/features/platform-admin/route/admin-audit-data.ts`
- Modify: `front/features/platform-admin/route/admin-audit-data.test.ts`
- Modify: `front/features/platform-admin/route/admin-audit-route.tsx`
- Modify: `front/features/platform-admin/route/admin-audit-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`
- Modify: `front/features/platform-admin/api/platform-admin-analytics-api.ts`
- Modify: `front/features/platform-admin/api/platform-admin-analytics-api.test.ts`
- Modify: `front/features/platform-admin/route/admin-analytics-route.tsx`
- Modify: `front/features/platform-admin/route/admin-analytics-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.tsx`
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.css`
- Modify: `front/tests/e2e/admin-support.spec.ts`, `admin-audit.spec.ts`, `admin-analytics.spec.ts`.

- [ ] **Step 1: Write support RED grammar tests.** Preserve `MANAGE_SUPPORT_ACCESS`, body-only private search, mutation `gcTime: 0`, preview/confirm identity and authority purge. Use L2 timeline only for actual grant/revoke receipt. Change any memo-like copy to review-time-only reason context.

- [ ] **Step 2: Write audit URL RED tests.** Move UI-local `selectedId/detailOpen` to `?event=<safe-id>&mode=detail`. Add safe params in `admin-audit-data.ts`. Mobile Back restores event row focus. Sensitive target stays out of URL/storage/query key and is purged when `VIEW_SENSITIVE_AUDIT` is lost.

- [ ] **Step 3: Write analytics permission RED tests.** Overview requires `VIEW_ANALYTICS`; export independently requires `EXPORT_ANALYTICS`. No capability/direct handler means zero request.

- [ ] **Step 4: Write analytics 403 RED tests.** API preserves typed HTTP status with `apiErrorFromResponse`. A server 403 makes exactly one request, purges admin cache/state, and calls blob/createObjectURL/anchor click/download/automatic retry zero times.

- [ ] **Step 5: Run RED.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-support-route.test.tsx features/platform-admin/ui/admin-support-workbench.test.tsx features/platform-admin/route/admin-audit-data.test.ts features/platform-admin/route/admin-audit-route.test.tsx features/platform-admin/ui/admin-audit-ledger.test.tsx features/platform-admin/api/platform-admin-analytics-api.test.ts features/platform-admin/route/admin-analytics-route.test.tsx features/platform-admin/ui/admin-analytics-overview.test.tsx

Expected: FAIL on audit URL ownership and analytics exact capability/403 behavior.

- [ ] **Step 6: Implement minimal route/UI/API changes and run GREEN.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-support-route.test.tsx features/platform-admin/ui/admin-support-workbench.test.tsx features/platform-admin/route/admin-audit-data.test.ts features/platform-admin/route/admin-audit-route.test.tsx features/platform-admin/ui/admin-audit-ledger.test.tsx features/platform-admin/api/platform-admin-analytics-api.test.ts features/platform-admin/route/admin-analytics-route.test.tsx features/platform-admin/ui/admin-analytics-overview.test.tsx
    corepack pnpm --dir front exec playwright test tests/e2e/admin-support.spec.ts tests/e2e/admin-audit.spec.ts tests/e2e/admin-analytics.spec.ts --project=chromium

Expected: PASS.

- [ ] **Step 7: Commit.**

Run: `git diff --check`

Commit: `fix(admin): complete review ledger authority`

### Task 9: Lock admin visual, mobile and browser evidence

**Files:**
- Create: `front/features/platform-admin/ui/admin-editorial-ledger.fixtures.ts`
- Create: `front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx`
- Create host-independent admin baselines under `front/__screenshots__/features/platform-admin/**` through the later integration Docker update.
- Create: `front/tests/e2e/admin-editorial-ledger-e2e-fixtures.ts`
- Create: `front/tests/e2e/admin-editorial-ledger-browser-smoke.spec.ts`
- Modify focused semantics only in existing admin E2E specs touched by Tasks 3-8.
- Do not modify `front/playwright.config.ts`, `front/package.json`, CI or global CSS.

**Baseline names:**

- `editorial-ledger-today-1440.png`
- `editorial-ledger-clubs-900.png`
- `editorial-ledger-service-768.png`
- `editorial-ledger-review-390.png`
- `editorial-ledger-case-detail-320.png`

- [ ] **Step 1: Build exact fixtures.** Fixture inputs contain explicit capabilities and Today `allowedActions`; helper must not derive from role. Include long Korean/English, empty evidence, multiple failed sources, pending-new, pagination failure and unknown-outcome.

- [ ] **Step 2: Write CT screenshot assertions.** Cover five baselines, no horizontal overflow, 44px action targets, focus-visible, reduced motion and no nested live regions. CT imports the scoped stylesheet directly.

- [ ] **Step 3: Write browser smoke for four primary areas.** Today L1/allowedActions, Clubs list-detail-return, Health read-only evidence, Audit URL docket. Also include Notifications L2 exact capability because it is the fixed high-risk action route.

- [ ] **Step 4: Run Chromium RED before integration config.**

Run:

    corepack pnpm --dir front exec playwright test tests/e2e/admin-editorial-ledger-browser-smoke.spec.ts --project=chromium
    corepack pnpm --dir front test:ct

Expected: browser semantics pass after implementation; CT fails only for missing new baselines until the integration program runs `test:ct:update`.

- [ ] **Step 5: Run all admin focused tests and lint/build.**

Run:

    corepack pnpm --dir front exec vitest run features/platform-admin
    corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
    corepack pnpm --dir front lint
    corepack pnpm --dir front build

Expected: PASS.

- [ ] **Step 6: Independent admin review.** Use `superpowers:requesting-code-review`. Require no Critical/Important issue on exact capability, Today allowedActions, polling order, deep-link recovery, 403/409/unknown outcome, L1/L2/L3 composition, mobile completion and old-branch provenance. Fix at most two bounded waves.

- [ ] **Step 7: Commit source and browser spec, but not unreviewed generated screenshots.**

Run: `git diff --check`

Commit: `test(admin): lock editorial ledger browser contracts`

The integration program owns the serial Docker baseline update, Firefox/mobile WebKit project wiring, CI, performance, global CSS cleanup and final visual review.

## Admin Plan Handoff

Before returning to the integration program, report:

- nine task commits and exact files outside the allowlist, which must be empty;
- old commit invariants covered by current-main tests and confirmation that no old commit was merged/cherry-picked;
- the authority matrix results including zero-request direct-handler tests;
- Today polling/pending/urgent/focus behavior;
- exact Vitest, Chromium and pending CT/cross-browser commands;
- preserved command recovery/public takedown/public convergence evidence;
- ADR-0045 still `Proposed`;
- no server/BFF/API/migration, live mutation, send, provider or deploy work.
