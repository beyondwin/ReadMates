# Host Meeting Server Safety Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공동 호스트와 네트워크 재시도에서도 모임·출석·기록·노출 변경이 덮어쓰이거나 중복 실행되지 않도록 revision, participant snapshot, idempotency receipt, atomic publication 계약을 구현한다.

**Architecture:** Flyway V52가 독립 revision domain을 추가하고 application service가 conditional port를 통해 transaction을 소유한다. `OPEN` participant snapshot과 member-write barrier를 같은 session row에 정렬하고 actual attendance는 participant별 CAS를 사용한다. Flyway V53의 neutral `shared/mutation` capability는 mutable operational idempotency ownership과 canonical HMAC primitive만 제공하고, session/sessionrecord/notification 각 feature가 자기 immutable receipt binding을 소유한다. Exposure와 publication은 필요한 version vector 전체를 한 transaction에서 검증한다.

**Tech Stack:** Kotlin, Spring Boot, JDBC, MySQL 8, Flyway, JUnit 5, MockMvc, Testcontainers, Micrometer.

**Spec:** `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

ADR impact: new — ADR-0018, ADR-0023, ADR-0024, ADR-0025, ADR-0028, ADR-0038; constraining reference — ADR-0033

## Global Constraints

- Existing enum and route/API resource names remain `DRAFT|OPEN|CLOSED|PUBLISHED` and `session`.
- RSVP and actual attendance never overwrite each other; actual attendance supports `ATTENDED|ABSENT|UNKNOWN`.
- Lifecycle, app audience, and public-site placement remain independent axes.
- Multi-port transaction orchestration stays in application services. Controllers validate/map; adapters perform conditional storage operations.
- Conditional update count `0` becomes a domain `REVISION_CONFLICT`; stale paths create no child write, audit, receipt, cache effect, or partial response.
- Independent participants may update attendance concurrently. Bulk attendance is all-or-nothing.
- Close and member RSVP/check-in/question/review use the same lock order and session lifecycle recheck.
- Participant snapshot, notification audience source, and response denominator use the same active participant semantics.
- Existing record draft/live revision, record apply receipt, immutable history, notification preview/confirm strength, trash eligibility, seven-day retention, restore conflict, and expiry `410` are preserved.
- Notification confirm remains notification-owned and never imports a session receipt type. Its existing preview/content/target/duplicate/resend and dispatch receipt contract is the completion/reconciliation proof for that operation.
- Every receipt lookup reauthorizes current club and active host authority.
- Request identity uses NFC and operation-versioned canonical schemas plus secret-keyed HMAC. Raw canonical input, meeting URL/passcode, plaintext SHA, and HMAC secret never reach DB/log/DTO.
- Operational idempotency rows retain at least 24 hours. Immutable audit/change receipts follow their existing retention.
- Seven-day hard deletion must still succeed after V52–V55. Operational rows may be deleted or expired by their documented policy; immutable participant audit, feature receipts, and convergence/admin events retain only redacted resource UUID snapshots and must not hold an `ON DELETE CASCADE|RESTRICT` foreign key to a deletable session/publication row. Integration tests delete the expired resource, then prove immutable bytes remain queryable only through authorized audit paths.
- Digest key retirement is fail closed until no row references the key and an additional 24-hour rollout buffer has elapsed.
- All affected metrics use bounded tags; never tag club, session, membership, idempotency key, URL, or error text.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Version vector and projection snapshot identity | 1 |
| Basic/lifecycle/trash/restore optimistic concurrency | 2 |
| Participant snapshot and close/member-write serialization | 3 |
| Actual attendance UNKNOWN, row and bulk CAS | 4 |
| HMAC idempotency and key rotation | 5 |
| Mutation adoption, receipts, response-loss reconciliation | 6 |
| Exposure/publication dual-write and PUBLISHED correction | 7 |
| Browser-visible server errors and future notification templates use canonical meeting language | 8 |

## Dependency Order

`1 → 2 → 3`; `1 → 4`; `1 → 5 → 6`; `2 + 5 + 6 → 7`; `1 → 8`. Task 3 must land before close receives a v3 version vector. Task 7 is an origin-atomicity substrate and cannot be released as complete public-effect behavior until public-convergence Task 1 adds generation/ledger semantics.

## File Responsibility Map

| Responsibility | Files |
| --- | --- |
| Revision migration/model | V52; `HostSessionRevisionModels.kt`; session application/web models |
| Conditional session writes | session controllers, services, ports, JDBC write operation files |
| Participant barrier | session lifecycle/member-write and auth member-lifecycle ports/adapters |
| Attendance CAS | attendance controller/service/port/write operations/audit |
| Idempotency substrate | V53; neutral `shared/mutation` HMAC/claim port/adapter/service/scheduler |
| Receipt adoption | feature-owned session and existing record/notification receipts; session reconciliation controller |
| Atomic exposure/publication | publication/lifecycle controllers, publication service/port/JDBC, record apply store |
| Canonical server copy | session/record/notification error handlers and future email/in-app templates |

---

### Task 1: Add domain revisions and participant snapshot identity

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V52__session_domain_revisions_and_participant_snapshot.sql`
- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionRevisionModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionWebDtos.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Create: `server/src/test/kotlin/com/readmates/session/application/model/HostSessionRevisionModelsTest.kt`

**Interfaces:**

```kotlin
data class SessionVersionVector(
    val sessionRevision: Long,
    val exposureRevision: Long,
    val participantSetRevision: Long,
    val recordDraftRevision: Long?,
    val liveRecordRevision: Long?,
    val publicationRevision: Long,
)

data class AttendanceVersion(
    val membershipId: UUID,
    val attendanceRevision: Long,
)
```

V52 adds non-negative `sessions.session_revision`, `sessions.exposure_revision`, `sessions.participant_set_revision`, and `session_participants.attendance_revision`, each `NOT NULL DEFAULT 0`. It creates a minimal `session_publication_versions(session_id, publication_revision)` concurrency table and backfills revision `0` without creating or changing `public_session_publications` content rows. Future session create inserts this version row in the same transaction. It also creates `club_host_list_epochs(club_id, meeting_epoch, record_epoch)` for Task 2's mutation-stale cursor contract. V52 adds append-only participant-change audit with actor, club/session/membership UUID snapshots, before/after `ACTIVE|REMOVED`, participant-set revision, and timestamp. Immutable audit rows do not retain a destructive FK to the session. It adds an immutable projection snapshot identity generated by the application from resource UUID plus version vector; it does not add a mutable client-provided snapshot ID column.

- [ ] **Step 1: Write RED migration and serialization tests.** Cover empty database, legacy rows in every lifecycle state, trashed rows, existing participant rows, absent/existing publication content rows, publication-version and per-club list-epoch backfill, participant-audit constraints, future create, and seven-day hard delete. Assert default `0`, non-negative constraints, UUID types, unique version/epoch rows, unchanged non-empty `public_summary` semantics, successful resource deletion, retained redacted audit bytes, and JSON field names.
- [ ] **Step 2: Run RED.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.model.HostSessionRevisionModelsTest`

  Expected: FAIL because V52 and revision models do not exist.

- [ ] **Step 3: Implement V52 and immutable model types.** Do not edit V1–V51. Reuse V39/V42 record revisions and V45 exposure data rather than duplicating them.
- [ ] **Step 4: Run GREEN and architecture checks.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.model.HostSessionRevisionModelsTest`

  Expected: PASS.

- [ ] **Step 5: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(server): add host meeting revision domains`

---

### Task 2: Make basic, lifecycle, trash, and restore writes conditional

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionLifecycleController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionTrashController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionRecoveryController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/in/HostSessionUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionDraftCommandService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionTrashService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionRecoveryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordDraftService.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionPublicationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionDraftPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionLifecyclePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionDeletionPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionRecoveryPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionDraftWriteOperations.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionLifecycleWriteOperations.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionDeletionQueries.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionRecoveryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionQueryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionQueryPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostMeetingListCursor.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/paging/HostListCursorSigner.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/paging/HostListCursorSigningProperties.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/listing/application/model/HostListEpoch.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/listing/application/port/out/HostListEpochPort.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/listing/adapter/out/persistence/JdbcHostListEpochAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostSessionRevisionContractDbTest.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostSessionListCursorDbTest.kt`
- Create: `server/src/test/kotlin/com/readmates/session/application/HostListEpochCoverageTest.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/paging/HostListCursorSignerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `.env.example`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionTrashControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionRecoveryControllerDbTest.kt`

**Interfaces:**

```kotlin
data class ExpectedSessionRevision(val value: Long)
data class RevisionConflictResult(
    val code: String = "REVISION_CONFLICT",
    val current: SessionVersionVector,
    val changedAt: Instant?,
    val changedByDisplay: String?,
)
```

Every affected update includes `WHERE id = ? AND session_revision = ?` and increments only the revision domains actually changed. Conflict actor text is privacy-safe and optional; email/membership ID is never returned.

Trash restore and basic-change undo consume `expectedSessionRevision`. Attendance history undo is not guarded by sessionRevision: it consumes the affected membership UUID, `expectedAttendanceRevision`, and current row hash; multi-row undo delegates to Task 4's all-or-nothing preflight.

The list API remains backward compatible with the existing single `state` parameter and adds explicit `mode=meeting|record`; `state`, `states`, and `mode` are mutually exclusive. `mode=meeting` canonicalizes to `{DRAFT,OPEN}` and `mode=record` to `{CLOSED,PUBLISHED}`. Repeated `states` rejects duplicates/unknown/unsupported combinations and canonicalizes order before fingerprinting. Meeting and record views each execute one SQL predicate and one cursor stream; the browser never merges independent state cursors.

V52 also creates a neutral `club_host_list_epochs` row with separate `meeting_epoch` and `record_epoch`. Every transaction that changes list membership, sort rank, meeting date, lifecycle, trash state, attention, record readiness, or filter-visible data increments the affected epoch through `shared/listing`. An executable coverage test maps every SQL sort/filter source to its owning mutation path. A cursor contains `orderingVersion=host-list-v1`, club UUID, canonical mode/state set, normalized search/filter fingerprint, epoch, server-issued/fixed `evaluatedAt`, expiry, key version, and the last tuple.

The cursor payload is canonical JSON authenticated with purpose-separated `HMAC-SHA-256(cursorKey, "readmates:host-list:v1\u0000" + payload)` and constant-time verification; it never reuses the request-identity/idempotency key. Current and previous cursor keys have explicit versions. Valid previous-key cursors replay only within the 24-hour cursor TTL plus rollout buffer; unknown/retired versions, expiry, or any single-field/MAC mutation fails closed without logging payload/MAC. Tampering returns `INVALID_CURSOR`; a valid but expired or epoch-mismatched cursor returns `LIST_CURSOR_STALE` with a restart target.

`HostSessionQueryService.list` owns one read-only MySQL `REPEATABLE_READ` transaction. The first consistent read captures/checks epoch, then the same snapshot fixes `evaluatedAt`, loads the page, and creates the response cursor; a concurrent mutation commits its row change and epoch bump atomically, so the query observes either the complete old snapshot or the complete new epoch, never mixed data. Continuation first checks the snapshot epoch; mismatch returns `409 LIST_CURSOR_STALE` with no page data.

`attentionRank` inputs are version-controlled in `HostListEpochCoverageTest`: meeting mode uses lifecycle, scheduled date relative to the cursor's fixed `evaluatedAt`, and response/preparation completeness; record mode uses lifecycle, record readiness/draft/live/publication status. Member content, record draft/apply/correction, publication, lifecycle, basic date/title/book changes, trash/restore, and any future input named by the SQL projection must bump the matching epoch in the same application-service transaction. The cursor fixes `evaluatedAt` for all pages so wall-clock passage alone cannot reorder a continuation.

Within one epoch, meeting order is `(attentionRank ASC, meetingDate ASC NULLS LAST, stateRank ASC where OPEN=0,DRAFT=1, sessionNumber DESC, sessionId DESC)`. Record order is `(attentionRank ASC, meetingDate DESC NULLS LAST, stateRank ASC where CLOSED=0,PUBLISHED=1, sessionNumber DESC, sessionId DESC)`. SQL uses the exact lexicographic continuation predicate for that tuple. The contract guarantees no gaps/duplicates only while the epoch matches; it never claims snapshot continuity across a concurrent reordering mutation.

- [ ] **Step 1: Write RED concurrent-update, list-mode, signed-cursor, snapshot-race, and epoch-coverage tests.** Use two transactions from the same base for basic save; assert one success, one `409`, winner retained. Add stale open/close/reverse/trash/basic-restore cases plus attendance undo with stale attendance revision/current hash, and assert zero audit/child/cache side effects. For both meeting `{DRAFT,OPEN}` and record `{CLOSED,PUBLISHED}` modes, cover mutual-exclusion validation, state-set normalization, equal tuple ties, exact ASC/DESC/null ordering, no gaps/duplicates while epoch is unchanged, search/filter fingerprint mismatch, trash/opposite-mode exclusion, and opaque cursor validation. Test every single payload field and MAC mutation, wrong/unknown/retired key version, expiry, valid previous-key rollout replay, and no sensitive cursor log. With latches, commit a row+epoch mutation after the epoch read but before page SQL and assert either one consistent old snapshot or zero-data stale, never mixed/partial data. Mutate every registered sort/filter source between completed page requests and assert `LIST_CURSOR_STALE`; do not assert impossible continuity across that mutation.
- [ ] **Step 2: Run RED.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionRevisionContractDbTest --tests com.readmates.session.api.HostSessionListCursorDbTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.HostListEpochCoverageTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.paging.HostListCursorSignerTest`

  Expected: FAIL because commands do not accept expected revision and writes are unconditional.

- [ ] **Step 3: Add expected revision DTOs, conditional ports, list modes, and signed epoch-guarded cursors.** Map stale update count to a typed application exception and `409 REVISION_CONFLICT`. Future session create inserts the revision-0 row in `session_publication_versions` in the same transaction. Implement both server-owned list modes, exact ordering/fingerprints, separate cursor-key rotation, consistent-snapshot read transaction, neutral epoch bumping, and `LIST_CURSOR_STALE`; never compose pages in the client. Preserve the legacy single-state request and existing lifecycle-specific blockers/response codes.
- [ ] **Step 4: Keep transaction ownership in application services.** Lock/read authority and current state, invoke the conditional write, append audit only after successful CAS, and return the new vector.
- [ ] **Step 5: Run GREEN and focused regressions.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionRevisionContractDbTest --tests com.readmates.session.api.HostSessionListCursorDbTest --tests com.readmates.session.api.HostSessionControllerDbTest --tests com.readmates.session.api.HostSessionTrashControllerDbTest --tests com.readmates.session.api.HostSessionRecoveryControllerDbTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.HostListEpochCoverageTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.paging.HostListCursorSignerTest`

  Expected: PASS.

- [ ] **Step 6: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(server): guard host meeting mutations by revision`

---

### Task 3: Own the participant snapshot and serialize close against member writes

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionLifecycleWriteOperations.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/SessionParticipationWritePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcSessionParticipationWriteAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/MemberLifecycleService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberLifecycleStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberLifecycleStoreAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
- Modify: notification persistence audience queries under `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/SessionParticipantAuditPort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcSessionParticipantAuditAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostSessionParticipantSnapshotDbTest.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostSessionCloseMemberWriteRaceDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/application/HostListEpochCoverageTest.kt`
- Modify: relevant notification preview/confirm integration tests

**Interfaces:**

```kotlin
enum class SessionParticipationStatus { ACTIVE, REMOVED }
data class ParticipantSetSnapshot(
    val sessionId: UUID,
    val revision: Long,
    val activeMembershipIds: Set<UUID>,
)
```

Open creates the active participant snapshot and changes `DRAFT + HOST_ONLY` to `OPEN + GUEST_READABLE + HIDDEN` in one transaction. Explicit add/exclude/reactivate increments `participantSetRevision` and writes actor/time audit. Membership churn does not erase historical response or attendance.

- [ ] **Step 1: Write RED snapshot and list-epoch tests.** Cover join before/after open, leave, suspend, reactivate, explicit participant add/exclude, duplicate display names, stable response denominator, and one meeting-epoch increment in the same transaction for every participant/response-completeness input registered by the list projection.
- [ ] **Step 2: Write RED race tests.** For RSVP, check-in, question, one-line review, and long review, coordinate close and member write with latches. Assert write-before-close is preserved and close-before-write returns a lifecycle conflict without ghost rows.
- [ ] **Step 3: Run RED.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionParticipantSnapshotDbTest --tests com.readmates.session.api.HostSessionCloseMemberWriteRaceDbTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.HostListEpochCoverageTest`

  Expected: FAIL because participant mutation has no revision/audit and close/member writes do not share a barrier.

- [ ] **Step 4: Implement one lock order, participant audit, and meeting-epoch bump.** Every path locks the session row first, rechecks active club/authority/lifecycle, then participant/content rows. Write actor/club/session/membership, before/after `ACTIVE|REMOVED`, resulting revision, timestamp, and the registered meeting-epoch increment in the same transaction. Do not introduce adapter-owned cross-port transactions.
- [ ] **Step 5: Align notification sources.** `SESSION_PARTICIPANTS` uses the active participant snapshot and `participantSetRevision`; `CONFIRMED_ATTENDEES` consumes attendance revisions; active/selected member audiences retain their stronger current snapshot rules.
- [ ] **Step 6: Run GREEN and auth/notification regressions.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionParticipantSnapshotDbTest --tests com.readmates.session.api.HostSessionCloseMemberWriteRaceDbTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.auth.api.HostMemberApprovalControllerTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.notification.application.service.NotificationDispatchServiceTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.HostListEpochCoverageTest`

  Expected: PASS.

- [ ] **Step 7: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(server): snapshot meeting participants and serialize close`

---

### Task 4: Add UNKNOWN attendance and participant-level CAS

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/AttendanceController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/model/HostSessionCommands.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionAttendanceService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionAttendancePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionAttendanceWriteOperations.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionAuditAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostSessionAttendanceConcurrencyDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/application/HostListEpochCoverageTest.kt`

**Interfaces:**

```kotlin
enum class ActualAttendanceStatus { ATTENDED, ABSENT, UNKNOWN }
data class UpdateParticipantAttendanceCommand(
    val membershipId: UUID,
    val status: ActualAttendanceStatus,
    val expectedAttendanceRevision: Long,
)
data class BulkAttendanceCommand(
    val rows: List<UpdateParticipantAttendanceCommand>,
    val expectedParticipantSetRevision: Long,
)
```

- [ ] **Step 1: Write RED tests.** Cover every 3-state transition, same-participant conflict, different-participant parallel success, RSVP non-interference, UNKNOWN restore, bulk rollback on one stale/missing/inactive row, and a single same-transaction meeting-epoch increment whenever attendance contributes to the registered attention projection.
- [ ] **Step 2: Run RED.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionAttendanceConcurrencyDbTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.HostListEpochCoverageTest`

  Expected: FAIL because the controller only accepts two values and writes lack attendance revision.

- [ ] **Step 3: Implement single-row CAS, bulk preflight, and registered epoch bump.** Bulk locks rows in stable membership-UUID order, validates every expected revision and current row hash first, writes every row, audit, and at most one meeting-epoch increment in one transaction, or writes none. Attendance history bulk undo uses this exact path.
- [ ] **Step 4: Preserve RSVP and restore semantics.** Attendance mutation never changes RSVP; history restore may return actual attendance to UNKNOWN without rewriting response data.
- [ ] **Step 5: Run GREEN.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionAttendanceConcurrencyDbTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.service.HostSessionServicesTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.HostListEpochCoverageTest`

  Expected: PASS.

- [ ] **Step 6: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(server): make actual attendance revision safe`

---

### Task 5: Add the HMAC idempotency and immutable receipt substrate

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V53__host_mutation_idempotency_receipts.sql`
- Create: `server/src/main/kotlin/com/readmates/shared/security/RequestIdentityHmac.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/mutation/application/model/MutationIdempotencyModels.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/mutation/application/port/out/MutationIdempotencyPort.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/mutation/adapter/out/persistence/JdbcMutationIdempotencyAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/mutation/application/service/MutationIdempotencyService.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/mutation/config/MutationIdempotencyProperties.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/mutation/adapter/in/scheduling/MutationIdempotencyPurgeScheduler.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/model/HostMutationReceiptModels.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostMutationReceiptPort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostMutationReceiptAdapter.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `.env.example`
- Create: `server/src/test/kotlin/com/readmates/shared/mutation/application/service/MutationCanonicalizationTest.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/mutation/adapter/out/persistence/JdbcMutationIdempotencyAdapterDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

**Interfaces:**

```kotlin
data class MutationIdentity(
    val clubId: UUID,
    val actorMembershipId: UUID,
    val operation: String,
    val resourceSlot: String,
    val idempotencyKey: String,
)
data class CanonicalRequestDigest(
    val canonicalSchemaVersion: Int,
    val digestKeyVersion: Int,
    val hmac: ByteArray,
)
enum class NotificationDecision { NOT_SENT, DISPATCH_REFERENCED }
```

V53 uses one neutral bounded operational table for in-progress/completed key ownership. Each feature keeps its own immutable receipt table/binding; notification retains its existing dispatch receipt and never imports session types. Uniqueness is `(club_id, actor_membership_id, operation, resource_slot, idempotency_key)`.

- [ ] **Step 1: Write RED canonicalization tests.** Cover NFC-equivalent text, emoji/combining characters, null versus omitted/default, ordered arrays, set-valued sorted collections, schema-version change, same/different payload, and malformed keys.
- [ ] **Step 2: Write RED persistence/security tests.** Cover concurrent claim, replay, different payload `409 IDEMPOTENCY_KEY_REUSED`, in-progress recovery, key rotation, referenced-key retirement, 24-hour purge boundary, and forbidden raw values in table/log/DTO.
- [ ] **Step 3: Run RED.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.mutation.application.service.MutationCanonicalizationTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.shared.mutation.adapter.out.persistence.JdbcMutationIdempotencyAdapterDbTest`

  Expected: FAIL because V53 and substrate types do not exist.

- [ ] **Step 4: Implement canonical schemas per operation.** DTO validation/default application precedes canonicalization. Never serialize arbitrary maps with incidental field order.
- [ ] **Step 5: Implement HMAC/key-version configuration and retirement guard.** Fail application startup or retirement operation safely when active and previous key configuration cannot replay referenced rows.
- [ ] **Step 6: Implement bounded purge and low-cardinality metrics.** Purge operational rows only; immutable receipts are untouched and retain redacted UUID snapshots without a destructive resource FK.
- [ ] **Step 7: Run GREEN and migration tests.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.mutation.application.service.MutationCanonicalizationTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.shared.mutation.adapter.out.persistence.JdbcMutationIdempotencyAdapterDbTest --tests com.readmates.support.MySqlFlywayMigrationTest`

  Expected: PASS.

- [ ] **Step 8: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(server): add secure host mutation receipts`

---

### Task 6: Adopt receipts across session mutations and add reconciliation

**Files:**
- Modify: session controllers and application services changed in Tasks 2 and 4
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionRecoveryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionRecoveryController.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyService.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/SessionRecordStorePort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/in/HostMutationReconciliationUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/service/HostMutationReconciliationService.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostMutationReconciliationController.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostSessionIdempotencyDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt`
- Modify: manual notification confirm integration tests only to prove the feature-owned contract remains at least as strong; do not import session receipt types

**Interfaces:**

```kotlin
data class HostMutationEnvelope<TCommand, TExpected : Any>(
    val idempotencyKey: String,
    val expected: TExpected,
    val command: TCommand,
)
data class HostMutationReceiptResult(
    val receiptId: String,
    val operation: String,
    val resourceId: String,
    val resultingVersions: SessionVersionVector,
    val notificationDecision: NotificationDecision,
    val projection: HostProjectionSnapshot,
)
```

Web DTOs use exact per-operation expected types rather than nullable or partial `SessionVersionVector`: session-only, participant attendance rows, close vector plus attendance snapshot identity, exposure-only, publication-only, publish vector, and correction-publish vector. Unknown/missing/extra revision fields fail request validation before service invocation.

Adoption scope for the new session receipt is create, basic save, single/bulk attendance, access/publication setting, open/close/reverse, record apply/correction publish, and trash/restore. Record apply keeps its feature-owned receipt and binds the neutral operational key to that receipt. Notification confirm remains notification-owned; focused tests prove its preview/content/target/duplicate/resend and response-loss reconciliation satisfy the approved behavior without a session dependency.

- [ ] **Step 1: Write RED envelope/duplicate/response-loss tests.** For every scope operation reject missing/extra/wrong-domain expected revisions before service invocation; assert same key/request returns the same receipt and one side effect/audit; different request returns `409`; create produces one session plus one `session_publication_versions` row without fabricating public content after lost response; hard-deleting an expired session preserves redacted immutable receipt bytes; unauthorized receipt lookup returns no sensitive detail.
- [ ] **Step 2: Run RED.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionIdempotencyDbTest`

  Expected: FAIL because the mutations do not share the envelope/receipt contract.

- [ ] **Step 3: Wrap each application transaction with idempotency claim and completion.** Completion and immutable receipt write occur in the same transaction as the domain mutation. A rolled-back domain mutation cannot leave a completed receipt.
- [ ] **Step 4: Add authority-checked reconciliation read.** Return committed receipt and current authoritative state, a typed `NOT_EXECUTED`, or bounded `PENDING`; never invite a blind retry.
- [ ] **Step 5: Bridge feature-owned receipts without dependency cycles.** Record/sessionrecord and notification use the neutral mutation identity primitive but retain their own immutable result binding and stronger identifiers. Add negative architecture assertions that forbid `session→publication`, `sessionrecord→publication`, and `notification→session`; `shared/mutation` and Task 2's `shared/listing` stay within the existing shared boundary and do not justify a feature-dependency baseline row.
- [ ] **Step 6: Run GREEN and focused regressions.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionIdempotencyDbTest --tests com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.notification.application.service.NotificationDispatchServiceTest`

  Expected: PASS.

- [ ] **Step 7: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(server): reconcile host meeting mutations`

---

### Task 7: Make exposure, publication, and PUBLISHED correction atomic

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/PublicationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/HostSessionLifecycleController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionPublicationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionPublicationPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionPublicationWriteOperations.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyService.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/ReplaceSessionRecordContentPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordApplyStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Create: `server/src/test/kotlin/com/readmates/session/api/HostSessionExposurePublicationDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/application/HostListEpochCoverageTest.kt`

**Interfaces:**

```kotlin
data class PublicationVersionVector(
    val sessionRevision: Long,
    val liveRecordRevision: Long,
    val exposureRevision: Long,
    val publicationRevision: Long,
)
data class CorrectionPublicationVersionVector(
    val sessionRevision: Long,
    val recordDraftRevision: Long,
    val liveRecordRevision: Long,
    val exposureRevision: Long,
    val publicationRevision: Long,
)
```

Access-scope-only commands require `expectedExposureRevision`; public-site placement requires `expectedPublicationRevision`; a command changing both uses one transaction and both expected values. `수정본 게시` is one final commit that atomically replaces live record and all origin projections while retaining the old live version in immutable history.

- [ ] **Step 1: Write RED vector, projection, and record-list epoch tests.** Cover stale access/site dual-write with zero partial commit, lifecycle × access × placement matrix, concurrent first placement from the revision-0 `session_publication_versions` row where one wins/one conflicts, stale publish/correction preserving the old live revision, successful correction switching member/guest/public origin to the same new revision, and exactly one record-epoch increment for every registered readiness/live/publication input change.
- [ ] **Step 2: Run RED.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionExposurePublicationDbTest --tests com.readmates.publication.api.PublicControllerDbTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.HostListEpochCoverageTest`

  Expected: FAIL because expected exposure/publication vectors and atomic correction do not exist.

- [ ] **Step 3: Add preview snapshot identity and conditional dual-write.** Preview returns the exact vector and audience projections required by confirm. Confirm rejects any changed component before writing.
- [ ] **Step 4: Implement atomic correction publish and record-epoch bump.** Keep current reader record unchanged until commit; within one application-service transaction persist new live revision, immutable old history, publication/exposure result, sessionrecord-owned immutable mutation receipt, and at most one registered record-epoch increment.
- [ ] **Step 5: Preserve V45 dual-write compatibility.** Do not remove compatibility columns or change public canonical URLs/SEO metadata.
- [ ] **Step 6: Run GREEN, architecture, and full server gates.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.session.api.HostSessionExposurePublicationDbTest --tests com.readmates.publication.api.PublicControllerDbTest`

  Run: `./server/gradlew -p server unitTest --tests com.readmates.session.application.HostListEpochCoverageTest`

  Run: `./scripts/server-ci-check.sh`

  Expected: PASS.

- [ ] **Step 7: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(server): publish meeting projections atomically`

Task 7 proves origin atomicity only. It is not independently releasable as complete public-effect behavior; public-convergence Task 1 must add generation, BFF/cache denial, immutable convergence linkage, and browser boundary evidence before any public-effect acceptance row passes.

---

### Task 8: Migrate browser-visible server copy and future templates

**Files:**
- Create: `server/config/copy/canonical-meeting-language-allowlist.txt`
- Create: `server/src/test/kotlin/com/readmates/copy/CanonicalMeetingLanguageInventoryTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/in/web/SessionApplicationErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/in/web/SessionRecordErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/web/NotificationErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationEmailTemplates.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
- Modify: focused error-handler and notification template tests

**Interfaces:**
- Error codes and technical field names remain stable; browser-visible Korean detail uses canonical `모임`, `모임 기록`, and purpose-specific publication wording.
- New email/in-app render uses `No.N` or `N번째 모임`; persisted historical notification rows are not rewritten.
- AI/import parser markers and `N차` document headings remain compatibility exceptions.

- [ ] **Step 1: Write RED exact-copy and executable inventory tests.** Cover session/record errors and every future notification template/event type. Assert no lifecycle label implies access scope or public placement. The allowlist accepts only owned technical identifiers, parser/storage compatibility markers, and immutable historical-data handlers with a removal condition.
- [ ] **Step 2: Run RED.**

  Run: `./server/gradlew -p server unitTest --tests '*ErrorHandlerTest' --tests '*NotificationEmailTemplate*' --tests com.readmates.notification.application.service.NotificationDispatchServiceTest --tests com.readmates.copy.CanonicalMeetingLanguageInventoryTest`

  Expected: FAIL on legacy user-facing `세션/회차` copy.

- [ ] **Step 3: Migrate only generated/browser-visible copy.** Preserve codes, internal identifiers, saved notification rows, user titles, filenames, import markers, and diagnostic technical language.
- [ ] **Step 4: Run GREEN and inventory.**

  Run: `./server/gradlew -p server unitTest --tests '*ErrorHandlerTest' --tests '*NotificationEmailTemplate*' --tests com.readmates.notification.application.service.NotificationDispatchServiceTest --tests com.readmates.copy.CanonicalMeetingLanguageInventoryTest`

  Expected: PASS; every remaining hit is internal/diagnostic, parser/storage compatibility, or historical-data handling and is documented in the version-controlled allowlist.

- [ ] **Step 5: Check and commit.**

  Run: `git diff --check`

  Commit: `refactor(server): use canonical meeting language`

## Workstream Completion Gate

- [ ] Run `./scripts/server-ci-check.sh`.
- [ ] Run `./server/gradlew -p server integrationTest`.
- [ ] Run `./server/gradlew -p server architectureTest --tests com.readmates.architecture.ServerArchitectureBoundaryTest --tests com.readmates.architecture.ServerArchitectureInventoryTest`.
- [ ] Confirm negative architecture assertions reject `session→publication`, `sessionrecord→publication`, and `notification→session`; `shared/mutation`/`shared/listing` remain neutral shared boundaries and `feature-dependency-baseline.txt` is not changed to approve new feature edges.
- [ ] Confirm V52 then V53 upgrade from the previous schema and no historical migration checksum changes.
- [ ] Hard-delete an expired synthetic session/publication and prove operational rows are removed/expired while authorized immutable participant-audit and receipt bytes remain through redacted UUID snapshots.
- [ ] Scan `rg -n '(meetingUrl|meetingPasscode|canonicalPayload|idempotencyKey)' server/src/main server/src/test` and manually verify every storage/log/DTO occurrence is redacted, HMAC-bound, or a synthetic test input.
- [ ] Run the canonical frontend+server copy inventories and verify every exception is technical or historical.
- [ ] Leave ADR-0023/0024/0025/0028 Proposed until frontend adoption, E2E, and active architecture evidence exist. ADR-0033 remains Accepted.
