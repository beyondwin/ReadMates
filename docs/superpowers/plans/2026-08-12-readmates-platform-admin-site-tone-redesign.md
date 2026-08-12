# ReadMates Platform Admin Site-Tone Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ReadMates의 사이트 톤을 유지하면서 `/admin/today`를 짧은 위치 번호, 작업 관점, 안정적인 갱신, 목록·상세 흐름을 갖춘 실제 운영 작업대로 재구성한다.

**Architecture:** 기존 `api -> queries -> model -> route -> ui` 경계를 유지하고 서버·BFF·DB 계약은 변경하지 않는다. 순수 model이 URL, 표시명, 위치 번호, 작업 관점, 검색, polling snapshot을 계산하고 route가 query·선택·mutation을 조정하며 UI는 동일한 view model을 데스크톱과 모바일에서 다른 배치로 렌더링한다.

**Tech Stack:** React 19, TypeScript 6, React Router 8, TanStack Query 5, Vitest, Testing Library, Playwright, 기존 ReadMates design-system token과 `front/src/styles/globals.css`

## Global Constraints

- 대상은 `front/`의 플랫폼 관리자 셸과 `/admin/today`다. Spring API, BFF, DB schema, Flyway migration을 변경하지 않는다.
- API와 URL의 실제 사건 식별자는 기존 UUID다. `07`, `06` 같은 값은 현재 화면의 위치 표시자이며 링크, 복사값, 로그, 접근성 이름에서 식별자로 사용하지 않는다.
- 처음 표시하는 7개 행은 `07`에서 `01` 순서다. polling으로 새 사건이 들어와도 운영자가 적용하기 전에는 기존 행 순서와 번호를 유지한다.
- 작업 관점·필터·검색을 바꾸거나 운영자가 새 사건을 적용하면 현재 결과 집합을 기준으로 위치 번호를 다시 계산한다.
- 기존 응답에 정확한 당일 해결 count가 없으므로 `오늘 해결` 관점에는 추정 숫자를 표시하지 않는다. 기존 `RESOLVED` query 결과의 `resolvedAt`을 서울 날짜로 제한하며 더 불러올 페이지가 있음을 숨기지 않는다.
- 서버 검색 계약이 없으므로 검색은 현재 불러온 행의 제목, source, scope 표시명에만 적용한다. 입력 설명을 `불러온 기록 검색`으로 고정하고 추가 페이지가 로드되면 결과를 다시 계산한다.
- 실패 원천의 재확인은 원천 이름을 표시하지만 기존 list refetch가 서버의 전체 reconciliation을 수행한다. 이 동작은 ACK/SNOOZE/RESOLVE mutation을 호출하지 않아야 한다.
- `SUPPORT`는 같은 근거를 읽을 수 있지만 ACK/SNOOZE/RESOLVE를 볼 수도 실행할 수도 없다.
- 넓은 화면은 `1180px` 이상, 중간 화면은 `768px` 이상 `1179px` 이하, 모바일은 `767px` 이하로 고정한다.
- 파란 `ReadmatesBrandMark`, 따뜻한 아이보리, 짙은 먹색, 얇은 선, 절제된 네이비를 사용한다. 그라데이션, glass, KPI 카드, 과도한 pill, 종이 질감, literal book decoration을 추가하지 않는다.
- 전역 `새 클럽` 행동은 관리자 셸에서 제거하고 `/admin/clubs` 헤더에만 둔다. onboarding query와 modal 계약은 유지한다.
- 새 외부 패키지와 새 이미지 asset을 추가하지 않는다.

---

## File Structure

### Create

- `front/features/platform-admin/model/platform-admin-operations-snapshot.ts` — polling 결과에서 현재 행 순서를 동결하고 새 사건 수를 계산하는 순수 model
- `front/features/platform-admin/model/platform-admin-operations-snapshot.test.ts` — snapshot 수명주기와 새 사건 적용 회귀 테스트
- `front/features/platform-admin/ui/admin-mobile-nav-drawer.tsx` — 관리자 모바일 탐색 dialog, focus trap, focus return
- `front/features/platform-admin/ui/admin-mobile-nav-drawer.test.tsx` — drawer keyboard와 닫기 동작
- `front/features/platform-admin/ui/admin-today-controls.tsx` — 작업 관점, 현재 범위 검색, 필터 dialog, 적용 filter chip
- `front/features/platform-admin/ui/admin-today-controls.test.tsx` — controls의 키보드·상태·callback 테스트
- `front/features/platform-admin/ui/admin-today-ledger.ct.tsx` — 1440px, 900px, 390px 시각 회귀 fixture
- `front/__screenshots__/features/platform-admin/ui/admin-today-ledger.ct.tsx/` — Docker CT에서 생성한 승인 baseline

### Modify

- `front/features/platform-admin/model/admin-route-catalog.ts` — `Command/Operations/Review`를 `지휘대/운영/기록`으로 변경
- `front/features/platform-admin/model/admin-route-catalog.test.ts` — 한국어 group label과 권한 가시성 고정
- `front/features/platform-admin/model/platform-admin-operations-model.ts` — URL work view·검색, locator, scope, quick view, history 표시 model
- `front/features/platform-admin/model/platform-admin-operations-model.test.ts` — model의 전체 새 계약
- `front/features/platform-admin/route/admin-shell-layout.tsx` — 사이트 브랜드, compact header, 모바일 drawer, 전역 새 클럽 제거
- `front/features/platform-admin/route/admin-shell-layout.test.tsx` — 셸 브랜드·drawer·전역 행동 범위
- `front/features/platform-admin/route/admin-clubs-route.tsx` — OWNER에게만 문맥 `새 클럽` 노출
- `front/features/platform-admin/route/admin-clubs-route.test.tsx` — 클럽 페이지 행동과 query 유지
- `front/features/platform-admin/route/admin-today-route.tsx` — snapshot, clubs map, work view, 검색, 선택 제외, 구체적 mutation 결과
- `front/features/platform-admin/route/admin-today-route.test.tsx` — URL·polling·선택·권한·복구 통합 테스트
- `front/features/platform-admin/ui/admin-today-ledger.tsx` — 페이지 hierarchy와 wide/compact/mobile surface 조정
- `front/features/platform-admin/ui/admin-today-ledger.test.tsx` — loading·empty·filtered·source·layout 회귀
- `front/features/platform-admin/ui/admin-operations-queue.tsx` — 번호 gutter와 두 줄 기록 행
- `front/features/platform-admin/ui/admin-operations-queue.test.tsx` — locator의 시각 전용 계약과 행 정보 순서
- `front/features/platform-admin/ui/admin-operations-inspector.tsx` — `개요/변경 기록/근거` 탭과 actor category timeline
- `front/features/platform-admin/ui/admin-operations-inspector.test.tsx` — 탭, 근거, read-only 상태
- `front/features/platform-admin/ui/admin-operation-state-actions.tsx` — `내가 확인`, `보류…`, `해결` 위계와 접근 가능한 dialog
- `front/features/platform-admin/ui/admin-operation-state-actions.test.tsx` — focus trap, Escape, focus return, 구체적 callback
- `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx` — 1179px 이하 drill-in, scroll·focus 복원, sticky action surface
- `front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx` — 목록↔상세 상태 복원
- `front/src/styles/globals.css` — 사이트 톤 shell, ledger, queue, inspector, 세 breakpoint의 responsive styling
- `front/tests/e2e/admin-today.spec.ts` — OWNER·SUPPORT의 새 문구와 surface
- `front/tests/e2e/admin-operations-command-center.spec.ts` — mutation, polling, partial source, 390px 흐름
- `front/tests/e2e/admin-shell.spec.ts` — 새 클럽의 클럽 페이지 범위와 모바일 drawer

## Dependency Order

```text
Task 1 operations view model
  -> Task 2 polling snapshot model
      -> Task 4 today controls
      -> Task 5 queue
      -> Task 6 inspector/actions
          -> Task 7 route orchestration
              -> Task 8 responsive composition + visual baselines
                  -> Task 9 E2E and release evidence

Task 3 admin shell is independent after Task 1 and joins before Task 8.
```

---

### Task 1: 운영 표시 모델과 URL 계약

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-operations-model.ts:1-326`
- Test: `front/features/platform-admin/model/platform-admin-operations-model.test.ts:1-270`

**Interfaces:**
- Consumes: `AdminOperationCasesResponse`, `PlatformAdminClubListResponse`, 기존 `AdminOperationCaseFilter`
- Produces: `AdminOperationsWorkViewId`, `AdminOperationsSearchState`, `AdminOperationCaseView.locatorLabel`, `scopeLabel`, `lastObservedLabel`, `AdminOperationWorkView`, `AdminOperationHistoryView`, `buildAdminOperationsView(response, requestedCaseId, now, clubNames, orderMode)`, `effectiveAdminOperationsFilter(state)`, `filterAdminOperationItems(items, state, now)`, `buildAdminOperationHistory(events)`

- [ ] **Step 1: 새 model 계약을 실패 테스트로 고정**

```ts
it("keeps work view and loaded-row query in the URL without forwarding q to the API", () => {
  const state = parseAdminOperationsSearch(new URLSearchParams("view=mine&q=%EC%95%8C%EB%A6%BC&severity=critical"));
  expect(state).toMatchObject({ workView: "mine", query: "알림" });
  expect(effectiveAdminOperationsFilter(state)).toEqual({
    states: ["OPEN", "ACKNOWLEDGED", "SNOOZED"],
    severities: ["CRITICAL"],
    assignee: "ME",
  });
  expect(serializeAdminOperationsSearch(state).toString()).toContain("q=%EC%95%8C%EB%A6%BC");
});

it("assigns descending visual locators and does not fall back when a requested case is excluded", () => {
  const view = buildAdminOperationsView(
    response({ items: [operationCase({ id: "a" }), operationCase({ id: "b" })] }),
    "missing-id",
    new Date(generatedAt),
    new Map([["club-1", "읽는사이"]]),
  );
  expect(view.items.map((item) => item.locatorLabel)).toEqual(["02", "01"]);
  expect(view.selectedCase).toBeNull();
  expect(view.selectionExcluded).toBe(true);
  expect(view.items[0]?.scopeLabel).toBe("읽는사이");
});

it("never invents an exact count for today-resolved", () => {
  expect(buildAdminOperationWorkViews(response().counts)).toEqual([
    { id: "action", label: "처리 필요", count: 1 },
    { id: "mine", label: "내가 확인함", count: 1 },
    { id: "snoozed", label: "보류", count: 1 },
    { id: "resolved-today", label: "오늘 해결", count: null },
  ]);
});
```

- [ ] **Step 2: 집중 test가 실패하는지 확인**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-operations-model.test.ts`

Expected: FAIL because work-view types, locator fields, and helper functions do not exist.

- [ ] **Step 3: URL, quick view, locator, scope, history model을 구현**

```ts
export type AdminOperationsWorkViewId = "action" | "mine" | "snoozed" | "resolved-today";

export type AdminOperationsSearchState = {
  caseId: string | null;
  workView: AdminOperationsWorkViewId;
  query: string;
  filter: AdminOperationCaseFilter;
};

export type AdminOperationWorkView = {
  id: AdminOperationsWorkViewId;
  label: string;
  count: number | null;
};

export type AdminOperationCaseView = AdminOperationCase & {
  locatorLabel: string;
  scopeLabel: string;
  summary: AdminOperationSummaryLabel;
  severityLabel: string;
  stateLabel: string;
  sourceLabel: string;
  impactLabel: string;
  ageLabel: string;
  lastObservedLabel: string;
};

function mergeOperationFilters(
  base: AdminOperationCaseFilter,
  explicit: AdminOperationCaseFilter,
): AdminOperationCaseFilter {
  return {
    ...base,
    ...explicit,
    states: explicit.states?.length ? explicit.states : base.states,
    severities: explicit.severities?.length ? explicit.severities : base.severities,
    sources: explicit.sources?.length ? explicit.sources : base.sources,
    assignee: explicit.assignee ?? base.assignee,
  };
}

export function effectiveAdminOperationsFilter(state: AdminOperationsSearchState): AdminOperationCaseFilter {
  const workViewFilter: AdminOperationCaseFilter = state.workView === "mine"
    ? { states: ["OPEN", "ACKNOWLEDGED", "SNOOZED"], assignee: "ME" }
    : state.workView === "snoozed"
      ? { states: ["SNOOZED"] }
      : state.workView === "resolved-today"
        ? { states: ["RESOLVED"] }
        : { states: ["OPEN", "ACKNOWLEDGED"] };
  return mergeOperationFilters(workViewFilter, state.filter);
}

export function buildAdminOperationWorkViews(counts: AdminOperationCaseCounts): AdminOperationWorkView[] {
  return [
    { id: "action", label: "처리 필요", count: Math.max(0, counts.open - counts.snoozed) },
    { id: "mine", label: "내가 확인함", count: counts.assignedToMe },
    { id: "snoozed", label: "보류", count: counts.snoozed },
    { id: "resolved-today", label: "오늘 해결", count: null },
  ];
}

export function filterAdminOperationItems(
  items: readonly AdminOperationCaseView[],
  state: AdminOperationsSearchState,
  now: Date,
): AdminOperationCaseView[] {
  const today = seoulDateKey(now);
  const query = state.query.trim().toLocaleLowerCase("ko-KR");
  return items.filter((item) => {
    if (state.workView === "resolved-today") {
      if (!item.resolvedAt || seoulDateKey(new Date(item.resolvedAt)) !== today) return false;
    }
    if (!query) return true;
    return [item.summary.title, item.sourceLabel, item.scopeLabel]
      .some((value) => value.toLocaleLowerCase("ko-KR").includes(query));
  });
}

export type AdminOperationHistoryView = {
  key: string;
  actorLabel: "운영자" | "시스템";
  actionLabel: string;
  stateLabel: string;
  occurredAtLabel: string;
};

const HISTORY_LABELS: Record<AdminOperationReasonCode, string> = {
  OPERATOR_ACKNOWLEDGED: "운영자가 확인함",
  OPERATOR_SNOOZED: "운영자가 보류함",
  OPERATOR_RESOLVED: "운영자가 해결 확인함",
  SIGNAL_OPENED: "신호가 처음 감지됨",
  SIGNAL_REOPENED: "신호 재감지로 다시 열림",
  SIGNAL_CLEARED: "신호가 해소됨",
};

const SEOUL_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const SEOUL_DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

export function buildAdminOperationHistory(
  events: readonly AdminOperationCaseEvent[],
): AdminOperationHistoryView[] {
  return events.map((event) => ({
    key: `${event.caseVersion}:${event.occurredAt}`,
    actorLabel: event.reasonCode.startsWith("OPERATOR_") ? "운영자" : "시스템",
    actionLabel: HISTORY_LABELS[event.reasonCode] ?? "상태 변경 기록",
    stateLabel: STATE_LABELS[event.toState] ?? "상태 확인",
    occurredAtLabel: formatDateTime(event.occurredAt),
  }));
}

function seoulDateKey(value: Date): string {
  const parts = SEOUL_DATE.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시각 확인 필요" : SEOUL_DATE_TIME.format(date);
}

export function buildAdminOperationsView(
  response: AdminOperationCasesResponse,
  requestedCaseId: string | null,
  now: Date = new Date(),
  clubNames: ReadonlyMap<string, string> = new Map(),
  orderMode: "sorted" | "preserve" = "sorted",
): AdminOperationsView {
  const caseViews = response.items.map((item) => buildCaseView(item, now, clubNames));
  const orderedItems = orderMode === "preserve" ? caseViews : caseViews.sort(compareOperationCases);
  const items = orderedItems.map((item, index) => ({
    ...item,
    locatorLabel: String(orderedItems.length - index).padStart(2, "0"),
  }));
  const requested = requestedCaseId ? items.find((item) => item.id === requestedCaseId) ?? null : null;
  const selectionExcluded = requestedCaseId !== null && requested === null;
  const selectedCase = requestedCaseId === null ? items[0] ?? null : requested;
  const sources = response.sources.map(buildSourceFreshnessView);
  const allSourcesAvailable = sources.every((source) => source.status === "AVAILABLE");
  return {
    generatedAt: response.generatedAt,
    generatedAtLabel: formatTime(response.generatedAt),
    items,
    selectedCase,
    selectedCaseId: selectedCase?.id ?? null,
    selectionExcluded,
    sources,
    workViews: buildAdminOperationWorkViews(response.counts),
    mobileSummary: buildMobileSummary(response),
    allSourcesAvailable,
    sourceStatusLabel: allSourcesAvailable ? "전체 신호 정상" : "일부 신호 확인 불가",
    nextCursor: response.nextCursor,
  };
}
```

초기 query와 명시적 새 사건 적용은 기존 severity·firstObservedAt 정렬을 사용한다. polling snapshot은
`orderMode = "preserve"`로 입력 배열 순서를 유지한다. 그 뒤 `locatorLabel`을
`String(items.length - index).padStart(2, "0")`으로 만든다. `requestedCaseId`가 존재하지만 현재 행에
없으면 첫 행을 자동 선택하지 않고 `selectionExcluded: true`를 반환한다. history actor는 실제 사용자
정보를 만들지 않고 reason code가 `OPERATOR_`로 시작하면 `운영자`, 그 외에는 `시스템`으로만 분류한다.

- [ ] **Step 4: model test를 통과시킨다**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-operations-model.test.ts`

Expected: PASS with URL round-trip, safe unknown-value dropping, locator, club fallback, quick-view counts, Seoul-day filtering, and history actor category assertions.

- [ ] **Step 5: Task 1 커밋**

```bash
git add front/features/platform-admin/model/platform-admin-operations-model.ts front/features/platform-admin/model/platform-admin-operations-model.test.ts
git commit -m "feat: model admin operations work views"
```

---

### Task 2: polling snapshot과 새 사건 적용 계약

**Files:**
- Create: `front/features/platform-admin/model/platform-admin-operations-snapshot.ts`
- Create: `front/features/platform-admin/model/platform-admin-operations-snapshot.test.ts`

**Interfaces:**
- Consumes: `AdminOperationCasesResponse`
- Produces: `AdminOperationsSnapshot`, `createAdminOperationsSnapshot(response)`, `receiveAdminOperationsSnapshot(snapshot, response, mode)`, `applyPendingAdminOperationsSnapshot(snapshot)`

- [ ] **Step 1: 순서 동결과 기존 행 갱신의 실패 테스트 작성**

```ts
it("updates existing versions but withholds new ids until the operator applies them", () => {
  const initial = createAdminOperationsSnapshot(list([item("a", 1), item("b", 1)]));
  const received = receiveAdminOperationsSnapshot(initial, list([item("new", 1), item("a", 2), item("b", 1)]), "poll");

  expect(received.displayed.items.map((entry) => entry.id)).toEqual(["a", "b"]);
  expect(received.displayed.items[0]?.version).toBe(2);
  expect(received.pendingNewCount).toBe(1);
  expect(received.latest.items.map((entry) => entry.id)).toContain("new");

  const applied = applyPendingAdminOperationsSnapshot(received);
  expect(applied.displayed.items.map((entry) => entry.id)).toEqual(["new", "a", "b"]);
  expect(applied.pendingNewCount).toBe(0);
});

it("accepts explicit pagination rows immediately", () => {
  const initial = createAdminOperationsSnapshot(list([item("a", 1)]));
  const paged = receiveAdminOperationsSnapshot(initial, list([item("a", 1), item("b", 1)]), "explicit");
  expect(paged.displayed.items.map((entry) => entry.id)).toEqual(["a", "b"]);
  expect(paged.pendingNewCount).toBe(0);
});
```

- [ ] **Step 2: 집중 test가 실패하는지 확인**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-operations-snapshot.test.ts`

Expected: FAIL because the snapshot module does not exist.

- [ ] **Step 3: immutable snapshot helper 구현**

```ts
export type AdminOperationsSnapshot = {
  displayed: AdminOperationCasesResponse;
  latest: AdminOperationCasesResponse;
  pendingNewCount: number;
};

export function receiveAdminOperationsSnapshot(
  snapshot: AdminOperationsSnapshot,
  latest: AdminOperationCasesResponse,
  mode: "poll" | "explicit",
): AdminOperationsSnapshot {
  if (mode === "explicit") return createAdminOperationsSnapshot(latest);
  const latestById = new Map(latest.items.map((item) => [item.id, item]));
  const displayedIds = new Set(snapshot.displayed.items.map((item) => item.id));
  const displayedItems = snapshot.displayed.items
    .filter((item) => latestById.has(item.id))
    .map((item) => {
      const incoming = latestById.get(item.id);
      return incoming && incoming.version >= item.version ? incoming : item;
    });
  const pendingNewCount = latest.items.filter((item) => !displayedIds.has(item.id)).length;
  return {
    displayed: { ...latest, items: displayedItems },
    latest,
    pendingNewCount,
  };
}
```

`createAdminOperationsSnapshot`은 `displayed`와 `latest`를 같은 응답으로 시작한다. `explicit` 모드는
사용자가 누른 pagination과 새 작업 관점 결과를 즉시 받아들이고, `poll` 모드만 새 ID를 숨긴다.
`applyPendingAdminOperationsSnapshot`은 `displayed = latest`, `pendingNewCount = 0`으로 만든다. helper는
입력 배열과 response를 mutate하지 않는다.

- [ ] **Step 4: snapshot test를 통과시킨다**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-operations-snapshot.test.ts`

Expected: PASS for new ID withholding, explicit pagination, removed ID exclusion, higher-version merge, explicit apply, and immutability.

- [ ] **Step 5: Task 2 커밋**

```bash
git add front/features/platform-admin/model/platform-admin-operations-snapshot.ts front/features/platform-admin/model/platform-admin-operations-snapshot.test.ts
git commit -m "feat: freeze admin operation polling order"
```

---

### Task 3: ReadMates 관리자 셸과 모바일 탐색

**Files:**
- Modify: `front/features/platform-admin/model/admin-route-catalog.ts:1-90`
- Test: `front/features/platform-admin/model/admin-route-catalog.test.ts`
- Create: `front/features/platform-admin/ui/admin-mobile-nav-drawer.tsx`
- Create: `front/features/platform-admin/ui/admin-mobile-nav-drawer.test.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx:1-172`
- Test: `front/features/platform-admin/route/admin-shell-layout.test.tsx:1-234`
- Modify: `front/features/platform-admin/route/admin-clubs-route.tsx:1-95`
- Test: `front/features/platform-admin/route/admin-clubs-route.test.tsx:1-220`
- Modify: `front/src/styles/globals.css:1029-1305,5289-5600`

**Interfaces:**
- Consumes: `ReadmatesBrandMark`, `AdminLayoutNav`, current role and workspace switcher
- Produces: `AdminMobileNavDrawer`, site-tone header, Korean nav groups, clubs-only onboarding link

- [ ] **Step 1: 셸 범위와 drawer 접근성 실패 테스트 작성**

```tsx
it("uses the 읽는사이 brand and does not expose new-club globally", () => {
  renderShell("/admin/today");
  expect(screen.getByRole("link", { name: "읽는사이 플랫폼 운영" })).toHaveAttribute("href", "/admin/today");
  expect(screen.getByText("지휘대")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "새 클럽" })).not.toBeInTheDocument();
});

it("returns focus to the menu trigger after Escape", async () => {
  const user = userEvent.setup();
  render(<AdminMobileNavDrawer role="OWNER" />);
  const trigger = screen.getByRole("button", { name: "운영 메뉴" });
  await user.click(trigger);
  expect(screen.getByRole("dialog", { name: "플랫폼 운영 메뉴" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
});
```

`AdminClubsRoute` test에는 OWNER의 `새 클럽` link가 `?onboarding=1`을 유지하고 SUPPORT에는 노출되지
않는 assertion을 추가한다. route에 role prop을 새로 전달하지 않고 기존 summary query의
`platformRole`과 `canDo(role, "create_club")`를 사용한다.

- [ ] **Step 2: shell·catalog·clubs 집중 test를 실행해 실패 확인**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/ui/admin-mobile-nav-drawer.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx features/platform-admin/route/admin-clubs-route.test.tsx`

Expected: FAIL on Korean group labels, brand link, drawer, and global new-club removal.

- [ ] **Step 3: 브랜드 header, drawer, 행동 범위를 구현**

```tsx
<Link to="/admin/today" className="admin-shell__brand" aria-label="읽는사이 플랫폼 운영">
  <ReadmatesBrandMark />
  <span className="admin-shell__brand-copy">
    <strong className="editorial">읽는사이</strong>
    <span>플랫폼 운영</span>
  </span>
</Link>
```

`AdminMobileNavDrawer`는 trigger ref와 dialog ref를 소유한다. 열릴 때 첫 link로 focus를 보내고 Tab과
Shift+Tab을 dialog 내부 첫·마지막 interactive element 사이에서 순환시키며 Escape, backdrop, route
link click으로 닫는다. 닫힐 때 trigger로 focus를 돌린다. 데스크톱 aside와 drawer는 같은
`AdminLayoutNav`를 사용한다.

```ts
const GROUP_LABELS: Record<AdminRouteGroup, string> = {
  command: "지휘대",
  operations: "운영",
  review: "기록",
};
```

`AdminShellLayout`에서 전역 `새 클럽` link만 제거하고 `onboardingOpen`, modal, commit callback은
유지한다. `AdminClubsRoute`가 summary query로 role을 읽고 OWNER/OPERATOR capability가 있을 때만
문맥 link를 렌더링한다.

- [ ] **Step 4: shell·drawer test를 통과시킨다**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/ui/admin-mobile-nav-drawer.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx features/platform-admin/route/admin-clubs-route.test.tsx`

Expected: PASS with unchanged onboarding query/modal behavior and unnamed interactive element scan.

- [ ] **Step 5: Task 3 커밋**

```bash
git add front/features/platform-admin/model/admin-route-catalog.ts front/features/platform-admin/model/admin-route-catalog.test.ts front/features/platform-admin/ui/admin-mobile-nav-drawer.tsx front/features/platform-admin/ui/admin-mobile-nav-drawer.test.tsx front/features/platform-admin/route/admin-shell-layout.tsx front/features/platform-admin/route/admin-shell-layout.test.tsx front/features/platform-admin/route/admin-clubs-route.tsx front/features/platform-admin/route/admin-clubs-route.test.tsx front/src/styles/globals.css
git commit -m "feat: align admin shell with ReadMates tone"
```

---

### Task 4: 작업 관점, 검색, 필터, 상태 원장

**Files:**
- Create: `front/features/platform-admin/ui/admin-today-controls.tsx`
- Create: `front/features/platform-admin/ui/admin-today-controls.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx:1-230`
- Test: `front/features/platform-admin/ui/admin-today-ledger.test.tsx:1-280`
- Modify: `front/src/styles/globals.css:1635-1805`

**Interfaces:**
- Consumes: `AdminOperationWorkView[]`, `AdminTodayFilters`, active work view, local query, source freshness
- Produces: `AdminTodayControls` callbacks `onWorkViewChange`, `onQueryChange`, `onFilterChange`, `onResetFilters`, ledger header and compact source status

- [ ] **Step 1: controls의 의미와 keyboard 실패 테스트 작성**

```tsx
it("renders exact-count tabs, an honest resolved tab, and active filter chips", async () => {
  const user = userEvent.setup();
  const onWorkViewChange = vi.fn();
  const onResetFilters = vi.fn();
  render(
    <AdminTodayControls
      workViews={[
        { id: "action", label: "처리 필요", count: 5 },
        { id: "mine", label: "내가 확인함", count: 3 },
        { id: "snoozed", label: "보류", count: 2 },
        { id: "resolved-today", label: "오늘 해결", count: null },
      ]}
      activeWorkView="action"
      query=""
      filters={{ state: "", severity: "critical", source: "notification", assignee: "" }}
      onWorkViewChange={onWorkViewChange}
      onQueryChange={vi.fn()}
      onFilterChange={vi.fn()}
      onResetFilters={onResetFilters}
    />,
  );
  expect(screen.getByRole("tab", { name: "오늘 해결" })).toBeInTheDocument();
  expect(screen.getByLabelText("불러온 기록 검색")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "필터 2" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "필터 초기화" }));
  expect(onResetFilters).toHaveBeenCalledOnce();
});
```

Escape로 filter dialog를 닫고 trigger로 focus가 돌아오는 test, `aria-selected`가 active work view에만
있는 test, query callback test를 함께 추가한다.

- [ ] **Step 2: controls와 ledger test가 실패하는지 확인**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-today-controls.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx`

Expected: FAIL because the controls component and new heading hierarchy are absent.

- [ ] **Step 3: header, status ledger, controls, compact source 상태 구현**

```tsx
<header className="admin-today-ledger__header">
  <div>
    <p className="eyebrow">지휘대 · 오늘</p>
    <h1 id="admin-today-title" className="h1 editorial">오늘의 운영</h1>
    <p className="admin-today-ledger__lede">먼저 확인할 일 {view.workViews[0]?.count ?? 0}건이 있습니다.</p>
  </div>
  <div className="admin-today-ledger__status-ledger" aria-label="운영 현황">
    <span>{view.mobileSummary.label}</span>
    <span>{view.generatedAtLabel} 기준</span>
    <strong>{view.sourceStatusLabel}</strong>
  </div>
</header>
```

`AdminTodayControls`의 filter surface는 `role="dialog"`, `aria-modal="false"`로 만들고 기존 state,
severity, source select를 안에 둔다. `내 담당`은 독립 toggle로 유지한다. 적용 chip은 사람이 읽는
한국어 label을 사용하며 reset은 work view를 `action`, query를 빈 값, explicit filter를 빈 값으로
보낸다. source 목록은 정상일 때 한 줄만 보이고, partial/unavailable일 때 원천별 상태와 재확인 행동을
펼쳐 보여준다.

- [ ] **Step 4: controls와 ledger test를 통과시킨다**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-today-controls.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx`

Expected: PASS for heading, status ledger, exact-count policy, filter count, reset, source status, and focus return.

- [ ] **Step 5: Task 4 커밋**

```bash
git add front/features/platform-admin/ui/admin-today-controls.tsx front/features/platform-admin/ui/admin-today-controls.test.tsx front/features/platform-admin/ui/admin-today-ledger.tsx front/features/platform-admin/ui/admin-today-ledger.test.tsx front/src/styles/globals.css
git commit -m "feat: add admin today work controls"
```

---

### Task 5: 짧은 번호가 있는 운영 기록 queue

**Files:**
- Modify: `front/features/platform-admin/ui/admin-operations-queue.tsx:1-68`
- Test: `front/features/platform-admin/ui/admin-operations-queue.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Test: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`
- Modify: `front/src/styles/globals.css:1805-1920,2063-2138`

**Interfaces:**
- Consumes: `AdminOperationCaseView[]`, `selectedCaseId`, `emptyReason`, pagination callbacks
- Produces: two-line ruled rows, visual-only locator gutter, true/filtered empty messages, `AdminTodayLoadingRows`

- [ ] **Step 1: queue의 정보 순서와 locator 안전성 실패 테스트 작성**

```tsx
it("renders the locator visually without making it the case identity", () => {
  renderQueue([caseView({ id: "uuid-case", locatorLabel: "07", scopeLabel: "읽는사이" })]);
  const row = screen.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ });
  expect(within(row).getByText("07")).toHaveAttribute("aria-hidden", "true");
  expect(row).not.toHaveAccessibleName(/07/);
  expect(row).toHaveTextContent("긴급");
  expect(row).toHaveTextContent("미확인");
  expect(row).toHaveTextContent("읽는사이");
  expect(row).toHaveTextContent("영향 2건");
  expect(row).toHaveTextContent("2시간 전");
});

it.each([
  ["true", "지금 처리할 운영 기록이 없습니다."],
  ["filtered", "현재 조건에 맞는 기록이 없습니다."],
] as const)("renders the %s empty state", (emptyReason, copy) => {
  renderQueue([], { emptyReason });
  expect(screen.getByText(copy)).toBeInTheDocument();
});
```

- [ ] **Step 2: queue test가 실패하는지 확인**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx`

Expected: FAIL on locator, scope, and differentiated empty copy.

- [ ] **Step 3: 두 줄 row와 loading/empty 상태 구현**

```tsx
<button
  type="button"
  className="admin-operations-queue__row"
  aria-selected={item.id === selectedCaseId}
  onClick={() => onSelectCase(item.id)}
>
  <span className="admin-operations-queue__locator" aria-hidden="true">{item.locatorLabel}</span>
  <span className="admin-operations-queue__body">
    <span className="admin-operations-queue__headline">
      <span className="admin-operations-queue__severity">{item.severityLabel}</span>
      <strong>{item.summary.title}</strong>
      <span>{item.stateLabel}</span>
    </span>
    <span className="admin-operations-queue__context">
      <span>{item.sourceLabel}</span>
      <span>{item.scopeLabel}</span>
      <span>{item.impactLabel}</span>
      <span>{item.ageLabel}</span>
      {item.assignedToMe ? <span>내 담당</span> : null}
    </span>
  </span>
</button>
```

선택은 `aria-selected`와 왼쪽 navy rule, 낮은 명도 배경으로 함께 표현한다. locator column에는
`font-variant-numeric: tabular-nums`를 사용한다. 최초 route loading은 실제 row 높이와 번호 gutter를
닮은 6개 skeleton row를 렌더링하고 `aria-busy="true"`를 둔다.

- [ ] **Step 4: queue·ledger test를 통과시킨다**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx`

Expected: PASS for two-line content, selected state, visual-only locator, load-more, true empty, filtered empty, and skeleton semantics.

- [ ] **Step 5: Task 5 커밋**

```bash
git add front/features/platform-admin/ui/admin-operations-queue.tsx front/features/platform-admin/ui/admin-operations-queue.test.tsx front/features/platform-admin/ui/admin-today-ledger.tsx front/features/platform-admin/ui/admin-today-ledger.test.tsx front/src/styles/globals.css
git commit -m "feat: redesign admin operations queue"
```

---

### Task 6: inspector 탭과 안전한 action hierarchy

**Files:**
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.tsx:1-178`
- Test: `front/features/platform-admin/ui/admin-operations-inspector.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-state-actions.tsx:1-115`
- Test: `front/features/platform-admin/ui/admin-operation-state-actions.test.tsx:1-105`
- Modify: `front/src/styles/globals.css:1917-2062`

**Interfaces:**
- Consumes: `AdminOperationCaseView`, `AdminOperationHistoryView[]`, `allowedActions`, existing mutation callbacks
- Produces: overview/history/evidence tabs, primary detail link, `내가 확인`, additional action menu, snooze/resolve dialogs

- [ ] **Step 1: inspector와 action keyboard 실패 테스트 작성**

```tsx
it("switches between overview history and evidence without exposing a fake actor", async () => {
  const user = userEvent.setup();
  renderInspector({ history: [historyView({ actorLabel: "운영자", actionLabel: "운영자가 확인함" })] });
  expect(screen.getByRole("tab", { name: "개요", selected: true })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "변경 기록" }));
  expect(screen.getByText("운영자")).toBeInTheDocument();
  expect(screen.getByText("운영자가 확인함")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "근거" }));
  expect(screen.getByText(/마지막 정상|기준/)).toBeInTheDocument();
});

it("traps focus in snooze and returns it to the additional-actions trigger", async () => {
  const user = userEvent.setup();
  renderActions();
  const trigger = screen.getByRole("button", { name: "추가 조치" });
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "보류…" }));
  const dialog = screen.getByRole("dialog", { name: "기록 보류" });
  expect(dialog).toBeInTheDocument();
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
});
```

- [ ] **Step 2: inspector·actions test의 실패 확인**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-operations-inspector.test.tsx features/platform-admin/ui/admin-operation-state-actions.test.tsx`

Expected: FAIL because tabs, action menu, snooze dialog, and focus trap are absent.

- [ ] **Step 3: inspector와 action surface 구현**

```tsx
<div className="admin-operations-inspector__tabs" role="tablist" aria-label="선택한 기록">
  {INSPECTOR_TABS.map((tab) => (
    <button
      key={tab.id}
      type="button"
      role="tab"
      aria-selected={activeTab === tab.id}
      aria-controls={`admin-operation-panel-${tab.id}`}
      onClick={() => setActiveTab(tab.id)}
    >
      {tab.label}
    </button>
  ))}
</div>
```

header에는 `선택한 기록 · {locatorLabel}`을 작게 표시하고 제목을 더 크게 둔다. `개요`는 사실과 권장
다음 단계, `변경 기록`은 actor category·시각·행동, `근거`는 source freshness와 기존 UUID를 code로
표시한다. UUID는 inspector 근거에서만 보며 queue accessible name에 포함하지 않는다.

action surface는 primary `원인과 영향 보기` link, secondary `내가 확인`, tertiary `추가 조치` menu
순서다. menu의 `보류…`는 1시간·4시간·24시간·7일 radio 선택 후 `이 기간 동안 보류`로 제출한다.
`해결`은 별도 확인 dialog를 사용한다. 두 dialog는 첫 interactive element focus, Tab 순환, Escape,
backdrop 취소, trigger focus return을 구현하고 취소만으로 callback을 호출하지 않는다.

- [ ] **Step 4: inspector·actions test를 통과시킨다**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-operations-inspector.test.tsx features/platform-admin/ui/admin-operation-state-actions.test.tsx`

Expected: PASS for tabs, actor category, safe evidence, allowed-action gating, snooze ISO time, resolve confirmation, pending state, focus trap, Escape, backdrop, and focus return.

- [ ] **Step 5: Task 6 커밋**

```bash
git add front/features/platform-admin/ui/admin-operations-inspector.tsx front/features/platform-admin/ui/admin-operations-inspector.test.tsx front/features/platform-admin/ui/admin-operation-state-actions.tsx front/features/platform-admin/ui/admin-operation-state-actions.test.tsx front/src/styles/globals.css
git commit -m "feat: add admin operation inspector workflow"
```

---

### Task 7: route 상태 조정과 복구 동작

**Files:**
- Modify: `front/features/platform-admin/route/admin-today-route.tsx:1-247`
- Test: `front/features/platform-admin/route/admin-today-route.test.tsx:1-365`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Test: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`

**Interfaces:**
- Consumes: Task 1 model helpers, Task 2 snapshot helpers, `platformAdminClubsQuery`, Task 4-6 UI callbacks
- Produces: URL-driven work view, local search, frozen polling, explicit new-case apply, selection-excluded recovery, action-specific messages

- [ ] **Step 1: route orchestration 실패 테스트 작성**

```tsx
it("withholds a polled case until the operator applies the new-case notice", async () => {
  const user = userEvent.setup();
  const client = seededClient([operationCase({ id: "case-a" })]);
  renderRoute(client, "/admin/today?case=case-a&view=action");
  client.setQueryData(platformAdminOperationCasePagesQuery({ states: ["OPEN", "ACKNOWLEDGED"] }).queryKey, {
    pages: [listResponse([operationCase({ id: "case-new", severity: "CRITICAL" }), operationCase({ id: "case-a" })])],
    pageParams: [null],
  });
  await waitFor(() => expect(screen.getByRole("button", { name: "새 케이스 1건" })).toBeInTheDocument());
  expect(screen.queryByText("case-new")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "새 케이스 1건" }));
  expect(await screen.findByText("case-new")).toBeInTheDocument();
});

it("clears detail instead of selecting another case when filters exclude the selection", async () => {
  renderRoute(seededClient([operationCase({ id: "selected", severity: "WARNING" })]), "/admin/today?case=selected&severity=critical");
  expect(await screen.findByText("선택한 기록이 현재 조건에서 제외되었습니다.")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "운영 기록 상세" })).not.toHaveTextContent("다른 기록");
  expect(screen.getByRole("button", { name: "필터 초기화" })).toBeInTheDocument();
});
```

추가 test는 clubs query의 이름 매핑과 `클럽 범위` fallback, 검색이 API 호출 인자에 포함되지 않는 것,
ACK/SNOOZE/RESOLVE의 서로 다른 성공 문구, `409` refetch와 재확인, active signal 오류, partial source
refetch가 lifecycle mutation을 실행하지 않는 것을 고정한다.

- [ ] **Step 2: route와 ledger 집중 test의 실패 확인**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-today-route.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx`

Expected: FAIL on snapshot notice, work-view URL, selection-excluded recovery, and action-specific results.

- [ ] **Step 3: query와 snapshot 수명주기를 route에 연결**

```ts
const clubsQuery = useQuery(platformAdminClubsQuery());
const filter = useMemo(() => effectiveAdminOperationsFilter(searchState), [searchState]);
const listQuery = useInfiniteQuery(platformAdminOperationCasePagesQuery(filter, { active: true }));
const scopeKey = JSON.stringify(filter);
const explicitResultRef = useRef(false);
const [snapshotState, setSnapshotState] = useState<{
  scopeKey: string;
  snapshot: AdminOperationsSnapshot;
} | null>(null);

useEffect(() => {
  if (!listResponse) return;
  setSnapshotState((current) => {
    if (!current || current.scopeKey !== scopeKey) {
      return { scopeKey, snapshot: createAdminOperationsSnapshot(listResponse) };
    }
    return {
      scopeKey,
      snapshot: receiveAdminOperationsSnapshot(
        current.snapshot,
        listResponse,
        explicitResultRef.current ? "explicit" : "poll",
      ),
    };
  });
  explicitResultRef.current = false;
}, [listResponse, scopeKey]);
```

filter/work view key가 바뀌거나 browser history로 돌아가면 `scopeKey` 차이로 새 snapshot을 생성한다.
`onLoadMore`는 `fetchNextPage()` 직전에 `explicitResultRef.current = true`로 표시해 사용자가 요청한 다음
page를 즉시 표시한다. `snapshotState.snapshot.displayed`로 view를 만들 때 `orderMode = "preserve"`를 전달하고
`snapshot.latest`는 새 사건 notice와 명시적 적용에만 사용한다. existing UUID의 높은 version은 즉시
반영하지만 new UUID는 적용 전 숨긴다. `filterAdminOperationItems`는 view 생성 뒤 query와
`resolved-today` 서울 날짜를 적용한다.

`runMutation`은 action을 인자로 받아 성공 문구를 각각 `기록을 내가 확인했습니다.`,
`기록을 선택한 기간 동안 보류했습니다.`, `활성 신호가 해소되어 기록을 해결했습니다.`로 표시한다.
`CASE_VERSION_CONFLICT`는 최신 detail을 refetch한 뒤 자동 재실행하지 않는다. `CASE_STILL_ACTIVE`는 해결
성공 문구를 절대 표시하지 않는다.

- [ ] **Step 4: route·ledger test를 통과시킨다**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/route/admin-today-route.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx`

Expected: PASS for URL history, pagination, stable selection, new-case apply, search scope, source retry, role gating, action messages, and typed 409 paths.

- [ ] **Step 5: frontend boundary test를 실행**

Run: `corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts`

Expected: PASS; model imports no React/router/query/API client and UI imports no query/API/route modules.

- [ ] **Step 6: Task 7 커밋**

```bash
git add front/features/platform-admin/route/admin-today-route.tsx front/features/platform-admin/route/admin-today-route.test.tsx front/features/platform-admin/ui/admin-today-ledger.tsx front/features/platform-admin/ui/admin-today-ledger.test.tsx
git commit -m "feat: orchestrate admin today recovery states"
```

---

### Task 8: 1180/768 responsive composition과 시각 baseline

**Files:**
- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx:1-107`
- Test: `front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx`
- Create: `front/features/platform-admin/ui/admin-today-ledger.ct.tsx`
- Create: `front/__screenshots__/features/platform-admin/ui/admin-today-ledger.ct.tsx/admin-today-wide-1440.png`
- Create: `front/__screenshots__/features/platform-admin/ui/admin-today-ledger.ct.tsx/admin-today-compact-900.png`
- Create: `front/__screenshots__/features/platform-admin/ui/admin-today-ledger.ct.tsx/admin-today-mobile-list-390.png`
- Create: `front/__screenshots__/features/platform-admin/ui/admin-today-ledger.ct.tsx/admin-today-mobile-detail-390.png`
- Modify: `front/src/styles/globals.css:1029-2138,5289-5600,6180-6285`

**Interfaces:**
- Consumes: the same `AdminOperationsView`, history, controls, and lifecycle callbacks at every width
- Produces: wide split view, compact/mobile drill-in, focus and scroll restoration, mobile sticky action bar, four visual baselines

- [ ] **Step 1: breakpoint와 focus 복원의 실패 test 작성**

```tsx
it.each([
  [1180, "wide"],
  [1179, "compact"],
  [768, "compact"],
  [767, "mobile"],
] as const)("uses %s px as %s operations layout", (width, expected) => {
  expect(adminOperationsLayoutForWidth(width)).toBe(expected);
});

it("restores the selected row and scroll after compact detail closes", async () => {
  const user = userEvent.setup();
  renderMobileDetail({ layout: "compact" });
  const row = screen.getByRole("button", { name: /알림 전달 실패/ });
  await user.click(row);
  expect(screen.getByRole("button", { name: "운영 목록" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "운영 목록" }));
  expect(row).toHaveFocus();
});
```

- [ ] **Step 2: mobile detail test의 실패 확인**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-operation-mobile-detail.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx`

Expected: FAIL because the current only breakpoint is 600px and compact 768-1179 behavior is absent.

- [ ] **Step 3: 세 layout과 focus/scroll 상태를 구현**

```ts
export type AdminOperationsLayout = "wide" | "compact" | "mobile";

export function adminOperationsLayoutForWidth(width: number): AdminOperationsLayout {
  if (width >= 1180) return "wide";
  if (width >= 768) return "compact";
  return "mobile";
}
```

wide는 `AdminOperationsQueue`와 sticky `AdminOperationsInspector`를 같은 grid에 둔다. compact와 mobile은
`AdminOperationMobileDetail`의 list→detail 상태를 공유하되 mobile에서 header spacing과 sticky bottom
action bar를 활성화한다. 상세 진입 때 `운영 목록` back button으로 focus를 보내고 돌아올 때 선택 row와
window scroll을 복원한다. `padding-bottom: calc(action-bar-height + env(safe-area-inset-bottom))`으로 마지막
본문이 가려지지 않게 한다.

- [ ] **Step 4: responsive unit test를 통과시킨다**

Run: `corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-operation-mobile-detail.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx`

Expected: PASS for all breakpoint boundaries, list/detail transition, filter preservation, scroll restoration, and focus restoration.

- [ ] **Step 5: CT fixture와 baseline을 생성**

```tsx
function source(
  sourceType: AdminOperationSourceType,
  status: AdminOperationSourceStatus,
): AdminOperationSourceFreshness {
  return {
    sourceType,
    status,
    generatedAt: "2026-08-12T01:42:00Z",
    lastSuccessfulAt: status === "AVAILABLE" ? "2026-08-12T01:42:00Z" : "2026-08-12T01:30:00Z",
    authoritative: status === "AVAILABLE",
  };
}

function operationCase(overrides: Partial<AdminOperationCase>): AdminOperationCase {
  const sourceType = overrides.sourceType ?? "NOTIFICATION";
  return {
    id: "case-default",
    sourceType,
    clubId: null,
    state: "OPEN",
    severity: "WARNING",
    summaryCode: sourceType === "AI_JOB" ? "AI_JOB_FAILED" : "NOTIFICATION_DELIVERY_FAILURE",
    firstObservedAt: "2026-08-12T00:00:00Z",
    lastObservedAt: "2026-08-12T01:40:00Z",
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: true,
    reopenCount: 0,
    version: 1,
    impactCount: 2,
    detailHref: sourceType === "AI_JOB" ? "/admin/ai-ops" : "/admin/notifications",
    allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"],
    source: source(sourceType, sourceType === "AI_JOB" ? "PARTIAL" : "AVAILABLE"),
    ...overrides,
  };
}

function historyEvent(reasonCode: AdminOperationReasonCode): AdminOperationCaseEvent {
  return {
    fromState: null,
    toState: "OPEN",
    action: null,
    reasonCode,
    occurredAt: "2026-08-12T00:00:00Z",
    caseVersion: 1,
  };
}

const visualResponse: AdminOperationCasesResponse = {
  schema: "admin.operation_cases.v1",
  generatedAt: "2026-08-12T01:42:00Z",
  counts: { open: 7, critical: 2, assignedToMe: 3, snoozed: 2 },
  sources: [source("NOTIFICATION", "AVAILABLE"), source("AI_JOB", "PARTIAL")],
  items: [
    operationCase({ id: "case-critical", severity: "CRITICAL", clubId: "club-reading-sai" }),
    operationCase({ id: "case-warning", severity: "WARNING", sourceType: "AI_JOB", assignedToMe: false }),
    operationCase({ id: "case-snoozed", severity: "INFO", state: "SNOOZED", assignedToMe: false }),
  ],
  nextCursor: null,
};

const fixtureProps: React.ComponentProps<typeof AdminTodayLedger> = {
  view: buildAdminOperationsView(
    visualResponse,
    "case-critical",
    new Date("2026-08-12T01:42:00Z"),
    new Map([["club-reading-sai", "읽는사이"]]),
  ),
  filters: { state: "", severity: "", source: "", assignee: "" },
  history: buildAdminOperationHistory([historyEvent("SIGNAL_OPENED")]),
  lifecycleControls: <button type="button">내가 확인</button>,
  workView: "action",
  query: "",
  onWorkViewChange: () => undefined,
  onQueryChange: () => undefined,
  onFilterChange: () => undefined,
  onResetFilters: () => undefined,
  onSelectCase: () => undefined,
};

test("admin today wide 1440", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const component = await mount(<MemoryRouter><AdminTodayLedger {...fixtureProps} /></MemoryRouter>);
  await expect(component).toHaveScreenshot("admin-today-wide-1440.png", { fullPage: true });
});
```

같은 fixture에서 900px compact list, 390px mobile list, row click 뒤 390px mobile detail을 각각 capture한다.
fixture에는 긴급·경고·보류 행, 클럽·플랫폼 scope, partial source, history, OWNER action을 포함하고 실제
사용자 데이터나 token-shaped 값을 넣지 않는다.

Run: `corepack pnpm --dir front test:ct:update`

Expected: four named PNG baselines are created inside the repository screenshot directory.

- [ ] **Step 6: baseline 검증을 다시 실행**

Run: `corepack pnpm --dir front test:ct`

Expected: PASS with no pixel diff above the repository `0.02` ratio.

- [ ] **Step 7: Task 8 커밋**

```bash
git add front/features/platform-admin/ui/admin-today-ledger.tsx front/features/platform-admin/ui/admin-operation-mobile-detail.tsx front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx front/features/platform-admin/ui/admin-today-ledger.ct.tsx front/__screenshots__/features/platform-admin/ui/admin-today-ledger.ct.tsx front/src/styles/globals.css
git commit -m "feat: finish responsive admin operations surface"
```

---

### Task 9: E2E, full frontend gate, independent review

**Files:**
- Modify: `front/tests/e2e/admin-today.spec.ts:1-130`
- Modify: `front/tests/e2e/admin-operations-command-center.spec.ts:1-420`
- Modify: `front/tests/e2e/admin-shell.spec.ts:1-220`

**Interfaces:**
- Consumes: completed admin shell and today route
- Produces: OWNER/SUPPORT, pagination, polling, recovery, 1440/900/390 browser evidence and final branch-quality evidence

- [ ] **Step 1: E2E expectations를 새 운영 언어와 flow로 수정**

```ts
test("desktop keeps the record list while inspecting the selected operation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installOperationsHarness(page);
  await page.goto("/admin/today?case=case-notification&view=action");
  await expect(page.getByRole("heading", { name: "오늘의 운영" })).toBeVisible();
  await expect(page.getByRole("region", { name: "운영 기록 목록" })).toBeVisible();
  await expect(page.getByRole("region", { name: "운영 기록 상세" })).toBeVisible();
  await expect(page.getByText("01", { exact: true })).toBeVisible();
});

test("mobile completes list detail action and back without losing context", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installOperationsHarness(page);
  await page.goto("/admin/today?case=case-notification&view=action&source=notification");
  const row = page.getByRole("button", { name: /알림 전달 실패/ });
  await row.click();
  await expect(page.getByRole("button", { name: "운영 목록" })).toBeFocused();
  await page.getByRole("button", { name: "내가 확인" }).click();
  await expect(page.getByRole("status")).toContainText("기록을 내가 확인했습니다.");
  await page.getByRole("button", { name: "운영 목록" }).click();
  await expect(row).toBeFocused();
  await expect(page).toHaveURL(/source=notification/);
});
```

900px test는 queue와 inspector가 동시에 세로로 쌓이지 않고 list→detail로 전환되는지 확인한다. polling
test는 새 ID가 `새 케이스 1건` 적용 전 보이지 않는지 확인한다. SUPPORT test는 direct POST 403과 UI
action 부재를 유지한다. source retry test는 list request 1회와 mutation request 0회를 확인한다.

- [ ] **Step 2: 집중 E2E 실행**

Run: `corepack pnpm --dir front exec playwright test tests/e2e/admin-today.spec.ts tests/e2e/admin-operations-command-center.spec.ts tests/e2e/admin-shell.spec.ts --project=chromium`

Expected: PASS for OWNER, OPERATOR, SUPPORT, shell onboarding scope, wide/compact/mobile, mutation, version conflict, partial source, and new-case polling.

- [ ] **Step 3: E2E 변경 커밋**

```bash
git add front/tests/e2e/admin-today.spec.ts front/tests/e2e/admin-operations-command-center.spec.ts front/tests/e2e/admin-shell.spec.ts
git commit -m "test: verify redesigned admin operations workflow"
```

- [ ] **Step 4: 전체 frontend unit·boundary regression 실행**

Run: `corepack pnpm --dir front test`

Expected: PASS with zero failed Vitest tests.

- [ ] **Step 5: lint와 production build 실행**

Run: `corepack pnpm --dir front lint`

Expected: exit 0 with no ESLint errors.

Run: `corepack pnpm --dir front build`

Expected: exit 0 and Vite production assets emitted successfully.

- [ ] **Step 6: canonical full E2E를 최종 HEAD에서 한 번 실행**

Run: `corepack pnpm --dir front test:e2e`

Expected: PASS with zero failed Playwright tests. 로컬 MySQL, port, or container 문제로 실행하지 못하면 통과로 기록하지 않고 exact failure와 skipped evidence를 남긴다.

- [ ] **Step 7: public safety와 diff hygiene 검사**

```bash
git diff --check origin/main..HEAD
rg -n '(^|[^A-Za-z0-9_])([o]cid1\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)' front/features/platform-admin front/tests/e2e front/__screenshots__
```

Expected: `git diff --check` exits 0 and the safety scan returns no newly introduced private-looking value. Existing public-safe `example.test` fixture addresses are allowed.

- [ ] **Step 8: independent review gate**

검토자는 `origin/main..HEAD`를 대상으로 다음을 확인한다.

- UUID와 locator가 섞이지 않는가.
- `SUPPORT`가 mutation control을 얻지 않는가.
- polling이 읽는 중인 순서를 바꾸지 않는가.
- selection excluded, partial source, 409, active signal이 각각 다른 복구 경로를 갖는가.
- 1180/768/767 경계에서 queue와 inspector가 중복 노출되지 않는가.
- 시안의 사이트 톤이 기존 token을 재사용하고 새 제품처럼 분리되지 않는가.

발견된 actionable issue를 수정한 뒤 영향 집중 test와 Step 4-7의 최종 gate를 다시 실행한다.

- [ ] **Step 9: review 수정이 있으면 별도 커밋**

```bash
git add front/features/platform-admin front/src/styles/globals.css front/tests/e2e
git diff --cached --quiet || git commit -m "fix: address admin redesign review"
```

---

## Requirement Traceability

| Requirement | Tasks | Evidence |
| --- | --- | --- |
| 사이트와 같은 브랜드·톤 | 3, 8 | shell tests, 1440/900/390 CT baselines |
| 한국어 탐색과 문맥 새 클럽 | 3, 9 | catalog/shell/clubs tests, admin-shell E2E |
| 제목→상태→관점→필터→queue→inspector 위계 | 4, 5, 6 | component tests, visual baselines |
| 짧은 번호와 UUID 분리 | 1, 5, 7 | model, queue accessibility, E2E |
| 새 사건 적용 전 순서 동결 | 2, 7, 9 | snapshot test, route test, polling E2E |
| work views와 검색 | 1, 4, 7 | URL/model/controls/route tests |
| 목록·상세와 감사 timeline | 5, 6 | queue/inspector tests |
| 안전한 조치와 409 재확인 | 6, 7, 9 | action, route, command-center E2E |
| true empty, filtered empty, selection excluded | 5, 7 | queue and route tests |
| partial source와 last-known-good | 4, 7, 9 | ledger, route, E2E |
| 1180/768/767 responsive flow | 8, 9 | breakpoint unit, CT, E2E |
| 모바일 filter·scroll·focus 복원 | 8, 9 | mobile detail tests and E2E |
| SUPPORT read-only | 6, 7, 9 | UI, route, direct POST E2E |
| 기존 API/DB 계약 유지 | all | no server/BFF/migration diff, frontend boundary test |

## Acceptance Matrix Selection

- **UI or runtime state — selected:** loading, true empty, filtered empty, selection excluded, denied, stale/partial, error, wrapping, wide, compact, mobile을 직접 바꾼다. component/route test와 CT/E2E가 필요하다.
- **Actor or authorization — selected narrowly:** 서버 권한 의미는 바꾸지 않지만 `SUPPORT` read-only UI와 direct mutation denial을 보존해야 한다. focused route test와 기존 direct POST E2E를 유지한다.
- **Cursor collection — selected:** work view와 검색이 현재 loaded pages를 사용하고 load-more 뒤 결과를 재계산한다. first/continuation/last page와 selection 보존을 route test로 검증한다.
- **Async, cache, or provider — selected narrowly:** TanStack polling, new-case snapshot, partial source, last-known-good, retry UI를 변경한다. retry/dead provider 자체 구현은 변경하지 않는다.
- **BFF/OAuth — excluded:** request path, cookie, trusted header, redirect 계약을 변경하지 않는다.
- **Persistence or migration — excluded:** server와 DB를 변경하지 않는다.
- **Guest/public exposure and guest DTO privacy — excluded:** `/admin/**` authenticated platform surface만 변경하며 public projection을 건드리지 않는다.
- **Club context — excluded as an authorization boundary:** preloaded admin clubs query는 표시명 lookup에만 사용하고 API 요청의 trusted club context를 만들거나 바꾸지 않는다.

## Parallel and Runtime Safety

- Task 1과 Task 3은 논리적으로 독립적이지만 Task 3과 Task 4-8이 모두 `globals.css`를 수정하므로 같은 worktree에서 동시에 편집하지 않는다.
- Task 4-8은 `admin-today-ledger.tsx`와 관련 test를 공유하므로 반드시 순서대로 실행한다.
- CT Docker, full E2E MySQL, Vite build output은 병렬 실행하지 않는다.
- execution 시작 시 별도 worktree를 사용하고 기존 local server, port, database, container, cache를 먼저 확인한다.
- 실제 운영 배포, 실제 AI provider 호출, 실제 이메일 발송, billable action은 이 계획 범위가 아니다.

## Completion Evidence

완료 보고는 다음 순서로 남긴다.

1. 변경 표면과 사용자 흐름
2. focused Vitest 결과
3. frontend boundary, full test, lint, build 결과
4. 1440/900/390 CT 결과와 screenshot 경로
5. focused E2E와 canonical full E2E 결과
6. `git diff --check`와 public-safety scan
7. independent review findings와 수정 여부
8. 실행하지 못한 검증, 남은 API 정확성 경계, 배포하지 않았다는 사실
