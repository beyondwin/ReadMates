# Host Lifecycle Operating Room Stage 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/host`를 현재 모임 중심의 준비실·현장·마감실 운영실로 바꾸고, 다음 행동 하나와 준비 현황을 실제 계약으로 렌더링한다.

**Architecture:** 새 composition feature `hostworkspace`의 host-only current-selection service가 운영실 기준 모임을 결정한다. `hostworkspace.application`은 자기 outbound port만 본다. `adapter/out/source/SessionOperatingRoomCandidateSourceAdapter`와 `SessionClosingRequirementSourceAdapter`가 각각 `session` candidate input port와 기존 `sessionclosing` status input port를 번역한다. 따라서 application feature edge/debt baseline을 늘리지 않고 closing predicate 복제나 `session → sessionclosing` 역의존도 만들지 않는다. loader는 선택된 session의 detail과 closing/record/operations 독립 query를 prefetch하고 partial failure를 보존한다. pure model이 lifecycle phase, next action, preparation rows를 계산한다. route가 URL `phase`, query/mutation, 403/409 recovery를 소유하고 UI는 props/callback만 받는다. 일정 확인 row는 Stage 1 source of truth만 사용한다.

**Tech Stack:** React Router loaders, TanStack Query, TypeScript pure models, React/CSS, Vitest, Playwright CT/E2E.

**Spec:** design §3.2–7/9/11, ADR-0048/0049, approved 07/08/09 and 15/16.

ADR impact: update — ADR-0048, ADR-0049

## Global Constraints

- current meeting selection is server-owned `/api/host/operating-room/current`; frontend never selects newest date itself. Member `/api/sessions/current` remains OPEN-only.
- `phase=prep|live|closing` is local task state. Invalid/unavailable phase normalizes with replace navigation and a reason.
- no current meeting shows `첫 모임 만들기`; partial widget failures do not blank the full page.
- one filled primary action only. Action reason and blocked/unknown state remain visible.
- preparation facts are independent rows: schedule seen, RSVP, questions, place readiness. Never derive one from another.
- a selected future DRAFT without a member-visible participant snapshot renders `아직 멤버에게 공개되지 않음`; it does not render UNSEEN zero/count, schedule review, or a schedule-seen work item.
- existing attendance, closing, edit/history, manual notification, receipt/reconciliation logic is reused.
- `hostworkspace` is registered before its first inbound class. Its application/domain packages import no other ReadMates feature, including `shared`, so the approved application feature-dependency debt baselines remain byte-for-byte unchanged. Outbound source adapters may depend on foreign application input ports but never foreign adapters.

---

### Task 0: Freeze the current data dependency map

- [ ] **Step 1:** Run preflight and locate exact queries.

```bash
python3 scripts/agent-preflight.py --intent change \
  --paths front/features/host \
  --paths front/src/app/host-routes/dashboard-route-element.tsx \
  --paths front/src/app/routes/host.tsx \
  --isolation-note "Stage 3 operating room composition"
rg -n "hostCurrentSessionQuery|hostSessionDetailQuery|closing|recordAttention|clubOperations|notificationHealth" front/features/host
```

- [ ] **Step 2:** Record required current read versus optional widget sources. Required failure uses route error; optional failures become partial rows/work items.
- [ ] **Step 3:** Run `command -v corepack || true`; use and record `npx --yes corepack@0.35.0 pnpm` when it is absent, as in the reviewed checkout.

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

type HostNextActionView = {
  state: HostNextActionState;
  workItemKey: string | null;
  // presentation fields omitted
};
```

- [ ] **Step 1:** RED matrix for no current meeting, DRAFT/OPEN/CLOSED/PUBLISHED, before/day-of/after date, closing blocked/ready/published, and partial sources.
- [ ] **Step 2:** Fix phase availability: prep for active current, live for OPEN/day-of or lifecycle allowance, closing after attendance/close path; completed phases remain readable.
- [ ] **Step 3:** Fix next-action priority: conflict/unknown receipt → live attendance → schedule unseen review → RSVP → questions → place → closing → none.
- [ ] **Step 4:** Produce denominator-aware rows and `집계 준비 중` only when an expected contract is absent/error; never invent counts. Use the distinct DRAFT unavailable copy when the server says no member-visible snapshot exists.
- [ ] **Step 5:** Run tests and commit.

### Task 2: Add the server-owned host current-meeting selector

**Files:**
- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostOperatingRoomCandidateModels.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/in/ListHostOperatingRoomCandidatesUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostOperatingRoomCandidateQueryPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionQueryService.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostOperatingRoomCandidateQueries.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/model/HostOperatingRoomModels.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/port/in/GetHostOperatingRoomCurrentUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/port/out/HostOperatingRoomSourcePorts.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/service/HostOperatingRoomCurrentService.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/out/source/SessionOperatingRoomCandidateSourceAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/out/source/SessionClosingRequirementSourceAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostOperatingRoomController.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventory.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- Create: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionQueryServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostOperatingRoomCandidateDbTest.kt`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/application/service/HostOperatingRoomCurrentServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/hostworkspace/api/HostOperatingRoomControllerTest.kt`

**Contract:**

```text
GET /api/host/operating-room/current
200 {"currentMeeting": {"sessionId":"...","selection":"OPEN|UPCOMING_DRAFT|CLOSING_REQUIRED","scheduleSeenAvailability":"AVAILABLE|UNAVAILABLE"}|null}
```

Selection order is fixed: the single OPEN session; otherwise the earliest future DRAFT by date/start/number; otherwise the newest CLOSED session whose canonical `GetHostSessionClosingStatusUseCase` result still needs action; otherwise null. Deleted sessions are excluded. PUBLISHED is never selected as current.

- [ ] **Step 1:** RED session candidate tests for every class, deterministic tie-breaks, deleted exclusion, cross-club isolation and active HOST requirement. The session query returns ordered raw CLOSED candidate IDs but does not decide closing readiness.
- [ ] **Step 2:** RED hostworkspace service tests proving OPEN then DRAFT short-circuit; CLOSED candidates are evaluated newest-first through its own two outbound ports; published/resolved candidates are skipped; partial closing lookup fails closed with an explicit availability error; no closing predicate is copied into `session` or `hostworkspace`.
- [ ] **Step 3:** Register `hostworkspace` in all three architecture inventory/boundary files before adding the controller. Add adapters that translate the existing foreign input ports outside `hostworkspace.application`. Assert application feature edges do not grow, both dependency baseline files remain unchanged, and no foreign adapter is imported.
- [ ] **Step 4:** Expose sessionId + selection reason + server-owned schedule-seen availability. A future DRAFT is `AVAILABLE` only when it is member-visible and has the legal active participant snapshot; frontend never infers this from date, RSVP, visibility, or notification eligibility. Host detail remains the canonical detail contract.
- [ ] **Step 5:** Add the generic GET proxy proof to `front/tests/unit/cloudflare-bff.test.ts`; run the four named tests plus `./server/gradlew -p server architectureTest` and `git diff --exit-code -- server/config/architecture/feature-dependency-baseline.txt server/config/architecture/phase-0-approved-feature-dependencies.txt`, then commit server/BFF tests.

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

- [ ] **Step 1:** RED semantics: one primary CTA, visible reason, secondary defer, authoritative `workItemKey` required before deferral mutation, row label/value/detail/action, color-independent state, retryable unavailable row.
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
- Modify: `front/features/host/ui/meeting-workspace/meeting-response-ledger.test.tsx`, `front/features/host/ui/session-closing-board.test.tsx`, `front/features/host/route/host-dashboard-route.test.tsx`, and `front/tests/e2e/host-lifecycle-operating-room.spec.ts`.

- [ ] **Step 1:** Prep: schedule review CTA opens Stage 4 review only when availability is `AVAILABLE`; DRAFT unavailable keeps explanatory copy and no mutation. Other rows link to owned detail.
- [ ] **Step 2:** Live: reuse attendance editor with attended/absent/unknown, bulk action and undo receipt; no RSVP→attendance copy.
- [ ] **Step 3:** Closing: reuse readiness/checklist/record apply/publish with blocked reasons and receipts.
- [ ] **Step 4:** Add E2E for prep→live→closing without losing current meeting context.
- [ ] **Step 5:** Commit.

### Task 8: Stage verification

- [ ] **Step 1:** Run model/route/UI tests and CT at 390/768/1024/1440.
- [ ] **Step 2:** Run focused selector tests, `./scripts/server-ci-check.sh`, and frontend lint/test/build.
- [ ] **Step 3:** Run host meeting workspace, attendance, closing and authority-loss E2E specs.
- [ ] **Step 4:** Compare hierarchy/density against 07/08/09/15/16 and record discrepancies; do not pixel-trace.
