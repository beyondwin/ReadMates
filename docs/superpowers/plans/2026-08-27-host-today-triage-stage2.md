# 호스트 오늘(홈) 트리아지 (리디자인 2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호스트 홈을 "처리할 일 단일 큐 + 다음 모임 히어로"의 트리아지 화면(스펙 §4.1)으로 재구성하고, 운영 허브의 신호를 홈 큐로 흡수한다.

**Architecture:** 현행 홈은 `HostDashboardRoute`가 `HostMeetingLedger`를 `overviewOnly`로 렌더하고 attention을 1건만 보여준 뒤 `/operations`로 링크한다. 이 단계는 (1) 트리아지 뷰모델(`host-today-model.ts`)을 새로 만들고, (2) 오늘형 페이지 UI(`features/host/ui/today/`)를 신설하며, (3) 대시보드 라우트를 새 화면으로 전환한다. `/operations` 라우트 자체는 6단계까지 유지한다(내비 재배치는 6단계).

**Tech Stack:** React/Vite, TypeScript, TanStack Query(기존 query options 재사용), Vitest. 명령은 `pnpm --dir front <script>`.

**Spec:** `docs/development/2026-08-27-readmates-host-triage-diary-redesign-design.md` §4.1, §6, §7. 시안: `docs/development/host-redesign-mockups/01-home-desktop.png`, `04-mobile.png`.

## Global Constraints

- 상태 라벨은 `@/shared/model/meeting-language`의 `hostMeetingLifecycleLabel`만 사용(1단계 산출). 하드코딩 금지.
- 서버 API·계약 변경 없음. 기존 query options(`hostCurrentSessionQuery`, `hostMeetingSessionListQuery`, `hostSessionRecordLedgerQuery`, `hostSessionRecordAttentionPagesQuery`, `hostClubOperationsQuery`, `hostNotificationHealthQuery`)만 조합한다.
- 처리할 일 큐 규칙(스펙 §4.1): 행 = `구분 · 대상/사유 · 경과일 · 해결 CTA`, 주 버튼은 해결 행위, 0건이면 "오늘 처리할 일이 없습니다 · 마지막 확인 HH:MM" 한 줄(0은 데이터). 섹션 행 상한 7 + "전체 보기".
- 지표 그리드·균등 3카드 금지, KPI 타일 금지(§1 리서치 근거). 우측 레일은 definition list.
- 멤버 썸네일은 기존 `AvatarChip` 시스템 사용(목업의 이니셜 원형은 자리표시자).
- 접근성: 44px 타겟, 한국어 `keep-all` 줄바꿈, 색 단독 상태 표현 금지, reduced-motion.
- 각 태스크 종료 시 커밋.

---

### Task 0: 앵커 재확인

**Files:** 없음 (검증 전용).

- [ ] **Step 1: 1단계 산출 확인**

```bash
rg -n "hostMeetingLifecycleLabel" front/shared/model/meeting-language.ts
```
Expected: export 존재. 없으면 1단계 계획(`2026-08-27-host-meeting-language-stage1.md`)을 먼저 실행한다.

- [ ] **Step 2: 이 계획의 앵커 검증**

```bash
rg -n "HOST_HOME_ATTENTION_LIMIT" front/features/host/route/host-dashboard-data.ts
rg -n "overviewOnly" front/features/host/ui/meeting-ledger/host-meeting-ledger.tsx
rg -n "hostSessionRecordAttentionPagesQuery|hostClubOperationsQuery|hostNotificationHealthQuery" front/features/host/queries -l
rg -n "resolveActiveMeeting" front/features/host/model/host-meeting-ledger-model.ts
```
Expected: 모두 히트. 시그니처가 이 문서와 다르면 실제 코드를 기준으로 아래 태스크의 코드 블록을 조정한 뒤 진행한다.

---

### Task 1: 트리아지 뷰모델 `host-today-model.ts`

**Files:**
- Create: `front/features/host/model/host-today-model.ts`
- Test: `front/features/host/model/host-today-model.test.ts`

**Interfaces:**
- Consumes: `MeetingListItem`, `resolveActiveMeeting` (`host-meeting-ledger-model.ts`); `HostSessionLedgerItem`, `HostSessionLedgerSummary` (`host-session-ledger-model.ts`); `HostClubOperationsSnapshot` (`@/shared/model/club-operations`); `HostNotificationSummary` (`@/features/host/api/host-contracts`); `hostMeetingLifecycleLabel`.
- Produces (Task 2·3이 사용):

```ts
export type HostTodayQueueItem = {
  id: string;
  kind: "record" | "notification" | "readiness";
  title: string;
  detail: string;
  agedLabel: string;          // 경과일·기한 mono 표기 (예: "12일 경과")
  resolveHref: string;        // 해결 행위 목적지
  resolveLabel: string;       // 해결 CTA 라벨 (승인 검토/기록 마저 쓰기/재시도 확인 등)
};

export type HostTodayView = {
  headline: string;           // "다음 모임까지 N일 · 처리할 일 N건" lede
  nextMeeting: {
    sessionId: string;
    statusLabel: string;      // hostMeetingLifecycleLabel(state)
    isMeetingDay: boolean;    // 오늘 = meetingDate
    detailHref: string;
  } | null;
  queue: {
    items: HostTodayQueueItem[];   // 상한 7
    totalCount: number;
    emptyCheckedAtLabel: string | null;  // 0건일 때 "HH:MM"
    allHref: string;          // 전체 보기 → /operations (6단계에서 재배치)
  };
  upcoming: Array<{ sessionId: string; ordinalLabel: string; date: string; href: string }>;
};

export function buildHostTodayView(input: {
  today: string;              // "YYYY-MM-DD"
  now: string;                // "HH:MM"
  basePath: string;           // scoped href prefix
  meetings: readonly MeetingListItem[];
  attention: { items: HostSessionLedgerItem[]; summary: HostSessionLedgerSummary } | null;
  operations: HostClubOperationsSnapshot | null;
  notifications: HostNotificationSummary | null;
}): HostTodayView;
```

- [ ] **Step 1: 실패하는 테스트 작성**

`host-today-model.test.ts`에 최소 케이스:

```ts
import { describe, expect, it } from "vitest";
import { buildHostTodayView } from "./host-today-model";

const base = {
  today: "2026-09-01",
  now: "09:00",
  basePath: "/clubs/reading/app/host",
  meetings: [],
  attention: null,
  operations: null,
  notifications: null,
};

describe("buildHostTodayView", () => {
  it("returns an empty-queue line as data when nothing needs attention", () => {
    const view = buildHostTodayView(base);
    expect(view.queue.items).toEqual([]);
    expect(view.queue.emptyCheckedAtLabel).toBe("09:00");
  });

  it("maps needs-attention records into resolve rows capped at 7", () => {
    const items = Array.from({ length: 9 }, (_, i) => makeLedgerItem(`s${i}`));
    const view = buildHostTodayView({
      ...base,
      attention: { items, summary: { needsAttentionCount: 9, incompletePublishedCount: 0, draftCount: 0 } },
    });
    expect(view.queue.items).toHaveLength(7);
    expect(view.queue.totalCount).toBe(9);
    expect(view.queue.items[0]?.resolveLabel).not.toHaveLength(0);
  });

  it("promotes the meeting-day flag when the active meeting is today", () => {
    const view = buildHostTodayView({
      ...base,
      meetings: [{ sessionId: "s1", state: "OPEN", date: "2026-09-01" }],
    });
    expect(view.nextMeeting?.isMeetingDay).toBe(true);
  });

  it("surfaces notification failures and readiness blockers as queue rows", () => {
    const view = buildHostTodayView({
      ...base,
      notifications: { pending: 0, failed: 2, dead: 0, sentLast24h: 5, latestFailures: [] },
      operations: makeSnapshotWithBlockingReason("다음 모임 없음"),
    });
    expect(view.queue.items.map((i) => i.kind)).toEqual(
      expect.arrayContaining(["notification", "readiness"]),
    );
  });
});
```

`makeLedgerItem`/`makeSnapshotWithBlockingReason` 헬퍼는 테스트 파일 안에 실제 타입을 만족하는 최소 픽스처로 작성한다(실멤버 데이터 금지).

- [ ] **Step 2: 실패 확인**

Run: `pnpm --dir front test -- features/host/model/host-today-model.test.ts`
Expected: FAIL — 모듈 미존재.

- [ ] **Step 3: 구현**

큐 합성 규칙(우선순위 고정, 커스터마이즈 없음 — 스펙 §4.1):
1. `attention.items` → `kind: "record"`, resolveHref는 회차 상세(레코드 작업 앵커), agedLabel은 `lastModifiedAt`/`date` 기준 경과일.
2. `notifications.failed + dead > 0` → `kind: "notification"` 1행, resolveHref는 알림 작업대.
3. `operations.readiness.blockingReasons` 각각 → `kind: "readiness"`, resolveHref는 `nextAction` 기반.
상한 7 적용 후 `totalCount`는 합성 전 전체. `nextMeeting`은 `resolveActiveMeeting(meetings)` + `hostMeetingLifecycleLabel`.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --dir front test -- features/host/model/host-today-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/model/host-today-model.ts front/features/host/model/host-today-model.test.ts
git commit -m "feat(host): add today triage view model composing attention, notification, readiness signals"
```

---

### Task 2: 오늘형 페이지 UI `features/host/ui/today/`

**Files:**
- Create: `front/features/host/ui/today/host-today-page.tsx`
- Create: `front/features/host/ui/today/host-today-queue.tsx`
- Create: `front/features/host/ui/today/host-today.css` (원장 행·folio 등 오늘형 셸 — 기존 `host-editorial-ledger.css` 어휘를 재사용하고 새 클래스는 `rm-host-today-*` 접두)
- Test: `front/features/host/ui/today/host-today-page.test.tsx`

**Interfaces:**
- Consumes: `HostTodayView`, `HostTodayQueueItem` (Task 1); `HostLinkComponent`(기존 host-link-types); 다음 모임 상세 데이터는 기존 `HostMeetingLedger`의 next-meeting 블록을 분해해 재사용한다.
- Produces: `export function HostTodayPage(props: { view: HostTodayView; nextMeetingBlock?: ReactNode; widgetErrors?: { queue?: boolean }; onRetryQueue?: () => void; LinkComponent?: HostLinkComponent }): JSX.Element`

- [ ] **Step 1: 실패하는 테스트 작성** — 렌더 계약만 고정:

```tsx
import { render, screen } from "@testing-library/react";
import { HostTodayPage } from "./host-today-page";

it("renders headline, queue rows with resolve CTAs, and the zero-as-data line", () => {
  render(<HostTodayPage view={viewWithTwoQueueItems} />);
  expect(screen.getByRole("heading", { name: /오늘/ })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /기록 마저 쓰기|확인/ }).length).toBeGreaterThan(0);

  render(<HostTodayPage view={emptyQueueView} />);
  expect(screen.getByText(/오늘 처리할 일이 없습니다 · 마지막 확인/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- features/host/ui/today` → FAIL.

- [ ] **Step 3: 구현**

구성(§4.1 + 시안 01): 공유 PageHeader(eyebrow `호스트 · 오늘` + 날짜 h1 + lede) → 처리할 일 큐(원장 행: 구분 dot + 제목/사유 + mono 경과 + 해결 버튼, 행 46px+, hover 배경) → `home-grid` 비대칭(좌 히어로, 우 레일: 다가오는 일정 수직 리스트 + 클럽 상태 `<dl>` + "운영 기록 전체 보기" quiet 링크). 데스크톱/모바일은 기존 `desktop-only`/`mobile-only` 관례를 따르고 모바일은 히어로 카드 + 전폭 primary CTA.

- [ ] **Step 4: 통과 확인** — 같은 명령 PASS. `pnpm --dir front lint`도 통과.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/today
git commit -m "feat(host): add today triage page shell with resolve queue and quiet reference rail"
```

---

### Task 3: 대시보드 라우트 전환

**Files:**
- Modify: `front/features/host/route/host-dashboard-data.ts` (`HOST_HOME_ATTENTION_LIMIT` 1 → 7, 로더 데이터 유지)
- Modify: `front/features/host/route/host-dashboard-route.tsx` (`HostMeetingLedger overviewOnly` → `HostTodayPage`; `hostClubOperationsQuery`·`hostNotificationHealthQuery`를 `useQuery(..., retry: false)`로 추가 — 운영 라우트와 동일 패턴)
- Test: `front/features/host/route/host-dashboard-route.test.tsx`, `front/features/host/route/host-dashboard-data.test.ts`

**Interfaces:**
- Consumes: Task 1 `buildHostTodayView`, Task 2 `HostTodayPage`.
- Produces: 홈 URL(`/app/host`, scoped 동등) 동작 계약 유지 — heading `오늘`은 e2e가 의존하므로 유지한다.

- [ ] **Step 1: 라우트 테스트를 새 화면 계약으로 갱신(실패 유도)** — 기존 `host-dashboard-route.test.tsx`의 ledger-전용 단언을 큐 행·빈 줄 단언으로 교체.
- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- features/host/route/host-dashboard`.
- [ ] **Step 3: 구현** — 로더는 attention limit만 7로 확대(쿼리 키에 limit이 들어가므로 클라이언트 useQuery도 동일 request로 맞춘다). 위젯 실패는 §6 문법대로 부분 실패 처리: operations/notifications 쿼리 에러 시 해당 큐 행 생략 + 재시도 액션.
- [ ] **Step 4: 통과 확인** — `pnpm --dir front test -- features/host/route/host-dashboard features/host/ui/today features/host/model/host-today-model.test.ts` PASS.
- [ ] **Step 5: 영향 e2e 확인** — heading `오늘`을 단언하는 spec 목록: `tests/e2e/host-club-operations.spec.ts`, `public-auth-member-host.spec.ts`, `dev-login-session-flow.spec.ts`, `host-session-hardening.spec.ts`(확인 필요→모두 보기), `responsive-navigation-chrome.spec.ts`. 문구가 바뀐 단언만 갱신한다(예: `확인 필요` → 큐 문구). Run: `pnpm --dir front test:e2e` (로컬 DB/서버 없으면 스킵을 보고).
- [ ] **Step 6: Commit**

```bash
git add front/features/host front/tests/e2e
git commit -m "feat(host): switch dashboard route to the today triage composition"
```

---

### Task 4: 모임 당일 히어로 승격 (D-day)

**Files:**
- Modify: `front/features/host/ui/today/host-today-page.tsx` (isMeetingDay 분기)
- Test: `front/features/host/ui/today/host-today-page.test.tsx`

**Interfaces:**
- Consumes: `HostTodayView.nextMeeting.isMeetingDay` (Task 1).
- Produces: D-day 히어로 변형 — 제목 "오늘 모임", primary CTA "출석 확인 열기" → 회차 상세의 출석 앵커(`buildHostMeetingUrl`의 `section=attendance` 관례). **원탭 출석 명단의 홈 본문 임베드는 4단계(다이어리) 완료 후 그 계획의 마지막 태스크로 수행한다** — 명단 데이터 계약이 다이어리에서 확정되기 때문.

- [ ] **Step 1: 실패 테스트** — `isMeetingDay: true`일 때 `출석 확인` CTA가 primary로 렌더됨을 단언.
- [ ] **Step 2: 실패 확인 → Step 3: 구현 → Step 4: 통과 확인** (`pnpm --dir front test -- features/host/ui/today`).
- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/today
git commit -m "feat(host): promote today hero to attendance entry on meeting day"
```

---

### Task 5: 단계 검증

- [ ] **Step 1:** `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build` — 모두 PASS.
- [ ] **Step 2:** 라우트 변경이므로 `pnpm --dir front test:e2e` 실행(불가 시 스킵 보고).
- [ ] **Step 3:** 시각 계약 — CT 스크린샷 잠금 대상이 아직 없으므로(현행 홈 CT 부재) 이 단계에서는 `front/DESIGN.md`에 오늘형 페이지 타입을 추가 기술하고, CT 재잠금은 4단계 다이어리와 함께 일괄 수행한다고 기록한다.
- [ ] **Step 4:** 최종 보고 — 변경 표면, 실행/스킵 체크.
