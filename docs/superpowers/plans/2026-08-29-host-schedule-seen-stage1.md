# Host Schedule Revision and Seen State Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 멤버가 현재 모임 일정을 실제로 연 revision과 coarse 최근 클럽 접속을 서로 다른 최소 사실로 저장하고, 호스트가 두 의미를 혼동하지 않고 확인하도록 한다.

**Architecture:** `sessions.schedule_revision`이 멤버 노출 일정의 version source of truth이고 `session_participants.seen_schedule_revision/seen_schedule_at`이 멤버별 최소 read fact다. 현재 모임 GET은 revision을 반환하지만 확인으로 간주하지 않는다. 화면에 일정이 렌더된 뒤 전용 idempotent PUT이 exact revision을 기록한다. 호스트 detail read model은 상태를 server에서 계산하며 BFF는 기존 generic `/api/bff/**` proxy를 그대로 사용한다.

**Tech Stack:** Flyway/MySQL, Kotlin/Spring/JdbcTemplate, Pages Functions BFF, TypeScript/Zod/TanStack Query/React Router/Vitest/Playwright.

**Spec:** ADR-0049, design §6–7, approved host mockups 07/14/17.

ADR impact: **implement ADR-0049**; 상태는 Stage 5까지 Proposed.

## Global Constraints

- 기존 데이터의 `schedule_revision`은 1, seen 값은 NULL로 backfill해 UNSEEN으로 시작한다. 과거 열람을 추정하지 않는다.
- schedule revision fingerprint는 `title`, `bookTitle`, `bookAuthor`, `bookLink`, `bookImageUrl`, `date`, `startTime`, `endTime`, `locationLabel`, `meetingUrl`, `meetingPasscode`, `questionDeadlineAt`만 포함한다.
- lifecycle, visibility, host-only memo, attendance, RSVP, questions, records, notification receipts는 schedule revision을 올리지 않는다.
- 동일 revision 재확인은 `seen_schedule_at`을 다시 쓰지 않는 no-op이다. 요청 revision이 현재보다 작거나 크면 `409 SESSION_SCHEDULE_REVISION_STALE`로 실패한다.
- host 응답에는 membershipId, displayName, avatarKey, 상태, seen revision/time만 넣는다. userId, email, auth session, page history는 넣지 않는다.
- 최근 클럽 접속은 `membership_club_access.last_access_at`만 저장한다. page path, action, duration, IP, user agent를 저장하지 않고 일정 확인으로 승격하지 않는다.
- `seen_schedule_revision/at`은 participant/session lifecycle과 함께 삭제·익명화한다. `membership_club_access`는 membership가 INACTIVE 또는 삭제되면 제거하고 ACTIVE가 아닌 actor의 write를 거절한다.
- future DRAFT는 host selection에는 참여할 수 있지만 member-visible OPEN/current schedule과 participant snapshot이 없으면 `scheduleSeenAvailability=UNAVAILABLE`, count 없음, write 없음이다.
- 새 PUT route는 `auth/infrastructure/security/SecurityConfig.kt` exact CSRF ignore와 trusted-BFF security test를 함께 추가한다.

---

### Task 0: Reconfirm anchors and path ownership

**Files:**
- Read: `server/src/main/resources/db/mysql/migration/V52__session_domain_revisions_and_participant_snapshot.sql`
- Read: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionDraftWriteOperations.kt`
- Read: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcCurrentSessionAdapter.kt`
- Read: `front/features/current-session/**`
- Read: `front/features/host/api/host-contracts.ts`

- [ ] **Step 1:** Run path classification.

```bash
python3 scripts/agent-preflight.py --intent change \
  --paths server/src/main/kotlin/com/readmates/session \
  --paths server/src/main/resources/db/mysql/migration \
  --paths front/features/current-session \
  --paths front/features/host \
  --paths front/functions/api/bff \
  --isolation-note "Stage 1 schedule seen vertical slice"
```

- [ ] **Step 2:** Reconfirm the next migration remains V61.

```bash
find server/src/main/resources/db/mysql/migration -maxdepth 1 -type f -name 'V*.sql' | sort -V | tail -3
```

Expected: V60 is latest. If a newer migration exists, renumber this plan's V61 file before editing.

- [ ] **Step 3:** Run `command -v corepack || true`. In the reviewed checkout it is absent, so use the repo-approved `npx --yes corepack@0.35.0 pnpm` launcher below and record the exact launcher in the Stage ledger.

### Task 1: Add schedule revision persistence

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V61__session_schedule_seen_state.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/domain/SessionInvariantConstraintTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/HostMemberLifecycleControllerTest.kt`

**Schema:**

```sql
alter table sessions
  add column schedule_revision bigint not null default 1,
  add constraint sessions_schedule_revision_check check (schedule_revision >= 1);

alter table session_participants
  add column seen_schedule_revision bigint null,
  add column seen_schedule_at datetime(6) null,
  add constraint session_participants_schedule_seen_pair_check check (
    (seen_schedule_revision is null and seen_schedule_at is null)
    or (seen_schedule_revision >= 1 and seen_schedule_at is not null)
  );

create index session_participants_schedule_seen_idx
  on session_participants (club_id, session_id, participation_status, seen_schedule_revision);

create table membership_club_access (
  membership_id char(36) not null,
  club_id char(36) not null,
  last_access_at datetime(6) not null,
  primary key (membership_id, club_id),
  constraint membership_club_access_membership_fk
    foreign key (membership_id, club_id) references memberships(id, club_id) on delete cascade
);

alter table host_session_mutation_receipts
  add column schedule_revision bigint not null default 1 after session_revision,
  add constraint host_session_mutation_receipts_schedule_revision_check check (schedule_revision >= 1);
```

- [ ] **Step 1:** Add failing migration assertions for columns, checks, indexes, club-access composite FK, existing session/receipt schedule revision=1, and existing participant seen=NULL. Do not backfill club access from login/auth session timestamps.
- [ ] **Step 2:** Run RED.

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.support.MySqlFlywayMigrationTest'
./server/gradlew -p server unitTest --tests 'com.readmates.session.domain.SessionInvariantConstraintTest'
```

- [ ] **Step 3:** Add V61 exactly as above; do not fabricate historical seen values. The composite FK cascades on membership delete, participant/session FK lifecycle owns seen columns, and INACTIVE row cleanup is implemented by the membership lifecycle owner rather than a fabricated login timestamp backfill.
- [ ] **Step 4:** Run GREEN with the same command.
- [ ] **Step 5:** Commit.

```bash
git add server/src/main/resources/db/mysql/migration/V61__session_schedule_seen_state.sql server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt server/src/test/kotlin/com/readmates/session/domain/SessionInvariantConstraintTest.kt
git commit -m "feat(session): persist schedule revision seen state"
```

### Task 2: Define domain policy and revision bump

**Files:**
- Create: `server/src/main/kotlin/com/readmates/session/domain/SessionScheduleRevisionPolicy.kt`
- Create: `server/src/test/kotlin/com/readmates/session/domain/SessionScheduleRevisionPolicyTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionRowMappers.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionDraftWriteOperations.kt`
- Modify: focused DB test owning host basic update (locate with `rg -n "SESSION_BASIC_SAVE|update draft" server/src/test/kotlin/com/readmates/session`).

**Interfaces:**

```kotlin
data class MemberVisibleSchedule(
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookLink: String?,
    val bookImageUrl: String?,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val locationLabel: String,
    val meetingUrl: String?,
    val meetingPasscode: String?,
    val questionDeadlineAt: LocalDateTime,
)

object SessionScheduleRevisionPolicy {
    fun changed(before: MemberVisibleSchedule, after: MemberVisibleSchedule): Boolean = before != after
}
```

- [ ] **Step 1:** Write table-driven RED tests: each allowlisted field bumps; session state, exposure, attendance, RSVP, question and record changes do not.
- [ ] **Step 2:** Extend the locked existing row to load the complete member-visible schedule and current `schedule_revision`.
- [ ] **Step 3:** Change the host update SQL to `schedule_revision = schedule_revision + ?`, where the bound delta is 1 only when policy says changed. Keep `session_revision` CAS unchanged.
- [ ] **Step 4:** Prove no-op updates do not bump schedule revision and stale `sessionRevision` still commits nothing.
- [ ] **Step 5:** Run focused tests and commit.

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.session.domain.SessionScheduleRevisionPolicyTest'
./server/gradlew -p server integrationTest --tests '*HostSession*DbTest'
git add server/src/main/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/session
git commit -m "feat(session): version member-visible schedule changes"
```

### Task 3: Add member seen command with exact-revision guard

**Files:**
- Create: `server/src/main/kotlin/com/readmates/session/application/model/SessionScheduleSeenModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/in/SessionMemberWriteUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/SessionParticipationWritePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcSessionParticipationWriteAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionScheduleSeenController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/SessionScheduleSeenDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionBffSecurityTest.kt`

**Interfaces:**

```kotlin
data class MarkScheduleSeenCommand(val member: CurrentMember, val scheduleRevision: Long)
data class ScheduleSeenResult(val scheduleRevision: Long, val seenAt: OffsetDateTime)

interface MarkCurrentScheduleSeenUseCase {
    fun markSeen(command: MarkScheduleSeenCommand): ScheduleSeenResult
}
```

HTTP contract:

```text
PUT /api/sessions/current/schedule-seen
{"scheduleRevision": 3}
200 {"scheduleRevision":3,"seenAt":"...+00:00"}
409 {"code":"SESSION_SCHEDULE_REVISION_STALE", ...}
```

- [ ] **Step 1:** Add RED API/DB tests for first seen, same-revision no-op preserving timestamp, stale/future revision 409, inactive participant/membership, DRAFT unavailable, no open session, and cross-club denial.
- [ ] **Step 2:** Implement one transaction: lock the URL-authoritative open session, compare exact revision, require ACTIVE participant, update only NULL/older seen revision, return stored timestamp.
- [ ] **Step 3:** Add exact `PUT /api/sessions/current/schedule-seen` CSRF ignore registration and security tests proving valid BFF secret + allowed Origin reaches the controller, while missing/invalid secret or origin is rejected.
- [ ] **Step 4:** Do not bump meeting/record epochs or notification state for this read fact.
- [ ] **Step 5:** Run focused tests and commit.

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.SessionScheduleSeenDbTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.HostSessionBffSecurityTest'
git add server/src/main/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/session/api/SessionScheduleSeenDbTest.kt
git commit -m "feat(session): record exact current schedule views"
```

### Task 4: Expose privacy-safe member and host read models

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionRevisionModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcCurrentSessionAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionRowMappers.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionProjectionQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostMutationReceiptAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendFixtureContractTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`
- Modify: `front/tests/unit/__fixtures__/host-session-detail.json`, `current-session-empty.json`
- Modify: `front/tests/unit/__fixtures__/zod-schemas/host-session-detail.json`, `current-session.json`, `host-session-change-receipt.json`, `host-session-history-recovery.json`, and `host-session-record-editor.json`
- Modify: `front/scripts/export-zod-fixtures.ts`

**Wire additions:**

```kotlin
enum class ScheduleSeenState { CURRENT, STALE, UNSEEN }

// CurrentSessionDetail
val scheduleRevision: Long
val mySeenScheduleRevision: Long?
val myScheduleSeenAt: String?

// HostSessionDetailResponse
val scheduleRevision: Long
val scheduleSeenAvailability: ScheduleSeenAvailability // AVAILABLE | UNAVAILABLE
val scheduleSeenSummary: ScheduleSeenSummary

// SessionVersionVector and every host mutation receipt/projection
val scheduleRevision: Long

// HostSessionAttendee
val seenScheduleRevision: Long?
val scheduleSeenAt: String?
val scheduleSeenState: ScheduleSeenState
```

- [ ] **Step 1:** Add RED contract tests and a forbidden-key assertion against `email`, `userId`, auth session fields, page paths and raw history.
- [ ] **Step 2:** Add `scheduleRevision` to Kotlin/TypeScript version vectors, projection snapshot identity, immutable host mutation receipt persistence and reconciliation mapping. Historical receipt rows stay at migration baseline 1.
- [ ] **Step 3:** Calculate CURRENT only for exact equality, STALE for non-null older, UNSEEN for null. Exclude REMOVED participants from summary denominator but keep detail row if existing host detail already exposes it. A DRAFT without a member-visible participant snapshot returns `scheduleSeenAvailability=UNAVAILABLE`, no zero/UNSEEN count, and no review destination.
- [ ] **Step 4:** Return self seen fields only in member current-session response.
- [ ] **Step 5:** Run `npx --yes corepack@0.35.0 pnpm --dir front zod:export-fixtures`, verify `git diff --exit-code -- front/tests/unit/__fixtures__/zod-schemas/` after staging generated contract changes, then run the two `com.readmates.contract` classes through `integrationTest` plus focused receipt replay/reconciliation tests and commit.

### Task 5: Prove the generic BFF contract

**Files:**
- Modify: `front/tests/unit/cloudflare-bff.test.ts`.
- Modify: BFF route allowlist only if the current generic proxy explicitly limits methods/paths.

- [ ] **Step 1:** Add a failing proxy test for the browser path `PUT /api/bff/api/sessions/current/schedule-seen`, which the generic proxy forwards to upstream `PUT /api/sessions/current/schedule-seen`; prove club context forwarding, body preservation, and upstream 409 preservation.
- [ ] **Step 2:** If it already passes, keep the test and make no production BFF change. If it fails, make the smallest generic correction; do not add a parallel endpoint-specific function.
- [ ] **Step 3:** Run the focused Functions test and commit.

### Task 6: Record seen state only after the member schedule renders

**Files:**
- Modify: `front/shared/model/current-session-contracts.ts`
- Modify: `front/features/current-session/api/current-session-contracts.ts`
- Modify: `front/features/current-session/api/current-session-api.ts`
- Modify: `front/features/current-session/queries/current-session-queries.ts`
- Modify: `front/features/current-session/route/current-session-route.tsx`
- Modify: `front/features/current-session/ui/current-session-page.tsx`
- Modify: `front/features/current-session/api/current-session-contracts.test.ts`
- Modify: `front/features/current-session/queries/current-session-queries.test.tsx`
- Create: `front/features/current-session/route/current-session-route.test.tsx`
- Modify: `front/features/current-session/ui/current-session-review-visibility.test.tsx`

**Interfaces:**

```ts
type ScheduleSeenReceipt = { scheduleRevision: number; seenAt: string };
markCurrentScheduleSeen(scheduleRevision: number, context?: ReadmatesApiContext): Promise<ScheduleSeenReceipt>;
```

- [ ] **Step 1:** Add RED tests proving loader/prefetch does not mark seen; mounted page with a non-null current session marks exact revision once; remount same cached revision is idempotent; 409 invalidates current session then retries only after fresh render; offline/error exposes an inline retry without blocking RSVP/questions.
- [ ] **Step 2:** Extend strict Zod schemas with the new fields.
- [ ] **Step 3:** Add a mutation hook scoped by club slug. Trigger it from a small route effect only after `CurrentSessionPage` receives a rendered session; do not trigger from GET, loader or model transformation.
- [ ] **Step 4:** On success, patch the current-session cache self fields. On 409, invalidate without auto-looping. On authority loss, existing recovery owns navigation.
- [ ] **Step 5:** Run focused tests and commit.

```bash
npx --yes corepack@0.35.0 pnpm --dir front test -- features/current-session shared/model/current-session-contracts
git add front/shared/model/current-session-contracts.ts front/features/current-session
git commit -m "feat(member): acknowledge rendered schedule revisions"
```

### Task 7: Add host contracts and schedule review model

**Files:**
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Create: `front/features/host/model/host-schedule-seen-model.ts`
- Create: `front/features/host/model/host-schedule-seen-model.test.ts`
- Modify: host API/query tests.

**Interfaces:**

```ts
type ScheduleSeenState = "CURRENT" | "STALE" | "UNSEEN";
type HostScheduleSeenRow = {
  membershipId: string;
  displayName: string;
  avatarKey: string;
  state: ScheduleSeenState;
  seenScheduleRevision: number | null;
  scheduleSeenAt: string | null;
};
```

- [ ] **Step 1:** Add RED Zod/API/query/model tests for counts, labels, sort order UNSEEN→STALE→CURRENT, removed participant exclusion, and no inference from RSVP/attendance.
- [ ] **Step 2:** Extend `HostVersionVectorSchema`, projection and receipt schemas with positive `scheduleRevision`, then extend existing host detail rather than introducing a duplicate read endpoint.
- [ ] **Step 3:** Add `hostScheduleSeenRows(detail)` and `hostScheduleSeenSummary(detail)` pure functions for Stage 3/4.
- [ ] **Step 4:** Run host mutation receipt/reconciliation regression tests in addition to API/query/model tests and commit.

### Task 8: Record coarse club access without page tracking

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/model/ClubAccessModels.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/in/TouchClubAccessUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/ClubAccessPort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/service/ClubAccessService.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcClubAccessAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/ClubAccessController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberLifecycleStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/MemberLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberLifecycleStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/HostMemberLifecycleControllerTest.kt`
- Create/modify: `server/src/test/kotlin/com/readmates/auth/api/ClubAccessBffSecurityTest.kt`
- Modify: host member list row/model/mapper/persistence files located by `rg -n "HostMemberListItem|HostMemberListRow" server/src/main/kotlin/com/readmates/auth`.
- Create: `front/shared/auth/club-access-api.ts`
- Create: `front/shared/auth/club-access-query.ts`
- Modify: `front/src/app/layouts/app-route-layout.tsx`
- Modify: `front/features/host/api/host-contracts.ts`
- Test: server API/persistence, host member contract, frontend layout/query and generic BFF tests.

**Contract:**

```text
PUT /api/me/club-access
200 {"lastClubAccessAt":"...+00:00"}
```

Host member rows add `lastClubAccessAt: string | null`; this value never affects `scheduleSeenState`.

- [ ] **Step 1:** RED tests: authenticated ACTIVE member/host success, viewer policy follows current member-app access rule, cross-club denial, support-synthesized host excluded, 15-minute write throttle, INACTIVE write rejection/removal, membership delete cascade, and no route/action/auth metadata columns.
- [ ] **Step 2:** Implement a SQL upsert that advances `last_access_at` only when absent or older than 15 minutes, then returns the stored time. Do not update `memberships.updated_at`.
- [ ] **Step 3:** Wire membership lifecycle deactivation/deletion to remove `membership_club_access` in the same transaction. Prove participant/session hard-delete/anonymize removes or anonymizes seen facts while legally retained participant history keeps them.
- [ ] **Step 4:** Add exact `PUT /api/me/club-access` CSRF ignore registration and trusted-BFF/origin security tests.
- [ ] **Step 5:** After an authenticated club app shell mounts, issue the idempotent touch once per club-scoped client episode. Failure is non-blocking and must not mark schedule seen.
- [ ] **Step 6:** Left join the fact into existing host member list/detail contracts; add a pure presentation test for `최근 접속 …` versus `접속 기록 없음`.
- [ ] **Step 7:** Add BFF and privacy forbidden-key tests and commit.

### Task 9: Stage verification

- [ ] **Step 1:** Run server gates.

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

- [ ] **Step 2:** Run frontend gates.

```bash
npx --yes corepack@0.35.0 pnpm --dir front lint
npx --yes corepack@0.35.0 pnpm --dir front test
npx --yes corepack@0.35.0 pnpm --dir front build
```

- [ ] **Step 3:** Run the member current-session E2E scenario with two clubs and a host edit between two member views. Assert UNSEEN → CURRENT → STALE → CURRENT, unchanged RSVP/attendance, and independently advanced `lastClubAccessAt`.
- [ ] **Step 4:** Add DRAFT unavailable → OPEN UNSEEN before the same scenario, plus INACTIVE cleanup/erase integration evidence.
- [ ] **Step 5:** Run affected `architectureTest` and `com.readmates.contract` integration tests. Record any browser test not run as `not measured`; do not accept ADR-0049 yet.
