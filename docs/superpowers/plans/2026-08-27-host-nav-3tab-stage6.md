# 호스트 내비 3탭 전환 + 구 라우트 리다이렉트 (리디자인 6단계) Implementation Plan

> **Superseded — 실행 금지:** ADR-0048/0049 기반 `2026-08-29-host-lifecycle-operating-room-program-index.md`가 최신 승인 구현 권위다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호스트 1차 내비게이션을 3탭(오늘·모임·멤버)으로 전환하고, 흡수된 화면(`/records`, `/operations`, `/invitations`)을 새 목적지로 리다이렉트한다(스펙 §3). 2~5단계가 모두 릴리스된 뒤 마지막에 스위치한다.

**Architecture:** 내비 정의는 `src/app/layouts/app-route-layout.tsx`의 `primaryNavigationItems`(데스크톱·모바일 공용, `AppClubShell` → `MobileTabBar`가 소비)와 `shared/ui/readmates-copy.ts` 라벨 상수에 있다. 목적지 인벤토리는 `src/app/route-continuity.ts`의 `HOST_ROUTE_DESTINATION_INVENTORY`, 역할 전환은 `src/app/workspace-route-model.ts`. 리다이렉트는 기존 얇은 route element 패턴(`Navigate replace`)을 답습한다. URL 상수(`HOST_ROUTE_PATHS`)는 삭제하지 않는다 — 경로는 남고 요소만 리다이렉트로 바뀐다.

**Tech Stack:** React Router, TypeScript, Vitest, Playwright e2e.

**Spec:** 설계 문서 §3(3탭 표), §9 6단계.

ADR impact: new — ADR-0046

## Global Constraints

- 3탭: 오늘(`/app/host`) · 모임(`/sessions`) · 멤버(`/members`). 알림 작업대(`/notifications`)는 화면 유지 + 1차 내비 없음(진입은 오늘 큐·다이어리 발송 액션).
- 리다이렉트 매핑: `/records` → `/sessions` (검색 파라미터 보존), `/operations` → `/app/host`(오늘), `/invitations` → `/members`. 전부 `replace`.
- current 하이라이트 규칙: 기록 소유 상세(`/sessions/:id/feedback-document`, record-return 상태)는 **모임** 탭 current로 통합(기존 기록 탭 규칙 대체).
- 서버·BFF 변경 없음. 프런트 라우팅 표면만.
- 각 태스크 종료 시 커밋.

---

### Task 0: 앵커 재확인 (선행 단계 완료 검증 포함)

- [ ] **Step 1: 선행 단계 산출 확인**

```bash
rg -n "HostTodayPage" front/features/host/ui/today -l
rg -n "buildHostMeetingTocSections" front/features/host/model/host-meeting-list-model.ts
rg -n "MemberInvitationsSection" front/features/host/ui/members -l
```
Expected: 모두 히트(2·3·5단계 완료). 하나라도 없으면 해당 단계를 먼저 완료한다.

- [ ] **Step 2: 내비 앵커 확인**

```bash
rg -n "READMATES_PRIMARY_NAV_LABELS|READMATES_MOBILE_TAB_LABELS" front/shared/ui/readmates-copy.ts
rg -n "host-records" front/src/app/layouts/app-route-layout.tsx
rg -n "HOST_ROUTE_DESTINATION_INVENTORY" front/src/app/route-continuity.ts
rg -n "hostTabs" front/shared/ui/mobile-tab-bar.tsx
```

---

### Task 1: 리다이렉트 요소 3종

**Files:**
- Create: `front/src/app/host-routes/records-redirect-element.tsx`
- Create: `front/src/app/host-routes/operations-redirect-element.tsx`
- Create: `front/src/app/host-routes/invitations-redirect-element.tsx`
- Modify: `front/src/app/routes/host.tsx` (`records`/`operations`/`invitations` 경로의 lazy 요소 교체)
- Test: `front/src/app/host-routes/host-redirects.test.tsx` (신규)

**Interfaces:**
- Consumes: 기존 `Navigate` 패턴(`edit-session-route-element.tsx`와 동일 구조), `HOST_ROUTE_HREFS`.
- Produces: 예시 —

```tsx
import { Navigate, useLocation } from "react-router";

export function HostRecordsRedirectElement() {
  const location = useLocation();
  const target = location.pathname.replace(/\/records$/, "/sessions");
  return <Navigate replace to={`${target}${location.search}`} state={location.state} />;
}
```

operations는 `/operations$` → `""`(호스트 루트), invitations는 `/invitations$` → `/members`. scoped(`/clubs/:slug/app/host/...`)와 unscoped 모두 pathname 치환으로 자동 대응.

- [ ] **Step 1: 실패 테스트** — 세 요소 각각 scoped/unscoped 경로 + search 보존 단언(MemoryRouter 렌더).
- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- src/app/host-routes/host-redirects.test.tsx`.
- [ ] **Step 3: 구현 + 라우트 테이블 교체.** 흡수된 화면의 route element·loader import는 제거하되 feature UI 파일은 이 단계에서 삭제하지 않는다(삭제는 릴리스 안정 후 별도 정리 커밋 — 최종 보고에 명시).
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: Commit**

```bash
git add front/src/app
git commit -m "feat(host): redirect records, operations, invitations into their absorbing destinations"
```

---

### Task 2: 3탭 내비 정의 전환

**Files:**
- Modify: `front/shared/ui/readmates-copy.ts` (`READMATES_PRIMARY_NAV_LABELS.host`에서 `records` 제거; `READMATES_MOBILE_TAB_LABELS`의 `hostRecords` 제거)
- Modify: `front/src/app/layouts/app-route-layout.tsx` (`host-records` 항목 삭제; `host-meetings` current 매처에 `/app/host/records`(리다이렉트 중간 상태)와 `sessions/:id/closing|feedback-document` 흡수; `hostRecordOwnedRoute` 재매핑을 모임 탭으로)
- Modify: `front/shared/ui/mobile-tab-bar.tsx` (`hostTabs()` 폴백에서 records 제거)
- Test: `front/src/app/layouts/app-route-layout.test.tsx`(존재 시 — Task 0에서 확인; 없으면 route-continuity 테스트로 커버)

**Interfaces:**
- Consumes: Task 1 리다이렉트(records URL이 sessions로 수렴).
- Produces: 데스크톱 top-nav와 모바일 tab-bar가 동일한 3항목을 렌더.

- [ ] **Step 1: 실패 테스트 갱신** — 내비 항목을 단언하는 기존 테스트(`src/app/host-route-destination-inventory.test.ts`의 "4 primary" 단언 등)를 3탭 기준으로 갱신:

```bash
rg -n "records|기록" front/src/app/host-route-destination-inventory.test.ts front/src/app/workspace-route-model.test.ts front/src/app/router-route-order.test.tsx
```
히트를 §3 표 기준으로 수정(기록 관련 destination은 `host-primary` → 모임 소유 detail/secondary로 강등).

- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- src/app`.
- [ ] **Step 3: 구현** — `HOST_ROUTE_DESTINATION_INVENTORY`와 `workspace-route-model.ts`의 SafeRouteFamily 매핑도 함께 갱신(기록 계열 family를 meeting 계열로).
- [ ] **Step 4: 통과 확인** — `pnpm --dir front test -- src/app shared/ui`.
- [ ] **Step 5: Commit**

```bash
git add front/src/app front/shared/ui
git commit -m "feat(host): switch host primary navigation to the three-tab composition"
```

---

### Task 3: e2e·계속성 정합

**Files:**
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts` (모바일 탭 텍스트 `["오늘","모임","멤버"]`, 기록 소유 current 재매핑 단언)
- Modify: `front/tests/e2e/host-club-operations.spec.ts` (`/operations` 진입 단언 → 리다이렉트 후 오늘 큐 단언; 휴지통 flow는 sessions 기준 유지)
- Modify: 기타 `/records`·`/invitations`를 직접 방문하는 spec (`rg -n '"/app/host/(records|operations|invitations)"' front/tests/e2e`)
- Test: 수정한 spec 자체.

- [ ] **Step 1: spec 갱신 → Step 2: `pnpm --dir front test:e2e` 실행**(로컬 인프라 불가 시 스킵 보고 — 단, 이 단계는 라우팅 전환이므로 e2e 없이 완료 선언하지 않는다. 실행 불가 시 최종 보고에 "e2e 미실행, 머지 전 필수"를 명시).
- [ ] **Step 3: Commit**

```bash
git add front/tests/e2e
git commit -m "test(host): align e2e navigation assertions with the three-tab host shell"
```

---

### Task 4: 단계 검증 + 릴리스 정리

- [ ] **Step 1:** `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`.
- [ ] **Step 2:** CHANGELOG/Unreleased에 IA 전환(운영 허브·기록 장부·독립 초대 화면 흡수, 구 URL 리다이렉트)을 운영자 관점으로 기록.
- [ ] **Step 3:** ADR-0046 `Proposed → Accepted` 승격 조건 점검(§10): 6단계 완료 + 스크린샷·e2e 정합 + `front/DESIGN.md`·architecture 문서 동기화. 충족 시 ADR-0044를 `Superseded by ADR-0046`, ADR-0045를 admin 범위로 축소 표기하고 `docs/development/adr/README.md` 인덱스 갱신.
- [ ] **Step 4:** 최종 보고 — 남은 정리(흡수된 feature UI 파일 삭제, 알림 워크벤치 리디자인, 서버 스펙 후보 3건)를 후속 목록으로.
