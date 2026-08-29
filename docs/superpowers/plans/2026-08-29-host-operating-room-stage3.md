# Host Lifecycle Operating Room Stage 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/host`를 현재 모임 중심의 준비실·현장·마감실 운영실로 바꾸고, 다음 행동 하나와 준비 현황을 실제 계약으로 렌더링한다.

**Architecture:** server의 host-only current-selection read model이 운영실 기준 모임을 결정한다. loader는 그 session의 detail과 closing/record/operations 독립 query를 prefetch하고 partial failure를 보존한다. pure model이 lifecycle phase, next action, preparation rows를 계산한다. route가 URL `phase`, query/mutation, 403/409 recovery를 소유하고 UI는 props/callback만 받는다. 일정 확인 row는 Stage 1 source of truth만 사용한다.

**Tech Stack:** React Router loaders, TanStack Query, TypeScript pure models, React/CSS, Vitest, Playwright CT/E2E.

**Spec:** design §3.2–7/9/11, ADR-0048/0049, approved 07/08/09 and 15/16.

ADR impact: none beyond implementing Proposed ADR-0048/0049.

## Global Constraints

- current meeting selection is server-owned `/api/host/operating-room/current`; frontend never selects newest date itself. Member `/api/sessions/current` remains OPEN-only.
- `phase=prep|live|closing` is local task state. Invalid/unavailable phase normalizes with replace navigation and a reason.
- no current meeting shows `첫 모임 만들기`; partial widget failures do not blank the full page.
- one filled primary action only. Action reason and blocked/unknown state remain visible.
- preparation facts are independent rows: schedule seen, RSVP, questions, place readiness. Never derive one from another.
- existing attendance, closing, edit/history, manual notification, receipt/reconciliation logic is reused.

---

### Task 0: Freeze the current data dependency map

- [ ] **Step 1:** Run preflight and locate exact queries.

```bash
python3 scripts/agent-preflight.py --intent change --paths front/features/host,front/src/app/host-routes/dashboard-route-element.tsx,front/src/app/routes/host.tsx --isolation-note "Stage 3 operating room composition"
rg -n "hostCurrentSessionQuery|hostSessionDetailQuery|closing|recordAttention|clubOperations|notificationHealth" front/features/host
```

- [ ] **Step 2:** Record required current read versus optional widget sources. Required failure uses route error; optional failures become partial rows/work items.

### Task 1: Define lifecycle operating-room view models

**Files:**
- Create: `front/features/host/model/host-operating-room-model.ts`
- Create: `front/features/host/model/host-operating-room-model.test.ts`
- Reuse: `host-session-lifecycle-model.ts`, `session-closing-model.ts`, `host-schedule-seen-model.ts`.

**Interfaces:**

```ts
type HostMeetingPhase = "prep" | "live" | "closing";
type HostNextActionState = "actionable" | "deferred" | "conflict" | "unknown" | "none";
type PreparationRowId = "schedule-seen" | "rsvp" | "questions" | "place";

type HostOperatingRoomView = {
  meeting: CurrentMeetingHeaderView | null;
  phases: readonly MeetingPhaseTabView[];
  phase: HostMeetingPhase;
  nextAction: HostNextActionView;
  preparation: readonly PreparationLedgerRowView[];
  partialFailures: readonly OperatingRoomFailure[];
};
```

- [ ] **Step 1:** RED matrix for no current meeting, DRAFT/OPEN/CLOSED/PUBLISHED, before/day-of/after date, closing blocked/ready/published, and partial sources.
- [ ] **Step 2:** Fix phase availability: prep for active current, live for OPEN/day-of or lifecycle allowance, closing after attendance/close path; completed phases remain readable.
- [ ] **Step 3:** Fix next-action priority: conflict/unknown receipt → live attendance → schedule unseen review → RSVP → questions → place → closing → none.
- [ ] **Step 4:** Produce denominator-aware rows and `집계 준비 중` only when contract is absent/error; never invent counts.
- [ ] **Step 5:** Run tests and commit.

### Task 2: Add the server-owned host current-meeting selector

**Files:**
- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostOperatingRoomModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionQueryPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionQueryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostOperatingRoomController.kt`
- Create: focused service/API/MySQL tests.

**Contract:**

```text
GET /api/host/operating-room/current
200 {"currentMeeting": {"sessionId":"...","selection":"OPEN|UPCOMING_DRAFT|CLOSING_REQUIRED"}|null}
```

Selection order is fixed: the single OPEN session; otherwise the earliest future DRAFT by date/start/number; otherwise the newest CLOSED session whose closing status still needs action; otherwise null. Deleted sessions are excluded. PUBLISHED is never selected as current.

- [ ] **Step 1:** RED tests for every selection class, tie-breaks, no candidate, cross-club isolation and active HOST requirement.
- [ ] **Step 2:** Implement the selector in the server query adapter and expose only sessionId + reason; host detail remains the canonical detail contract.
- [ ] **Step 3:** Add the generic GET proxy proof to `front/tests/unit/cloudflare-bff.test.ts` and commit server/BFF tests.

### Task 3: Replace the dashboard loader with an operating-room loader

**Files:**
- Modify: `front/features/host/route/host-dashboard-data.ts`
- Modify: `front/features/host/route/host-dashboard-data.test.ts`
- Modify: `front/features/host/queries/host-session-queries.ts` only if a current-detail helper is needed.

- [ ] **Step 1:** RED loader tests: auth first, URL club context, current null, current+detail, optional failures independently captured, no legacy `/api/host/dashboard` dependency.
- [ ] **Step 2:** Fetch host current selector then exact host detail. Prefetch closing/record/operations/notification sources in parallel after sessionId is known.
- [ ] **Step 3:** Return typed result states, not booleans detached from data.
- [ ] **Step 4:** Preserve cache scope and retry policy; commit.

### Task 4: Build meeting context and phase controls

**Files:**
- Create: `front/features/host/ui/operating-room/current-meeting-header.tsx`
- Create: `front/features/host/ui/operating-room/meeting-phase-tabs.tsx`
- Create: `front/features/host/ui/operating-room/operating-room.css`
- Create: unit/CT tests.

- [ ] **Step 1:** RED tests for cover fallback, title/D-day/date/time/place, `모임 정보`, `일정 편집`, `변경 이력`, `멤버 시야`, phase current/blocked reason.
- [ ] **Step 2:** Use semantic links/tabs; URL owns phase. Identity images use existing artwork contracts.
- [ ] **Step 3:** CT at 390/768/1440 with long title, missing image, partial data and 200% zoom.
- [ ] **Step 4:** Commit.

### Task 5: Build next action and preparation ledger

**Files:**
- Create: `front/features/host/ui/operating-room/host-next-action.tsx`
- Create: `front/features/host/ui/operating-room/preparation-ledger.tsx`
- Create: `front/features/host/ui/operating-room/preparation-ledger-row.tsx`
- Create: tests and CT.

- [ ] **Step 1:** RED semantics: one primary CTA, visible reason, secondary defer, row label/value/detail/action, color-independent state, retryable unavailable row.
- [ ] **Step 2:** Implement continuous hairline ledger, not a card grid. Desktop first viewport shows at least 3 rows; mobile uses two-line rows without horizontal scroll.
- [ ] **Step 3:** Wire drill-down hrefs for schedule review, RSVP, questions and place editor.
- [ ] **Step 4:** Commit.

### Task 6: Compose the route and reuse existing mutations

**Files:**
- Rewrite: `front/features/host/route/host-dashboard-route.tsx`
- Create: `front/features/host/ui/operating-room/host-operating-room-page.tsx`
- Keep: `front/features/host/ui/today/host-today-page.tsx` only as temporary compatibility export until callers are migrated.
- Modify: route tests.

- [ ] **Step 1:** RED route tests for phase URL, empty current, prep, live attendance, closing, partial query failure, 403 purge, 409 input preservation and unknown receipt.
- [ ] **Step 2:** Route builds the view model and keeps attendance/restore/reconciliation hooks instead of rewriting them.
- [ ] **Step 3:** On 409 refetch exact detail, preserve user draft and show comparison. Unknown outcome remains actionable until reconciliation.
- [ ] **Step 4:** Remove old date-triage imports only after replacement assertions pass.
- [ ] **Step 5:** Commit.

### Task 7: Phase-specific completion flows

**Files:**
- Modify/reuse: `front/features/host/ui/meeting-workspace/meeting-response-ledger.tsx`
- Modify/reuse: `front/features/host/ui/session-closing-board.tsx`
- Modify: corresponding route/model/tests.

- [ ] **Step 1:** Prep: schedule review CTA opens Stage 4 review; other rows link to owned detail.
- [ ] **Step 2:** Live: reuse attendance editor with attended/absent/unknown, bulk action and undo receipt; no RSVP→attendance copy.
- [ ] **Step 3:** Closing: reuse readiness/checklist/record apply/publish with blocked reasons and receipts.
- [ ] **Step 4:** Add E2E for prep→live→closing without losing current meeting context.
- [ ] **Step 5:** Commit.

### Task 8: Stage verification

- [ ] **Step 1:** Run model/route/UI tests and CT at 390/768/1024/1440.
- [ ] **Step 2:** Run focused selector tests, `./scripts/server-ci-check.sh`, and frontend lint/test/build.
- [ ] **Step 3:** Run host meeting workspace, attendance, closing and authority-loss E2E specs.
- [ ] **Step 4:** Compare hierarchy/density against 07/08/09/15/16 and record discrepancies; do not pixel-trace.
