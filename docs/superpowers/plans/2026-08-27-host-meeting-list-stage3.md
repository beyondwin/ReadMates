# 호스트 모임 목록 통합 (리디자인 3단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/sessions`를 "다가오는 모임 + 지난 모임" 두 구역의 차례(목차)식 단일 목록으로 재구성해 기록 장부의 내용을 흡수하고, 휴지통 진입을 목록 하단 링크 하나로 통일한다(스펙 §4.2 목록).

**Architecture:** 현행 `/sessions`는 `HostMeetingList`(예정 중심, `mode=meeting`), `/records`는 `HostSessionLedger`(`mode=record` + 필터 + 휴지통)로 분리되어 있다. 이 단계는 `/sessions`에 두 구역 목록을 구현한다: 다가오는 구역은 `hostMeetingSessionListQuery`, 지난 구역은 `hostSessionRecordLedgerQuery`(mode=record)를 그대로 쓴다. **`/records` URL과 기존 `HostSessionLedger` 화면은 6단계 전환까지 그대로 둔다** — 이 단계의 산출은 `/sessions`가 지난 모임까지 담는 것.

**Tech Stack:** React/Vite, TypeScript, TanStack Query, Vitest.

**Spec:** 설계 문서 §4.2(목록 두 불릿), §5, §7. 시안: `docs/development/host-redesign-mockups/05-home-desktop-b.png`(차례 문법 — 홈이 아니라 목록에 적용).

ADR impact: new — ADR-0046

## Global Constraints

- 상태 라벨은 `hostMeetingLifecycleLabel`만 사용.
- 차례 행 문법: 좌측 회차 mono 번호(`formatMeetingOrdinal(n, "folio")` = `No.n`) + 제목, 점선 리더, 우측 정렬 mono 요약. 지난 모임 요약은 조회 가능한 데이터로 한정(`recordStatus`, `needsAttention`, 날짜 — 참석 n/m 집계 필드는 목록 계약에 없으므로 넣지 않는다).
- attention 마커는 색 단독 금지 — 텍스트 병기.
- 서버 계약 변경 없음. 페이지네이션은 기존 커서 방식 유지(구역별 "더 보기").
- 휴지통: 목록 하단의 조용한 링크 1개(기존 `HOST_ROUTE_HREFS.trashCompatibility` = `/sessions?view=trash` 재사용, 뷰는 기존 위임 로직 유지).
- 각 태스크 종료 시 커밋.

---

### Task 0: 앵커 재확인

- [ ] **Step 1:**

```bash
rg -n "HostMeetingListRow" front/features/host/model/host-meeting-list-model.ts
rg -n "HostMeetingListRouteData" front/features/host/route/host-meeting-list-data.ts
rg -n "hostSessionRecordLedgerQuery" front/features/host/queries/host-session-record-queries.ts
rg -n "formatMeetingOrdinal" front/shared/model/meeting-language.ts
rg -n "trashCompatibility" front/shared/routing/host-route-destinations.ts
```
Expected: 모두 히트. 2단계가 이 표면을 바꿨다면(예: 라벨 함수) 실제 코드를 기준으로 조정한다.

---

### Task 1: 목록 모델 — 두 구역 + 차례 요약

**Files:**
- Modify: `front/features/host/model/host-meeting-list-model.ts`
- Test: `front/features/host/model/host-meeting-list-model.test.ts`

**Interfaces:**
- Consumes: `HostSessionListItem`(다가오는), `HostSessionLedgerItem`(지난) — 두 타입은 동일 필드 집합(교차 표면 노트 참조).
- Produces (Task 2·3이 사용):

```ts
export type HostMeetingTocRow = {
  id: string;
  ordinalFolio: string;            // "No.25"
  title: string;                   // 책 제목 우선, 없으면 세션 제목
  lifecycleLabel: string;          // hostMeetingLifecycleLabel(state)
  attentionLabel: string | null;   // 예: "기록 확인 필요" (색 병기용 텍스트)
  summary: string;                 // 우측 mono 요약: 예정 → "MM-DD 예정일", 지난 → "기록 정리 중 · MM-DD"
  href: string;                    // 회차 상세
};

export type HostMeetingTocSections = {
  upcoming: { rows: HostMeetingTocRow[]; nextCursor: string | null };
  past: { rows: HostMeetingTocRow[]; nextCursor: string | null };
};

export function buildHostMeetingTocSections(input: {
  basePath: string;
  upcomingItems: readonly HostSessionListItem[];
  upcomingCursor: string | null;
  pastItems: readonly HostSessionLedgerItem[];
  pastCursor: string | null;
}): HostMeetingTocSections;
```

기존 `HostMeetingListRow`와 그 소비처는 유지한 채 추가한다(교체는 Task 2에서 UI와 함께).

- [ ] **Step 1: 실패 테스트** — 대표 케이스 3개:

```ts
it("formats folio ordinals and lifecycle labels from the dictionary", () => {
  const sections = buildHostMeetingTocSections({ basePath, upcomingItems: [openItem(25)], upcomingCursor: null, pastItems: [], pastCursor: null });
  expect(sections.upcoming.rows[0]?.ordinalFolio).toBe("No.25");
  expect(sections.upcoming.rows[0]?.lifecycleLabel).toBe("준비 중");
});

it("summarizes past rows from record status and date only (no invented tallies)", () => {
  const sections = buildHostMeetingTocSections({ basePath, upcomingItems: [], upcomingCursor: null, pastItems: [closedItem(24)], pastCursor: null });
  expect(sections.past.rows[0]?.summary).toMatch(/기록 정리 중/);
});

it("carries attention as text, not color-only", () => {
  const item = { ...closedItem(24), needsAttention: true };
  const sections = buildHostMeetingTocSections({ basePath, upcomingItems: [], upcomingCursor: null, pastItems: [item], pastCursor: null });
  expect(sections.past.rows[0]?.attentionLabel).toBeTruthy();
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- features/host/model/host-meeting-list-model.test.ts`.
- [ ] **Step 3: 구현** (위 시그니처대로; 픽스처는 테스트 파일 내 최소 구성).
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: Commit**

```bash
git add front/features/host/model/host-meeting-list-model.ts front/features/host/model/host-meeting-list-model.test.ts
git commit -m "feat(host): build two-section TOC rows for the unified meeting list"
```

---

### Task 2: 차례식 목록 UI

**Files:**
- Modify: `front/features/host/ui/meeting-list/host-meeting-list.tsx` (내부 재구성 — export 이름 유지)
- Create: `front/features/host/ui/meeting-list/meeting-toc-row.tsx` (점선 리더 행)
- Test: `front/features/host/ui/meeting-list/host-meeting-list.test.tsx`

**Interfaces:**
- Consumes: `HostMeetingTocSections` (Task 1).
- Produces: `HostMeetingList` props를 `{ sections: HostMeetingTocSections; onLoadMoreUpcoming: () => void; onLoadMorePast: () => void; loadingMoreUpcoming: boolean; loadingMorePast: boolean; trashHref: string; newMeetingHref: string; LinkComponent?; loading?; errorMessage?; onRetry? }`로 교체한다. (기존 props 소비자는 meeting-list route 하나뿐 — Task 3에서 함께 갱신.)

- [ ] **Step 1: 실패 테스트** — 구역 헤더 2개("다가오는 모임", "지난 모임"), 차례 행(mono folio + 점선 리더 + mono 요약), 하단 휴지통 quiet 링크, 빈 상태 4분화 중 최초 사용("첫 모임 만들기") 단언.
- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- features/host/ui/meeting-list`.
- [ ] **Step 3: 구현**

행 마크업 골격(점선 리더는 CSS `border-bottom: 1px dotted var(--line-strong)`의 flex 스페이서):

```tsx
<li className="rm-meeting-toc__row">
  <span className="rm-meeting-toc__no mono">{row.ordinalFolio}</span>
  <LinkComponent to={row.href} className="rm-meeting-toc__title">{row.title}</LinkComponent>
  {row.attentionLabel ? <span className="rm-meeting-toc__attention">{row.attentionLabel}</span> : null}
  <span className="rm-meeting-toc__leader" aria-hidden />
  <span className="rm-meeting-toc__summary mono">{row.summary}</span>
</li>
```

모바일(§4.4): 표 문법 대신 `핵심 사실 1줄 + 상태 + 시각` 리스트로 재구성 — 점선 리더 생략, 행 전체 44px+ 탭 타겟.

- [ ] **Step 4: 통과 확인 + lint.**
- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/meeting-list
git commit -m "feat(host): render the unified meeting list as a two-section table of contents"
```

---

### Task 3: 라우트 — 지난 모임 데이터 결합

**Files:**
- Modify: `front/features/host/route/host-meeting-list-data.ts` (로더가 `hostSessionRecordLedgerQuery({ page: { limit: 50 } })`를 병렬로 프리페치, `HostMeetingListRouteData`의 `view: "meeting"` 분기에 `pastPage: HostSessionRecordLedgerPage | null` 추가)
- Modify: `front/features/host/route/host-meeting-list-route.tsx` (두 구역 각각 load-more; `buildHostMeetingTocSections`로 합성; 새 props 전달)
- Test: `front/features/host/route/host-meeting-list-data.test.ts`

**Interfaces:**
- Consumes: Task 1·2 산출, 기존 `hostMeetingListPageQuery`, `hostSessionRecordLedgerQuery`, `hostSessionTrashListQuery`(트래시 위임 불변).
- Produces: `/sessions` 화면 계약 — e2e `responsive-navigation-chrome.spec.ts`가 단언하는 heading `모임`과 빈 상태 CTA는 유지.

- [ ] **Step 1: 로더 테스트 갱신(실패 유도)** — meeting view 데이터에 `pastPage` 포함 단언.
- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- features/host/route/host-meeting-list-data.test.ts`.
- [ ] **Step 3: 구현** — 로더 병렬 fetch(실패 시 `pastPage: null` + 라우트에서 부분 실패 문법(§6): 지난 구역만 재시도 행). load-more는 각 구역의 커서로 `queryClient.fetchQuery` 후 append(기존 `appendedItems` 패턴 답습).
- [ ] **Step 4: 통과 확인** — `pnpm --dir front test -- features/host/route/host-meeting-list features/host/ui/meeting-list features/host/model/host-meeting-list-model.test.ts`.
- [ ] **Step 5: Commit**

```bash
git add front/features/host/route front/features/host/ui/meeting-list
git commit -m "feat(host): feed past-record pages into the unified meeting list route"
```

---

### Task 4: 단계 검증

- [ ] **Step 1:** `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`.
- [ ] **Step 2:** 영향 e2e — `/sessions` 관련: `responsive-navigation-chrome.spec.ts`, `multi-club-flow.spec.ts`, `host-new-meeting.spec.ts`, `host-club-operations.spec.ts`(휴지통 flow). 단언 문구가 바뀐 곳만 갱신 후 `pnpm --dir front test:e2e`(불가 시 스킵 보고).
- [ ] **Step 3:** 기록 화면(`/records`)이 이 단계에서 변경되지 않았음을 확인(`git diff --stat`에 host-session-ledger 미포함) — 6단계 전환 전 이중 노출은 의도된 과도기임을 최종 보고에 명시.
- [ ] **Step 4:** 최종 보고.
