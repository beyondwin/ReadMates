# ReadMates 호스트 대시보드 우선순위 운영 원장 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호스트가 첫 화면에서 현재 세션과 최대 3개의 우선 행동을 판단하고, 기록·예정 세션·운영 도구를 큰 빈 공간과 중복 없이 짧게 탐색하는 반응형 대시보드를 만든다.

**Architecture:** 기존 route/query/mutation 계약과 `HostDashboard`의 local mutation state를 유지한다. `host-dashboard-model.ts`가 우선순위·요약·체크리스트 공개 범위를 순수 계산하고, `ui/dashboard/priority-ledger-sections.tsx`가 API를 모르는 prop-driven section을 제공한다. 데스크톱과 모바일은 같은 view model을 사용하되 첫 화면 정보 순서만 달리하며, AI 설정은 기존 query/mutation을 유지한 compact variant로 대시보드 끝의 운영 도구 행에 이어 붙인다.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Vitest, Testing Library, Vite, CSS custom properties.

## Global Constraints

- Canonical route는 `/clubs/:slug/app/host`이며 `/clubs/:slug/app/host1` alias를 추가하지 않는다.
- 새 API endpoint, 서버 응답 필드, DB migration, auth/BFF 계약을 추가하거나 변경하지 않는다.
- 현재 별도 작업 중인 `host-session-record` API/query/editor 파일과 `front/tests/unit/host-dashboard.test.tsx`는 수정하지 않는다.
- warm paper/ink token을 유지하고 gradient, glass, generic SaaS metric card, 과도한 brown을 추가하지 않는다.
- 모바일 primary action은 최소 44px touch target, body text는 WCAG AA 대비, focus는 가시적으로 유지한다.
- actual action이 없는 기능은 disabled primary button으로 표시하지 않고 `기능 준비 중` 설명으로 축약한다.
- Git commit, push, deploy는 사용자가 별도로 요청하지 않는 한 수행하지 않는다.

---

## 파일 구조

- Modify: `front/features/host/model/host-dashboard-model.ts`
  - raw dashboard/notification/record 상태를 최대 3개의 우선 행동, compact metric rail, 기본 체크리스트 범위로 정규화한다.
- Modify: `front/features/host/model/host-dashboard-model.test.ts`
  - 우선순위, 중복 제거, 음수 count, 안정 상태, 체크리스트 공개 범위를 순수 함수로 검증한다.
- Create: `front/features/host/ui/dashboard/priority-ledger-sections.tsx`
  - `HostTodayBoard`, `HostPriorityLedger`, `HostOperationFlow`, `HostOperationsTools`를 제공하는 API-independent presentational module이다.
- Create: `front/features/host/ui/dashboard/priority-ledger-sections.test.tsx`
  - section landmark, heading, link, disclosure, compact stable state, 긴 텍스트 wrapping 계약을 검증한다.
- Modify: `front/features/host/ui/host-dashboard.tsx`
  - 기존 mutation/pagination state를 유지하면서 새 section에 view model과 handler를 조합하고 desktop/mobile 정보 순서를 정한다.
- Modify: `front/features/host/ui/host-dashboard.test.tsx`
  - 첫 화면 우선순위, 중복 제거, 접근 가능한 control, 기존 visibility mutation 회귀를 검증한다.
- Modify: `front/features/host/ui/dashboard/shared-sections.tsx`
  - missing-member inline action을 compact priority row에서 재사용하고, action 없는 집계는 세션 기록 링크로 표현한다.
- Modify: `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`
  - 모바일을 priority → current session → compact ledger → operation flow → tools 순서로 축약한다.
- Modify: `front/features/host/club/ui/ClubAiDefaultsSection.tsx`
  - 기존 data/mutation 동작을 유지하고 `variant="default" | "compact"` presentation을 지원한다.
- Modify: `front/features/host/club/ui/ClubAiDefaultsSection.test.tsx`
  - compact variant와 기존 loading/save/error/aria-live 계약을 검증한다.
- Modify: `front/features/host/route/host-dashboard-route.tsx`
  - AI section을 큰 standalone card가 아닌 compact operations-tool continuation으로 조합한다.
- Modify: `front/features/host/route/host-dashboard-route.test.tsx`
  - AI compact variant 전달과 기존 notification composer 회귀를 검증한다.
- Modify: `front/src/styles/globals.css`
  - priority board, ledger rail/rows, operation flow, tool rows, disclosure, 반응형 layout을 host-dashboard namespace 안에 정의한다.
- Modify: `CHANGELOG.md`
  - Unreleased에 호스트 대시보드 정보 구조/스크롤 개선을 기록한다.

### Task 1: 우선순위 운영 view model

**Files:**
- Modify: `front/features/host/model/host-dashboard-model.test.ts`
- Modify: `front/features/host/model/host-dashboard-model.ts`

**Interfaces:**
- Consumes: `HostDashboardCurrentSession`, `HostDashboardData`, `MissingCurrentSessionMembersSummary`, `HostNotificationSummary`, `HostSessionAttentionData`.
- Produces:

```ts
export type HostDashboardPriorityItem = {
  id: "missing-members" | "notification-failure" | "current-session" | "record-attention" | "publication" | "stable";
  title: string;
  helper: string;
  count: number;
  tone: HostDashboardAlertTone;
  href: string | null;
  actionLabel: string | null;
};

export type HostDashboardLedgerMetric = {
  id: "rsvp" | "checkin" | "record" | "publication" | "draft";
  label: string;
  value: number;
  stateLabel: string;
  tone: HostDashboardAlertTone;
};

export type HostDashboardChecklistView = {
  highlighted: HostChecklistItem[];
  all: HostChecklistItem[];
};

export function getHostDashboardPriorityItems(input: {
  session: HostDashboardCurrentSession | null;
  data: HostDashboardData;
  missingMembers: MissingCurrentSessionMembersSummary | null;
  notifications: HostNotificationSummary;
  recordAttention: HostSessionAttentionData | null;
}): HostDashboardPriorityItem[];

export function getHostDashboardLedgerMetrics(
  data: HostDashboardData,
  recordAttention: HostSessionAttentionData | null,
): HostDashboardLedgerMetric[];

export function getHostDashboardChecklistView(
  checklist: HostChecklistItem[],
): HostDashboardChecklistView;
```

- [ ] **Step 1: Write failing priority-order and cap tests**

```ts
it("orders actionable sources and caps the board at three items", () => {
  const items = getHostDashboardPriorityItems({
    session: currentSession,
    data: { ...cleanDashboard, rsvpPending: 4, publishPending: 2 },
    missingMembers: { count: 1, members: [] },
    notifications: { pending: 0, failed: 1, dead: 0, sentLast24h: 0, latestFailures: [] },
    recordAttention: {
      items: [],
      summary: { needsAttentionCount: 2, incompletePublishedCount: 1, draftCount: 1 },
    },
  });

  expect(items.map((item) => item.id)).toEqual([
    "missing-members",
    "notification-failure",
    "current-session",
  ]);
});
```

- [ ] **Step 2: Write failing stable, normalization, and checklist tests**

```ts
it("returns one stable item and normalizes negative ledger values", () => {
  expect(getHostDashboardPriorityItems({
    session: currentSession,
    data: { rsvpPending: -1, checkinMissing: -2, publishPending: -3, feedbackPending: -4 },
    missingMembers: null,
    notifications: { pending: 0, failed: 0, dead: 0, sentLast24h: 0, latestFailures: [] },
    recordAttention: {
      items: [],
      summary: { needsAttentionCount: 0, incompletePublishedCount: 0, draftCount: 0 },
    },
  })).toMatchObject([{ id: "stable", count: 0, tone: "ok" }]);

  expect(getHostDashboardLedgerMetrics(
    { rsvpPending: -1, checkinMissing: -2, publishPending: -3, feedbackPending: -4 },
    { items: [], summary: { needsAttentionCount: -5, incompletePublishedCount: 0, draftCount: -6 } },
  ).every((metric) => metric.value === 0)).toBe(true);
});

it("shows pending checklist context by default and retains the full timeline", () => {
  const all = getHostDashboardChecklist(currentSession, {
    ...cleanDashboard,
    rsvpPending: 2,
  });
  const view = getHostDashboardChecklistView(all);

  expect(view.all).toEqual(all);
  expect(view.highlighted).toHaveLength(3);
  expect(view.highlighted.some((item) => item.state === "pending")).toBe(true);
});
```

- [ ] **Step 3: Run model tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/model/host-dashboard-model.test.ts
```

Expected: FAIL because the new types/functions are not exported.

- [ ] **Step 4: Implement deterministic priority and ledger derivation**

Use a candidate array with explicit numeric priority and stable insertion order. Add missing members first, `failed + dead` notifications second, current RSVP/check-in blockers third, record attention fourth, publication/feedback fifth, then `slice(0, 3)`. If all actionable counts normalize to zero, return only:

```ts
{
  id: "stable",
  title: "지금 처리할 긴급 항목이 없습니다",
  helper: "현재 세션과 운영 기록이 안정적인 상태입니다.",
  count: 0,
  tone: "ok",
  href: session ? hostSessionEditHref(session.sessionId) : null,
  actionLabel: session ? "세션 문서 확인" : null,
}
```

For aggregate publication/record state, use `/app/host/sessions?needsAttention=true` rather than a disabled action. `getHostDashboardChecklistView` selects the first pending item plus its immediate previous and next items; without pending items it selects the first three entries.

- [ ] **Step 5: Run model tests and verify GREEN**

Run the same focused command. Expected: all tests in the file pass.

### Task 2: Prop-driven priority ledger sections

**Files:**
- Create: `front/features/host/ui/dashboard/priority-ledger-sections.test.tsx`
- Create: `front/features/host/ui/dashboard/priority-ledger-sections.tsx`
- Modify: `front/features/host/ui/dashboard/shared-sections.tsx`

**Interfaces:**
- Consumes: Task 1 view model types, `HostDashboardLinkComponent`, existing `BookCover`, `SessionTimingIdentity`, `UpcomingSessionRow`, and caller-provided React nodes for mutation-backed rows.
- Produces:

```ts
export function HostTodayBoard(props: {
  mobile: boolean;
  currentSession: ReactNode;
  priorityBoard: ReactNode;
}): JSX.Element;

export function HostPriorityLedger(props: {
  metrics: HostDashboardLedgerMetric[];
  recordRows: ReactNode;
  recordError: boolean;
  LinkComponent: HostDashboardLinkComponent;
}): JSX.Element;

export function HostOperationFlow(props: {
  upcomingSessions: ReactNode;
  checklist: HostDashboardChecklistView;
}): JSX.Element;

export function HostOperationsTools(props: {
  notifications: ReactNode;
  members: ReactNode;
  invitations: ReactNode;
  quickActions: ReactNode;
}): JSX.Element;
```

- [ ] **Step 1: Write failing semantic-layout tests**

```tsx
it("renders a compact ledger and an accessible full-timeline disclosure", () => {
  render(
    <>
      <HostPriorityLedger
        metrics={[{ id: "rsvp", label: "RSVP 미응답", value: 2, stateLabel: "확인 필요", tone: "warn" }]}
        recordRows={<div>8회차 기록</div>}
        recordError={false}
        LinkComponent={TestLink}
      />
      <HostOperationFlow
        upcomingSessions={<div>9회차 예정</div>}
        checklist={{ highlighted: checklist.slice(0, 3), all: checklist }}
      />
    </>,
  );

  expect(screen.getByRole("heading", { name: "처리 대기 원장" })).toBeInTheDocument();
  expect(screen.getByText("RSVP 미응답")).toBeInTheDocument();
  expect(screen.getByText("8회차 기록")).toBeInTheDocument();
  expect(screen.getByText("9회차 예정")).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "전체 운영 일정" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Write failing error and action-language tests**

Assert that `recordError` renders `기록 상태를 불러오지 못했습니다` plus a link named `세션 기록 열기`, and that aggregate rows never render a disabled button named `회차 선택`.

- [ ] **Step 3: Run component test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/dashboard/priority-ledger-sections.test.tsx
```

Expected: FAIL because the section module does not exist.

- [ ] **Step 4: Implement sections with semantic HTML**

Use `section[aria-labelledby]`, `dl` for metric rail, `ol` for priority/checklist rows, and:

```tsx
<details className="rm-host-flow__details">
  <summary>전체 운영 일정 {checklist.all.length}단계</summary>
  <ol aria-label="전체 운영 일정">{/* all checklist rows */}</ol>
</details>
```

Keep `HostTodayBoard` at two columns only on desktop. Use concise row descriptions, `minWidth: 0` only where existing utility classes do not cover wrapping, and no API/query imports.

- [ ] **Step 5: Make missing-member and aggregate actions compact**

Update `MissingCurrentSessionMembersAlert` to accept `compact?: boolean`. In compact mode, render the count and member actions as ledger rows without the large editorial card. Update `NextActionCard` so `href === null` with `label === "세션 기록에서 선택"` renders a real `/app/host/sessions?needsAttention=true` link and helper text, not a disabled button.

- [ ] **Step 6: Run section and existing colocated dashboard tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/dashboard/priority-ledger-sections.test.tsx \
  features/host/ui/host-dashboard.test.tsx
```

Expected: new tests pass; existing accessibility and visibility tests remain green.

### Task 3: Compose desktop/mobile dashboard and compact AI tool

**Files:**
- Modify: `front/features/host/ui/host-dashboard.test.tsx`
- Modify: `front/features/host/ui/host-dashboard.tsx`
- Modify: `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`
- Modify: `front/features/host/club/ui/ClubAiDefaultsSection.test.tsx`
- Modify: `front/features/host/club/ui/ClubAiDefaultsSection.tsx`
- Modify: `front/features/host/route/host-dashboard-route.test.tsx`
- Modify: `front/features/host/route/host-dashboard-route.tsx`

**Interfaces:**
- Consumes: Task 1 functions and Task 2 sections.
- Produces: `ClubAiDefaultsSection({ clubSlug, variant?: "default" | "compact" })`; the public `HostDashboard` props and route loader/action contracts stay unchanged.

- [ ] **Step 1: Write failing dashboard information-order tests**

Render actionable fixture data and assert within desktop:

```ts
const text = getDesktopView(container).queryByRole("main")?.textContent ?? "";
expect(text.indexOf("현재 세션")).toBeLessThan(text.indexOf("처리 대기 원장"));
expect(text.indexOf("지금 처리할 일")).toBeLessThan(text.indexOf("처리 대기 원장"));
expect(getDesktopView(container).getAllByRole("heading", { name: "처리 대기 원장" })).toHaveLength(1);
```

Within mobile, assert `지금 처리할 일` occurs before `현재 세션`, and that `전체 운영 일정` is a disclosure rather than six always-expanded checklist rows.

- [ ] **Step 2: Run dashboard test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx
```

Expected: FAIL because the current summary/grid/mobile stack does not use the approved hierarchy.

- [ ] **Step 3: Compose the desktop priority ledger**

In `host-dashboard.tsx`, keep lines that derive pagination, visibility overrides, missing-member resolution, and upcoming handlers. Replace only the returned desktop markup:

```tsx
<main className="desktop-only rm-host-dashboard-desktop">
  <HostDashboardHeader hostName={hostName} />
  <div className="container rm-host-dashboard-ledger">
    <HostTodayBoard currentSession={currentSessionNode} priorityBoard={priorityNode} mobile={false} />
    <HostPriorityLedger metrics={ledgerMetrics} recordRows={recordRows} recordError={recordAttention === null} LinkComponent={LinkComponent} />
    <HostOperationFlow upcomingSessions={upcomingNode} checklist={checklistView} />
    <HostOperationsTools notifications={notificationNode} members={memberNode} invitations={inviteNode} quickActions={quickActionNode} />
  </div>
</main>
```

Do not duplicate RSVP/publish/feedback descriptions outside the ledger. Retain `UpcomingSessionRow` handlers, pagination, local visibility fallback, open-session behavior, and `HostClubOperationsCard` data in a compact tools row.

- [ ] **Step 4: Compose mobile with priority-first ordering**

Refactor `MobileHostDashboard` to consume `priorityItems`, `ledgerMetrics`, and `checklistView`; render the same section components with `mobile` presentation in this order:

```text
page title
지금 처리할 일
현재 세션
처리 대기 원장
다음 세션과 운영 흐름
운영 도구
```

Remove the always-expanded full attendee list; replace it with `참석 N명 · 미응답 N명` and a `멤버 관리` link. Keep missing-member inline actions visible because they are priority work.

- [ ] **Step 5: Write failing compact AI tests**

```tsx
render(
  <Wrapper>
    <ClubAiDefaultsSection clubSlug="club-a" variant="compact" />
  </Wrapper>,
);

expect(await screen.findByRole("heading", { name: "AI 기본 모델" })).toBeInTheDocument();
expect(screen.getByRole("combobox", { name: "기본 모델" })).toBeInTheDocument();
expect(screen.queryByText(/호스트가 업로드 시/)).not.toBeInTheDocument();
```

- [ ] **Step 6: Implement and route the compact AI variant**

Add `variant = "default"` to props. Compact mode uses heading text `AI 기본 모델`, one-line status/copy, inline select and save action, and preserves the same loading, mutation pending, `aria-live="polite"`, and `role="alert"` behavior. In the route render:

```tsx
{clubSlug ? (
  <section className="container rm-host-dashboard-ai-tool" aria-label="AI 운영 도구">
    <ClubAiDefaultsSection clubSlug={clubSlug} variant="compact" />
  </section>
) : null}
```

Do not wrap it in the old 22px full-width document card.

- [ ] **Step 7: Run focused model/UI/route tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/model/host-dashboard-model.test.ts \
  features/host/ui/dashboard/priority-ledger-sections.test.tsx \
  features/host/ui/host-dashboard.test.tsx \
  features/host/club/ui/ClubAiDefaultsSection.test.tsx \
  features/host/route/host-dashboard-route.test.tsx
```

Expected: all focused tests pass.

### Task 4: Product-tone styling, regression gates, and runtime proof

**Files:**
- Modify: `front/src/styles/globals.css`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `rm-host-dashboard-*`, `rm-host-priority-*`, `rm-host-ledger-*`, `rm-host-flow-*`, `rm-host-tools-*` class names from Tasks 2–3.
- Produces: responsive layouts at desktop ≥ 1100px, tablet 768–1099px, mobile ≤ 767px.

- [ ] **Step 1: Add host-dashboard scoped CSS**

Implement:

```css
.rm-host-dashboard-ledger {
  display: grid;
  gap: clamp(24px, 3vw, 40px);
  padding-bottom: 48px;
}

.rm-host-today {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 20px;
  align-items: start;
}

.rm-host-ledger__metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.rm-host-tools__row,
.rm-host-ledger__row {
  min-width: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 1099px) {
  .rm-host-today,
  .rm-host-ledger__metrics {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .rm-host-dashboard-mobile .btn {
    min-height: 44px;
  }
}
```

Use borders, `var(--bg-raised)`, `var(--bg-sub)`, and spacing rather than nested rounded cards. Apply `:focus-visible` using existing focus tokens. Under `prefers-reduced-motion: reduce`, disclosure/row state changes have no transition.

- [ ] **Step 2: Add the Unreleased changelog entry**

Under the existing Unreleased UI section, add one public-safe line:

```markdown
- 호스트 대시보드를 현재 세션과 우선 행동 중심의 운영 원장으로 재구성해 중복 상태, 빈 공간, 모바일 스크롤을 줄였습니다.
```

- [ ] **Step 3: Run formatting and focused regression**

Run:

```bash
git diff --check -- \
  front/features/host/model/host-dashboard-model.ts \
  front/features/host/model/host-dashboard-model.test.ts \
  front/features/host/ui/host-dashboard.tsx \
  front/features/host/ui/host-dashboard.test.tsx \
  front/features/host/ui/dashboard/priority-ledger-sections.tsx \
  front/features/host/ui/dashboard/priority-ledger-sections.test.tsx \
  front/features/host/ui/dashboard/shared-sections.tsx \
  front/features/host/ui/dashboard/mobile-host-dashboard.tsx \
  front/features/host/club/ui/ClubAiDefaultsSection.tsx \
  front/features/host/club/ui/ClubAiDefaultsSection.test.tsx \
  front/features/host/route/host-dashboard-route.tsx \
  front/features/host/route/host-dashboard-route.test.tsx \
  front/src/styles/globals.css \
  CHANGELOG.md

corepack pnpm --dir front exec vitest run \
  features/host/model/host-dashboard-model.test.ts \
  features/host/ui/dashboard/priority-ledger-sections.test.tsx \
  features/host/ui/host-dashboard.test.tsx \
  features/host/club/ui/ClubAiDefaultsSection.test.tsx \
  features/host/route/host-dashboard-route.test.tsx
```

- [ ] **Step 4: Run frontend gates**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

If the full test command fails only in the already-dirty `front/tests/unit/host-dashboard.test.tsx`, report that exact pre-existing overlap and do not edit it. Any failure in changed files must be fixed.

- [ ] **Step 5: Verify the canonical route in a real browser**

Use the existing local dev server without terminating unrelated processes. Navigate to:

```text
http://localhost:5174/clubs/reading-sai/app/host
```

Verify at:

- 1440×1000: no global unequal-height column, no large blank right/left region, entire dashboard target around two viewports.
- 1024×768: today board stacks without overlap, ledger actions wrap, no horizontal overflow.
- 390×844: priority actions appear before current session, first viewport includes both headings, touch targets are at least 44px, stable/detail content is disclosed.

Capture screenshots and measure `document.documentElement.scrollHeight`, `document.documentElement.scrollWidth`, and viewport width. Confirm `scrollWidth <= innerWidth`.

- [ ] **Step 6: Accessibility smoke**

Keyboard-tab through page header, top priority actions, current-session edit, ledger link, disclosure, and tools. Confirm:

- focus is always visible;
- disclosure toggles with Enter/Space;
- no unnamed interactive elements;
- heading order is h1 → h2 → h3;
- loading/success uses `aria-live="polite"` and errors use `role="alert"`.

- [ ] **Step 7: Recheck scope before handoff**

Run:

```bash
git status --short --branch --untracked-files=all
git diff --stat
```

Confirm no server, BFF, session-record API/query/editor, secrets, private member fixtures, deployment state, or absolute local paths were added by this implementation.

## 자체 검토

- Spec coverage: compact header, today board, maximum-three priority actions, full-width ledger, independent operation flow/tools, mobile priority-first order, AI compact row, errors, accessibility, and runtime measurements are mapped to Tasks 1–4.
- Placeholder scan: every implementation and verification step contains an executable action and expected outcome.
- Type consistency: Tasks 2–3 consume the exact Task 1 `HostDashboardPriorityItem`, `HostDashboardLedgerMetric`, and `HostDashboardChecklistView` names; `ClubAiDefaultsSection` uses one consistent optional `variant` prop.
- Scope safety: the implementation avoids all currently dirty session-record files and the dirty broad dashboard integration test.
