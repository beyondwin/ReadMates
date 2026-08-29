# Host Workbox and Auxiliary Ledgers Stage 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 모임 밖 업무를 잃지 않는 `지금 · 보류 · 완료` 작업함과 일정/사람/기록/초대·설정 목적지를 완성한다.

**Architecture:** cross-domain work item projection과 user-controlled deferral만 새 server `hostworkspace` feature가 소유한다. source completion은 memberships, schedule seen, record closing, invitations, notification receipts에서 계산하며 별도 mutable completed flag로 복제하지 않는다. deferral은 stable source key에 묶어 저장하고 source가 해결되면 completed projection이 된다. frontend는 aggregate workbox query를 운영실에 사용하고 각 ledger는 기존 domain query를 재사용한다.

**Tech Stack:** Kotlin clean feature package/JdbcTemplate/Flyway, React Router/TanStack Query/Zod, Vitest/Playwright.

**Spec:** ADR-0048, design §3–7/9, approved 10–14/17.

ADR impact: **update ADR-0048 before code** with stable work-item identity, derived completion, deferral expiry and 30-day completed retention.

## Global Constraints

- v1 sources: `SCHEDULE_UNSEEN`, `MEMBER_APPROVAL`, `RECORD_CLOSING`, `INVITATION_EXPIRY`, `NOTIFICATION_FAILURE`.
- source completion is authoritative. Deferral never marks a source solved and expires back to NOW.
- completed shows resolved source/operation receipts from the last 30 days; no raw email, provider body, token or page history.
- `대상과 문구 검토` always opens preview and never sends automatically.
- people detail separates Stage 1 `lastClubAccessAt`, schedule seen, RSVP and attendance; none substitutes for another.
- cursor collections use server continuation; do not client-slice partial collections.

---

### Task 0: Update the Proposed ADR and inventory source facts

**Files:**
- Modify: `docs/development/adr/0048-host-lifecycle-operating-room-composition.md`
- Read: manual notification, membership approval, invitation, session closing and Stage 1 contracts.

- [ ] **Step 1:** Add the fixed source types, key `{type}:{resourceId}:{revision-or-version}`, derived completion, deferral expiry, 30-day retention and privacy allowlist to ADR-0048.
- [ ] **Step 2:** Run `git diff --check` on the ADR before code.

### Task 1: Persist work-item deferrals

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V62__host_work_item_deferrals.sql`. Recheck the migration tail before implementation; if another merged migration already owns V62, renumber this file to the next free integer and update the plan in the same commit.
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/domain/HostWorkItem.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/model/HostWorkboxModels.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/port/in/HostWorkboxUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/port/out/HostWorkboxPorts.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/out/persistence/JdbcHostWorkboxAdapter.kt`
- Create: focused domain/migration tests.

**Schema core:**

```sql
create table host_work_item_deferrals (
  club_id char(36) not null,
  host_membership_id char(36) not null,
  work_item_key varchar(255) character set ascii collate ascii_bin not null,
  deferred_until datetime(6) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default (utc_timestamp(6)),
  primary key (club_id, host_membership_id, work_item_key),
  key host_work_item_deferrals_expiry_idx (club_id, host_membership_id, deferred_until)
);
```

- [ ] **Step 1:** RED tests for valid keys, max length, future-only defer, host ownership, overwrite, expiry and cross-club isolation.
- [ ] **Step 2:** Add FK/check constraints following current conventions and bounded cleanup for expired rows older than 30 days.
- [ ] **Step 3:** Implement ports/adapters and commit.

### Task 2: Build aggregate workbox service and API

**Files:**
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/application/service/HostWorkboxService.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostWorkboxController.kt`
- Create: `server/src/main/kotlin/com/readmates/hostworkspace/adapter/in/web/HostWorkboxErrorHandler.kt`
- Create: focused service/API/MySQL tests.
- Reuse narrow source read ports; never import another feature's persistence adapter.

**API:**

```text
GET    /api/host/workbox?state=NOW|DEFERRED|COMPLETED&limit=20&cursor=...
PUT    /api/host/workbox/items/{urlEncodedWorkItemKey}/deferral
       {"deferredUntil":"...+00:00"}
DELETE /api/host/workbox/items/{urlEncodedWorkItemKey}/deferral
```

Each item returns allowlisted `key,type,state,title,description,count,dueAt,deferredUntil,resolvedAt,destinationHref,receiptSummary`.

- [ ] **Step 1:** RED matrix for five sources, priority/due order, zero-as-data, partial source failure, defer, auto-return, derived completion and retention.
- [ ] **Step 2:** Bind cursor to state, evaluatedAt and sort tuple; malformed/cross-state cursors return controlled 400.
- [ ] **Step 3:** Require active HOST and URL club context. Destination href is scoped app-relative and contains no private value.
- [ ] **Step 4:** Add forbidden-key tests and commit.

### Task 3: Add frontend workbox contract, query and model

**Files:**
- Create: `front/features/host/api/host-workbox-contracts.ts`
- Create: `front/features/host/api/host-workbox-api.ts`
- Create: `front/features/host/queries/host-workbox-queries.ts`
- Create: `front/features/host/model/host-workbox-model.ts`
- Create: matching tests.

- [ ] **Step 1:** RED strict Zod tests for all states/types, partial warnings, receipt and cursor.
- [ ] **Step 2:** Query keys include club slug + state + cursor. Deferral invalidates every state and operating-room composition.
- [ ] **Step 3:** Pure model maps types to approved Korean labels/destinations without hiding zero counts.
- [ ] **Step 4:** Add workbox root to authority-loss purge and commit.

### Task 4: Build HostWorkbox and review-first schedule notification

**Files:**
- Create: `front/features/host/ui/workbox/host-workbox.tsx`
- Create: `front/features/host/ui/workbox/host-work-item.tsx`
- Create: `front/features/host/ui/workbox/operation-receipt.tsx`
- Create: `front/features/host/ui/workbox/host-workbox.css`
- Create: unit/CT tests.
- Modify: operating-room route to render it.
- Create: `front/features/host/route/host-schedule-review-route.tsx` and route element.

- [ ] **Step 1:** RED tests for tabs/counts, retryable partial source, empty, overdue, defer/undo and receipt pending/success/partial/failure/unknown.
- [ ] **Step 2:** Render hairline rail at desktop 68/32 and below preparation at <=1199px.
- [ ] **Step 3:** Schedule unseen opens `/sessions/:id/schedule-review`; select STALE/UNSEEN, show excluded CURRENT, edit copy, then reuse manual notification preview→confirm.
- [ ] **Step 4:** Sending never happens on open/selection. Confirm/partial/unknown receipts remain visible and invalidate workbox/notification/detail.
- [ ] **Step 5:** Commit.

### Task 5: Finish meetings, people, records and settings destinations

**Files:**
- Modify/reuse: `front/features/host/ui/meeting-list/**` and `host-meeting-list-*`.
- Modify/reuse: `front/features/host/ui/members/**` and `host-members-*`.
- Modify/reuse: `front/features/host/ui/meeting-ledger/**` and `host-session-record-*`.
- Create: `front/features/host/route/host-person-detail-route.tsx`
- Create: `front/features/host/ui/members/host-person-detail.tsx`
- Create: `front/features/host/route/host-settings-route.tsx`
- Create/modify route tests and CT.

- [ ] **Step 1:** Meetings: scheduled/past, list/calendar affordance, new/edit links and status; no fake calendar data.
- [ ] **Step 2:** People: approval and active members use `AvatarChip`; detail shows schedule state/revision/time, RSVP, attendance history and membership actions separately.
- [ ] **Step 3:** Person detail renders Stage 1 `lastClubAccessAt` as coarse `최근 접속` or `접속 기록 없음`, with privacy copy that page 열람 기록은 수집하지 않음을 설명한다. Never map user login/auth-session timestamps.
- [ ] **Step 4:** Records: closing state, record status, publication history, exact detail and cursor continuation.
- [ ] **Step 5:** Settings: invitations and club settings in one destination with permission-limited reasons; notification ledger remains utility.
- [ ] **Step 6:** Add CT for 10/11/12/13/14/17 and commit.

### Task 6: BFF, server and browser verification

- [ ] **Step 1:** Add generic BFF GET/PUT/DELETE proxy coverage to `front/tests/unit/cloudflare-bff.test.ts` with club/error preservation.
- [ ] **Step 2:** Run server CI and integration tests.
- [ ] **Step 3:** Run frontend lint/test/build.
- [ ] **Step 4:** Run E2E: defer→expiry, source resolved→completed, schedule preview→confirm, partial receipt, approval, privacy and cursor continuation.
- [ ] **Step 5:** Record real email/provider delivery as `not measured`; it is not required for local completion.
