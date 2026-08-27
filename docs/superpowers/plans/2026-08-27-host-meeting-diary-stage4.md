# 호스트 모임 다이어리 상세 (리디자인 4단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Focus Deck을 "모임의 걸음" 세로 타임라인 다이어리 스프레드로 재조립하고, 장부 마감 체크리스트·자동 알림 가시성·미응답 타깃 인라인 컴포저를 다이어리에 통합한다(스펙 §4.2 다이어리).

**Architecture:** 기존 계약을 최대한 재사용한다: primary action 계산은 `buildHostMeetingWorkspace`(ADR-0044 규칙), 마감 체크리스트 데이터는 **이미 존재하는** `hostSessionClosingStatusQuery` + `getSessionClosingBoardView`(고아 상태의 `SessionClosingBoard`), 출석은 `MeetingResponseLedger`(단건/일괄 mutation 연결 완비), 알림은 `HostNotificationComposer` + `hostNotificationPolicyQuery`. 이 단계는 화면 재조립이며 서버 계약 변경이 없다. `/closing` 리다이렉트는 다이어리의 기록 정리 단계 앵커(`section=records`)로 착지시킨다.

**Tech Stack:** React/Vite, TypeScript, TanStack Query, Vitest, Playwright CT/E2E.

**Spec:** 설계 문서 §4.2(다이어리·장부 마감·자동 알림·인라인 컴포저), §4.4(다이어리 모바일·당일 출석), §6. 시안: `docs/development/host-redesign-mockups/02-meeting-desktop.png`, `06-closing-desktop.png`, `04-mobile.png`.

## Global Constraints

- 상태 라벨은 `hostMeetingLifecycleLabel`만. 타임라인 단계명은 §4.2 고정: `모임 만들기 → 멤버와 준비 → 응답 모으는 중 → 모임 당일(출석) → 기록 정리 → 기록 게시`.
- primary action 단일성: 화면에 주 행동 1개(데스크톱/모바일 CTA 중복 announce 금지 — 기존 규칙 유지).
- 서버 계약 변경 없음. "미응답 타깃 발송"은 `ManualNotificationAudience`의 `SELECTED_MEMBERS` + 클라이언트에서 `response === "NO_RESPONSE"`인 membershipId 계산으로 구현한다(새 audience 추가 금지).
- 종료 시 소감 자동 발송·다단 리마인드는 비범위(§8) — 이 단계에서는 수동 발송 액션과 현행 `sessionReminderEnabled` 단일 토글 가시화까지만.
- 파괴 행위 문법(§6): 즉시 실행 + Undo(기존 workspace-undo-bar 재사용), 확인 다이얼로그는 비가역 행위만.
- URL 계약 유지: `sessions/:sessionId` + `section=` 쿼리(`host-session-workspace-navigation.ts` 소유 키 `task/section/source/records/aigen`).
- 각 태스크 종료 시 커밋.

---

### Task 0: 앵커 재확인

- [ ] **Step 1:**

```bash
rg -n "buildHostMeetingWorkspace|HostMeetingWorkspaceView" front/features/host/model/host-session-workspace-model.ts | head -5
rg -n "hostSessionClosingStatusQuery" front/features/host -l
rg -n "getSessionClosingBoardView" front/features/host/model/session-closing-model.ts
rg -n "MeetingResponseLedger" front/features/host/ui/meeting-workspace/meeting-response-ledger.tsx
rg -n "hostNotificationPolicyQuery|useUpdateHostNotificationPolicyMutation" front/features/host/queries/host-notification-queries.ts
rg -n "canonicalMeetingPath" front/src/app/host-routes/meeting-redirects.ts
```
Expected: 모두 히트. 1~3단계가 라벨·홈·목록을 바꿨어도 이 표면의 시그니처는 불변이어야 한다. 다르면 실제 코드 기준으로 아래 코드 블록을 조정한다.

---

### Task 1: 타임라인 모델

**Files:**
- Create: `front/features/host/model/host-meeting-diary-model.ts`
- Test: `front/features/host/model/host-meeting-diary-model.test.ts`

**Interfaces:**
- Consumes: `HostMeetingWorkspaceView`(primary action·facts), `SessionClosingStatusInput`/`SessionClosingBoardView`(체크리스트), `hostMeetingLifecycleLabel`.
- Produces (Task 2·3이 사용):

```ts
export type DiaryStepId = "create" | "prepare" | "responses" | "meetingDay" | "records" | "publish";

export type DiaryStep = {
  id: DiaryStepId;
  label: string;                       // §4.2 고정 단계명
  state: "done" | "current" | "upcoming";
  detail: string | null;               // 단계 인라인 상태 한 줄 (mono 타임스탬프 포함 가능)
  href: string | null;                 // 단계 앵커 (section= URL)
};

export type HostMeetingDiaryView = {
  steps: readonly DiaryStep[];
  currentStep: DiaryStepId;
};

export function buildHostMeetingDiary(input: {
  workspace: HostMeetingWorkspaceView;
  meetingDate: string;
  today: string;
  currentUrl: string | URL;            // buildHostMeetingUrl로 단계 앵커 생성
}): HostMeetingDiaryView;
```

단계 매핑 규칙: DRAFT → current=create; OPEN & today<meetingDate → prepare 또는 responses(미응답>0이면 responses); OPEN & today==meetingDate → meetingDay; CLOSED → records; PUBLISHED → publish(모두 done). 지나간 단계는 done, 이후는 upcoming.

- [ ] **Step 1: 실패 테스트** — 상태별 current 단계와 done/upcoming 배열을 단언(위 매핑 규칙 그대로 케이스 6개).
- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- features/host/model/host-meeting-diary-model.test.ts`.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: Commit**

```bash
git add front/features/host/model/host-meeting-diary-model.*
git commit -m "feat(host): add meeting diary timeline model over the workspace lifecycle"
```

---

### Task 2: 다이어리 스프레드 UI

**Files:**
- Modify: `front/features/host/ui/meeting-workspace/host-meeting-workspace.tsx` (Focus Deck 조립 → 다이어리 스프레드; `HostMeetingWorkspaceProps`는 유지하고 `diary: HostMeetingDiaryView` prop 추가)
- Create: `front/features/host/ui/meeting-workspace/meeting-diary-timeline.tsx`
- Modify: `front/features/host/route/host-meeting-workspace-route.tsx` (diary 뷰 합성·전달)
- Test: `front/features/host/ui/meeting-workspace/host-meeting-workspace.test.tsx`, `meeting-diary-timeline.test.tsx`(신규), `front/features/host/route/host-meeting-workspace-route.test.tsx`

**Interfaces:**
- Consumes: Task 1 `HostMeetingDiaryView`; 기존 `HostSessionWorkspace` 패널 슬롯(basic/attendance/records/history/notifications)은 다이어리의 시트/패널로 그대로 마운트.
- Produces: 좌측 페이지 = 모임 정체(책·일시·장소·공개 상태 + "멤버 시야로 보기") + `MeetingDiaryTimeline`; 우측 페이지 = "지금 할 일" 카드(기존 primary action) + 현재 단계 컨텐츠. 회차 페이저(`‹ No.n · No.n+1 ›`)는 세션 목록 쿼리의 인접 회차로 구성.

- [ ] **Step 1: 실패 테스트** — 타임라인 6단계 렌더·current 단계 강조(색 단독 금지: `aria-current="step"` + 텍스트), 지금 할 일 카드 1개, 멤버 시야로 보기 링크.
- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- features/host/ui/meeting-workspace`.
- [ ] **Step 3: 구현** — 기존 `rm-focus-deck` CSS를 `rm-meeting-diary` 스프레드로 개편(데스크톱 2단, 모바일은 타임라인이 본문 전체 + 하단 sticky 주 행동 1개). facts·related-work는 현재 단계 카드 하위로 이동.
- [ ] **Step 4: 통과 확인 + lint.**
- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/meeting-workspace front/features/host/route/host-meeting-workspace-route.tsx
git commit -m "feat(host): reassemble the focus deck into the meeting diary spread"
```

---

### Task 3: 기록 정리 단계 = 장부 마감 체크리스트 (고아 마감 보드 흡수)

**Files:**
- Modify: `front/features/host/ui/meeting-workspace/host-meeting-workspace.tsx` (records 단계 컨텐츠로 체크리스트 마운트)
- Modify: `front/features/host/ui/session-closing-board.tsx` (스프레드 내 임베드 가능하도록 페이지 크롬 제거 — export 유지)
- Modify: `front/features/host/route/host-meeting-workspace-route.tsx` (CLOSED 상태에서 `useQuery(hostSessionClosingStatusQuery(sessionId, context))` 추가)
- Modify: `front/src/app/host-routes/meeting-redirects.ts` (`/closing` → `section=records` 앵커 유지 리다이렉트)
- Test: `front/features/host/ui/session-closing-board.test.tsx`, `front/src/app/host-routes/meeting-redirects.test.ts`

**Interfaces:**
- Consumes: `SessionClosingStatusInput` → `getSessionClosingBoardView` (체크리스트·surfaces·evidence 전부 기존 모델).
- Produces: `/sessions/:id/closing` 진입 시 다이어리의 기록 정리 단계로 착지(`canonicalMeetingPath`가 `section=records`를 병합). 완료 행 mono 타임스탬프는 evidence 값을 재사용.

- [ ] **Step 1: 리다이렉트 테스트 갱신(실패 유도)** —

```ts
expect(canonicalMeetingPath("/app/host/sessions/s1/closing", "")).toBe("/app/host/sessions/s1?section=records");
expect(canonicalMeetingPath("/app/host/sessions/s1/closing", "?foo=1")).toBe("/app/host/sessions/s1?foo=1&section=records");
```
(edit 리다이렉트 기대값은 불변.)

- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- src/app/host-routes/meeting-redirects.test.ts`.
- [ ] **Step 3: 구현** — `canonicalMeetingPath`가 `/closing` 제거 시 `section=records`를 추가(소유 키 규칙은 `host-session-workspace-navigation.ts`와 일치). records 단계 컨텐츠 = 체크리스트 행(§4.2: 출석 확정 → 소감 수집(수동 발송 액션) → 기록 초안 → 피드백 문서 확인 → 멤버 게시) — `SessionClosingBoardView.checklist`를 §5 어휘로 라벨링해 렌더.
- [ ] **Step 4: 통과 확인** — `pnpm --dir front test -- features/host/ui/session-closing-board src/app/host-routes features/host/ui/meeting-workspace`.
- [ ] **Step 5: Commit**

```bash
git add front/features/host front/src/app/host-routes
git commit -m "feat(host): mount the closing checklist as the diary records step and land /closing there"
```

---

### Task 4: 자동 알림 가시성 + 미응답 타깃 인라인 컴포저

**Files:**
- Create: `front/features/host/ui/meeting-workspace/meeting-notification-rail.tsx` (발송됨/예정 원장 + 정책 토글 + 인라인 컴포저)
- Modify: `front/features/host/route/host-meeting-workspace-route.tsx` (policy/summary 쿼리 연결, 미응답 membershipId 계산)
- Test: `front/features/host/ui/meeting-workspace/meeting-notification-rail.test.tsx`

**Interfaces:**
- Consumes: `hostNotificationPolicyQuery`, `useUpdateHostNotificationPolicyMutation`, `usePreviewManualNotificationMutation`, `useConfirmManualNotificationMutation`, `HostNotificationComposer`(`recipientModes` prop 지원), `MeetingResponseLedgerRow`(미응답 계산).
- Produces:

```ts
export function nonResponderMembershipIds(rows: ReadonlyArray<MeetingResponseLedgerRow>): string[] {
  return rows.filter((row) => row.response === "NO_RESPONSE").map((row) => row.membershipId);
}
```

컴포저 기본값: `recipientMode`를 `SELECTED_MEMBERS` + `selectedMembershipIds = nonResponderMembershipIds(rows)`로 초기화하고 UI 라벨은 "미응답 N명". 다른 선택지는 `ALL_ACTIVE_MEMBERS`(전원)·`CONFIRMED_ATTENDEES`(참석 확정) 매핑. 참석 확정 대상 발송은 리마인드 문맥에서 기본 비활성 사유를 표시(§4.2 재촉 금지 규칙).

- [ ] **Step 1: 실패 테스트** — `nonResponderMembershipIds` 계산, 정책 토글 렌더(현행 `sessionReminderEnabled` 상태 + "발송됨/예정" 행), 컴포저 기본 수신 라벨 "미응답 N명" 단언.
- [ ] **Step 2: 실패 확인** — `pnpm --dir front test -- features/host/ui/meeting-workspace/meeting-notification-rail.test.tsx`.
- [ ] **Step 3: 구현** — 발송 이력 행은 기존 dispatch 조회(`SESSION_REMINDER_DUE` eventType 필터, host-api의 manual dispatches 조회 재사용)로 구성. 140자 카운터는 컴포저 draft 길이로 표시하고 장문은 알림 작업대 링크.
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: Commit**

```bash
git add front/features/host
git commit -m "feat(host): add diary notification rail with policy visibility and non-responder composer"
```

---

### Task 5: 당일 출석 — 원탭 명단 + 홈 임베드

**Files:**
- Modify: `front/features/host/ui/meeting-workspace/meeting-response-ledger.tsx` (당일 모드 프리젠테이션: "아직 안 옴" 기본 필터, 원탭 도착 = `onAttendanceChange(id, "ATTENDED")`, "나머지 N명 모두 참석" = `onBulkAttendanceChange`)
- Modify: `front/features/host/ui/today/host-today-page.tsx` (2단계 Task 4의 D-day 히어로에 명단 임베드 — 모바일 홈 본문)
- Test: `front/features/host/ui/meeting-workspace/meeting-response-ledger.test.tsx`, `front/features/host/ui/today/host-today-page.test.tsx`

**Interfaces:**
- Consumes: 기존 `MeetingResponseLedgerRow`(attendance 축 포함), `WorkspacePendingUndo`(Undo 스트립 재사용).
- Produces: `MeetingResponseLedger`에 `presentation?: "default" | "meetingDay"` prop 추가(기본 default — 기존 소비처 무변경).

- [ ] **Step 1: 실패 테스트** — meetingDay 프리젠테이션에서 세그먼트("아직 안 옴 n / 도착 n / 전체 n"), 행 원탭 커밋(저장 버튼 없음), 일괄 버튼, 탭 후 Undo 노출 단언.
- [ ] **Step 2: 실패 확인 → Step 3: 구현 → Step 4: 통과 확인** — `pnpm --dir front test -- features/host/ui/meeting-workspace features/host/ui/today`.
- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui
git commit -m "feat(host): one-tap meeting-day attendance mode with bulk mark and undo"
```

---

### Task 6: 단계 검증 (시각 계약 포함)

- [ ] **Step 1:** `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`.
- [ ] **Step 2:** CT 재잠금 — `host-focus-deck.ct.tsx`를 다이어리 스프레드 기준으로 갱신하고 `session-closing-board.ct.tsx`를 임베드 형태로 갱신(뷰포트 320/390/768/900/1024/1440). 실행 명령은 repo CT 스크립트(`pnpm --dir front test:ct` 계열 — package.json에서 확인) 그대로 보고.
- [ ] **Step 3:** e2e — `host-meeting-workspace.spec.ts`, `session-closing-flywheel.spec.ts`, `host-meeting-workspace-browser-smoke.spec.ts` 갱신 후 `pnpm --dir front test:e2e`(불가 시 스킵 보고).
- [ ] **Step 4:** 모바일 완료 기준(§10) 확인: "한 손, 10초, 대화 중단 없이 당일 출석 완료" — 실기기 확인이 불가하면 뷰포트 390 CT + e2e로 근사하고 스킵 사실을 보고.
- [ ] **Step 5:** `front/DESIGN.md`에 다이어리형 페이지 타입 기술 추가. 최종 보고.
