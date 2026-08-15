# ReadMates Backend Quality Phase 2 — Large-Class Decomposition And Program Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Keep the ledger, task briefs, review packages, mutation evidence, and final execution report in the ignored workspace returned by that skill's `scripts/sdd-workspace`; none of those SDD artifacts is a tracked deliverable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the five approved high-change server responsibility clusters, retire their exact active Detekt identities without substitution, remove the targeted large-class suppressions, and close the Phase 0–2 backend-quality program with zero boundary debt, zero feature cycles, and zero temporary architecture exceptions while preserving all runtime and public contracts.

**Architecture:** Keep the existing feature-local ports and Spring bean identities stable while moving SQL, transaction, query, transition, policy, serialization, Redis key, and Lua execution responsibilities into narrowly named collaborators. Characterization tests pin behavior before each split. Compatibility façades use direct delegation only where existing consumers need the broad port; new collaborators do not create a second policy source or change transaction ownership.

**Tech Stack:** Kotlin 2.4, Java 25, Spring Boot 4, Spring JDBC, MySQL/Testcontainers, Redis/Testcontainers, Jackson, JUnit 5, AssertJ, ArchUnit 1.3.2, Detekt, ktlint, JaCoCo, Gradle 9.6.1, and repository public-release checks.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-08-09-readmates-backend-quality-hardening-design.md`, especially §§6.3, 7.2, and 9.4. Do not reopen approved Phase 0–2 decisions.
- Execute from branch `codex/backend-quality-hardening-phase-0-2` at exact clean plan base `aa36b83dda81c2af877f17d8a849a613c1c97e30` or a descendant containing only this tracked plan commit. Record the actual implementation base before Task 1.
- Current architecture truth at the plan base is boundary `0 current + 39 retired = 39 approved`, feature dependency `37 current + 4 retired = 41 approved`, and `cyclicFeatureComponents(actual) == emptySet()`. Every task must preserve those values.
- Current static-analysis truth is Detekt `461 current + 0 retired = 461 approved` and ktlint `171 current + 0 retired = 171 approved`. The exact task arithmetic below ends at Detekt `437 current + 24 retired = 461 approved`; ktlint remains `171 + 0 = 171` unless an already approved identity disappears incidentally and is explicitly planned before product editing.
- Never regenerate either baseline. Never add or broaden a suppression, Detekt/ktlint configuration exception, approved seed, architecture allowlist, or excluded source set. Remove exact current identities from `baseline.xml`, append the identical normalized identity from the approved seed to the retired ledger, and prove the set partition in the same task commit.
- The existing method-local `@Suppress("LongParameterList")` on `saveResultIfStatus` moves unchanged with that exact method into `AiGenerationJobTransitionPort`; it is not a large-class exception and must not be copied to any other declaration.
- A class-level suppression that prevented an identity from entering the approved seed has no valid tombstone. Remove the suppression after decomposition, run Detekt without accepting a replacement identity, and leave approved/retired arithmetic unchanged.
- Preserve every REST route, request/response JSON field and enum spelling, HTTP status/error code, authorization outcome, cursor key/sort tuple, transaction boundary, lock order, idempotency receipt, content revision, notification dedupe, Kafka topic/key/header/payload, Redis key name, TTL, hash field, sorted-set member/score, Lua body and key/argument order, DB query meaning, and after-commit effect.
- No frontend/BFF source, migration/schema, deploy configuration, runtime configuration, public contract, live provider, email, production data, tag, push, PR, or deployment action is in scope for this plan.
- Do not introduce a generic repository, generic transaction runner, shared dumping-ground helper, or wrapper that merely moves private methods. Each new unit must own one approved responsibility boundary: a use case, transaction, external system, command/query split, or policy-versus-SQL/serialization split.
- Keep Spring transaction ownership explicit. `JdbcManualNotificationDispatchAdapter.confirmManualDispatch` remains the outer manual-dispatch transaction. `AdminNotificationReplayService.preview` and `confirm` remain outer replay transactions. Existing service/adapter transactions in host session, AI, and session record flows are not moved or widened.
- Run Gradle and Testcontainers commands sequentially in the shared worktree. Do not overlap heavy lanes or reuse a passing result from an earlier HEAD as final evidence.
- Each task has an exact tracked-file allowlist. Before commit, compare `git diff --cached --name-only` with that allowlist, obtain a fresh independent review, fix findings through the originating task, rerun focused evidence, and use the exact commit subject below.
- Keep tracked and ignored artifacts public-safe: no local absolute path, secret, private domain, real member data, cookie, token, provider payload, deployment identifier, or production state.
- Selected acceptance-matrix rows are persistence/migration and async/cache/provider. Persistence is selected because four tasks move JDBC ownership and must preserve query/transaction behavior; async/cache/provider is selected because manual delivery and Redis AI state have duplicate/recovery/unavailable semantics. Actor/authorization, session lifecycle, and cursor rows are adjacent evidence only where Task 2 or existing characterizations exercise them. Guest/public, BFF/OAuth, frontend, and UI rows are excluded because this plan changes no public exposure, proxy, route, or UI contract.

## Source Audit And YAGNI Ruling

| Approved responsibility | Plan-base source | Current split signal | Planned responsibility boundary | Deliberately not changed |
| --- | --- | --- | --- | --- |
| Manual notification persistence/claim/transition | `JdbcManualNotificationDispatchAdapter.kt`, 1,139 lines | reads, audience projection, preview locking, confirm transition, outbox insert, row mapping; 12 active production identities | read queries, audience queries, preview store, atomic confirm store, row/cursor mapping behind the existing port façade | port/API model, event payload, table/schema, host service |
| Host session command/query/policy | `HostSessionWriteOperations.kt`, 714 lines | create/update, attendance, exposure, lifecycle, locks, parsing/default policy; `LargeClass` suppression plus 9 active identities | draft, attendance, publication, lifecycle commands; lock/query helper; pure input/exposure policy | outbound port set, controller/API, state machine, SQL predicates |
| Platform-admin notification operations | `AdminNotificationOperationsService.kt`, 351 lines; JDBC read/replay adapters already separate | read delegation, replay transaction, policy validation, JSON serialization in one file; 1 active identity | read façade, transactional replay service, pure replay policy, output codec + Jackson adapter | replay DB adapter, V48 schema, REST contract, role meaning |
| Redis AI generation job state/scripts | `RedisAiGenerationJobStore.kt`, 1,232 lines | payload/hash, status, commit lease, recovery/index/probe, key generation; two suppressions; 2 active identities across adapter/port | capability ports, keyspace/context, payload, transition, commit, recovery/index delegates behind one existing bean | Lua script bytes, Redis keys/TTL/index semantics, consumer bean name |
| Session record persistence after codec/sort ownership | `JdbcSessionRecordAdapter.kt`, 612 lines; `SessionRecordStorePort.kt` | apply receipt/live/draft/revision SQL and row assembly; two `TooManyFunctions` suppressions not in approved seed | read, apply-write, draft-write capability ports and JDBC delegates with one row assembler | codec/sort/visibility already owned elsewhere, apply transaction, DB/API |

This is the final approved large-class wave, not an attempt to eliminate all 461 legacy Detekt identities. Test-only large classes and non-target production debt remain visible in the current baseline and are documented in Task 6 rather than being relabeled as Phase 2 architecture exceptions.

## Detekt Retirement Ledger

| Point | Current | Retired | Approved | Exact retirements |
| --- | ---: | ---: | ---: | ---: |
| Start | 461 | 0 | 461 | 0 |
| After Task 1 | 449 | 12 | 461 | 12 manual-dispatch identities |
| After Task 2 | 440 | 21 | 461 | 9 host-session identities |
| After Task 3 | 439 | 22 | 461 | 1 admin-replay identity |
| After Task 4 | 437 | 24 | 461 | 2 AI store/port identities |
| After Task 5 | 437 | 24 | 461 | no seed identity; remove two hidden suppressions |

`server/config/detekt/phase-0-approved-identities.txt` never changes. `server/config/ktlint/*` never changes in this plan. A new identity with the same count is a failure, not a replacement.

## File Structure And Interfaces

### Manual notification persistence

- `ManualNotificationDispatchReadQueries.kt` owns session context, member/dispatch pagination, recent dispatches, masking, cursor decode, and row mapping.
- `ManualNotificationAudienceQueries.kt` owns same-club active membership and per-channel eligibility reads.
- `ManualNotificationPreviewStore.kt` owns preview insert/read/lock data.
- `ManualNotificationConfirmStore.kt` owns the atomic confirm decision, audience revalidation, outbox/manual-dispatch insert, receipt lookup, and preview consume.
- `JdbcManualNotificationDispatchAdapter.kt` remains the only `ManualNotificationDispatchPort` bean and delegates. Its confirm method remains `@Transactional(rollbackFor = [Exception::class])`.

### Host session writes

```kotlin
internal data class NormalizedHostSessionWrite(
    val sessionDate: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val questionDeadlineAt: LocalDateTime,
    val bookLink: String?,
    val bookImageUrl: String?,
    val locationLabel: String,
    val meetingUrl: String?,
    val meetingPasscode: String?,
)

internal object HostSessionWritePolicy {
    fun normalizeCreate(request: HostSessionCommand): NormalizedHostSessionWrite
    fun normalizeUpdate(
        request: HostSessionCommand,
        existing: ExistingHostSessionSchedule,
    ): NormalizedHostSessionWrite
    fun membershipId(raw: String): UUID
    fun compatibility(exposure: SessionExposure, state: String): CompatibilityExposure
}
```

`HostSessionDraftWriteOperations`, `HostSessionAttendanceWriteOperations`, `HostSessionPublicationWriteOperations`, and `HostSessionLifecycleWriteOperations` consume `JdbcTemplate`, `HostSessionWriteQueries`, and `HostSessionWritePolicy` as required. `HostSessionWriteQueries` owns `FOR UPDATE`, state, schedule, exposure, club lock, and active-membership reads. `JdbcHostSessionWriteAdapter` keeps all existing outbound port interfaces and delegates directly; `HostSessionWriteOperations.kt` is deleted.

### Platform-admin notification replay

```kotlin
interface AdminNotificationJsonCodec {
    fun filterJson(filter: AdminNotificationFilter): String
    fun metadataJson(
        previewId: UUID,
        clubId: UUID?,
        selectionHash: String,
        reason: String,
        replayedCount: Int,
        skippedCount: Int,
    ): String
}

@Service
class AdminNotificationReplayService(
    private val replayPort: AdminNotificationReplayPort,
    private val auditPort: AdminNotificationAuditPort,
    private val jsonCodec: AdminNotificationJsonCodec,
    private val replayProperties: AdminNotificationReplayProperties,
    private val clock: Clock,
) {
    @Transactional(rollbackFor = [Exception::class])
    fun preview(admin: CurrentPlatformAdmin, request: AdminNotificationReplayPreviewRequest): AdminNotificationReplayPreview

    @Transactional(rollbackFor = [Exception::class])
    fun confirm(admin: CurrentPlatformAdmin, command: AdminNotificationReplayConfirmCommand): AdminNotificationReplayConfirmResult
}
```

`AdminNotificationReplayPolicy` owns role, reason, actor/hash/version/expiry/receipt validation with application errors unchanged. `AdminNotificationOperationsService` remains the single `ManageAdminNotificationOperationsUseCase` bean and delegates read calls to `AdminNotificationOperationsReadPort` and replay calls to `AdminNotificationReplayService`. `JacksonAdminNotificationJsonCodec` moves to `notification.adapter.out.codec` and is the only Jackson-aware implementation.

### AI Redis job capabilities

```kotlin
interface AiGenerationJobReadWritePort {
    fun save(job: JobRecord)
    fun load(jobId: UUID): JobRecord?
    fun loadMetadata(jobId: UUID): JobRecord? = load(jobId)
    fun findJobById(jobId: UUID): JobRecord? = loadMetadata(jobId)
    fun loadRecentForSession(sessionId: UUID, limit: Int = 20): AiGenerationJobListResult
    fun loadActiveJobs(limit: Int = 100): AiGenerationJobListResult
    fun loadCommitRecoveryJobs(limit: Int = 50): AiGenerationJobListResult =
        when (val activeJobs = loadActiveJobs(limit)) {
            is AiGenerationJobListResult.Available ->
                AiGenerationJobListResult.Available(
                    activeJobs.records.filter {
                        it.status == JobStatus.COMMITTING || it.status == JobStatus.COMMIT_RETRY
                    },
                )
            is AiGenerationJobListResult.Unavailable ->
                AiGenerationJobListResult.Unavailable(
                    AiGenerationJobListOperation.COMMIT_RECOVERY,
                    activeJobs.reason,
                )
        }
    fun delete(jobId: UUID)
}

interface AiGenerationJobTransitionPort {
    fun updateStatus(jobId: UUID, status: JobStatus, stage: JobStage?, progressPct: Int, error: GenerationError?)
    fun transitionStatus(
        jobId: UUID,
        expected: Set<JobStatus>,
        next: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
        groundingStatus: GroundingStatus? = null,
    ): Boolean
    @Suppress("LongParameterList")
    fun saveResultIfStatus(
        jobId: UUID,
        expected: JobStatus,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
        actualModel: ModelId? = null,
    ): Boolean
    fun saveGroundedResult(command: SaveGroundedResultCommand): Boolean
}

interface AiGenerationCommitStatePort {
    fun acquireCommitLease(jobId: UUID, expectedRevision: Long, now: Instant, leaseDuration: Duration): CommitLeaseResult
    fun recoverExpiredCommitLease(jobId: UUID, now: Instant): Boolean
    fun releaseCommitLeaseForRetry(jobId: UUID, revision: Long): Boolean = false
    fun markCommittedForCleanup(jobId: UUID, revision: Long): Boolean
    fun markCleanupComplete(jobId: UUID, revision: Long): Boolean
    fun deleteTransientPayload(jobId: UUID)
}

interface AiGenerationJobStore :
    AiGenerationJobReadWritePort,
    AiGenerationJobTransitionPort,
    AiGenerationCommitStatePort
```

`RedisAiGenerationJobStore` remains the conditional Spring bean and delegates those three capability ports plus `AiGenerationFailureRecoveryPort` and `ActiveAiGenerationJobProbe` to focused Redis collaborators. `AiGenerationRedisKeyspace` is the single owner of all existing key strings. `AiGenerationRedisContext` shares `StringRedisTemplate`, properties, clock, metrics, codec, indexes, and keyspace without service-locator behavior. Existing production consumers may continue to inject `AiGenerationJobStore`; changing every consumer constructor is outside this YAGNI split.

### Session-record persistence capabilities

```kotlin
interface SessionRecordReadStorePort {
    fun loadLive(host: AuthenticatedClubActor, sessionId: UUID, forUpdate: Boolean = false): LiveSessionRecord?
    fun loadDraft(host: AuthenticatedClubActor, sessionId: UUID, forUpdate: Boolean = false): SessionRecordDraft?
    fun loadRevision(host: AuthenticatedClubActor, sessionId: UUID, revisionId: UUID): SessionRecordRevision?
}

interface SessionRecordApplyStorePort {
    fun lockEditor(host: AuthenticatedClubActor, sessionId: UUID): SessionRecordEditor?
    fun findCompletedApply(host: AuthenticatedClubActor, previewId: UUID): CompletedSessionRecordApply?
    fun findApplyReceipt(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        applyRequestId: UUID,
        forUpdate: Boolean = false,
    ): SessionRecordApplyReceipt? = null
    fun insertApplyReceipt(
        host: AuthenticatedClubActor,
        command: ApplySessionRecordCommand,
        draftSha256: String,
        composerEventType: NotificationEventType,
        revision: SessionRecordRevision,
    ): SessionRecordApplyReceipt
    fun insertBaselineIfAbsent(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        encoded: EncodedSessionRecordSnapshot,
    )
    fun insertAppliedRevision(
        host: AuthenticatedClubActor,
        editor: SessionRecordEditor,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordRevision
    fun deleteAppliedDraft(host: AuthenticatedClubActor, sessionId: UUID, expectedDraftRevision: Long): Boolean
}

interface SessionRecordDraftStorePort {
    fun insertDraft(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        command: SaveSessionRecordDraftCommand,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft
    fun compareAndSetDraft(
        host: AuthenticatedClubActor,
        command: SaveSessionRecordDraftCommand,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft?
    fun rebaseDraft(host: AuthenticatedClubActor, live: LiveSessionRecord, expectedDraftRevision: Long): SessionRecordDraft?
    fun deleteDraft(host: AuthenticatedClubActor, sessionId: UUID, expectedDraftRevision: Long): Boolean
    fun insertRestoredDraft(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        revision: SessionRecordRevision,
        expectedDraftRevision: Long?,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft?
}

interface SessionRecordStorePort :
    SessionRecordReadStorePort,
    SessionRecordApplyStorePort,
    SessionRecordDraftStorePort
```

`JdbcSessionRecordAdapter` remains the Spring bean and delegates to `JdbcSessionRecordReadStore`, `JdbcSessionRecordApplyStore`, and `JdbcSessionRecordDraftStore`. `SessionRecordPersistenceRows` owns only SQL row assembly for live entries, feedback, drafts, and revisions. Existing application services and fakes remain source-compatible through the composite interface.

---

### Task 1: Decompose Manual Notification Persistence, Preview Claim, And Confirm Transition

**Exact allowlist:**

- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt`
- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationDispatchReadQueries.kt`
- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationAudienceQueries.kt`
- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationPreviewStore.kt`
- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationConfirmStore.kt`
- `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/ManualNotificationDispatchRows.kt`
- `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapterTest.kt`
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- `server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt`
- `server/config/detekt/baseline.xml`
- `server/config/detekt/phase-0-retired-identities.txt`

**Produces:** The existing `ManualNotificationDispatchPort` bean and signatures, now delegated to the five focused persistence units above. No later task consumes a private Task 1 collaborator.

**Exact retired identities (12):**

```text
LargeClass:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter : ManualNotificationDispatchPort
LongMethod:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter$@Transactional override fun confirmManualDispatch: ManualNotificationConfirmedDispatch?
LongMethod:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter$override fun listDispatches: ManualNotificationDispatchList
LongMethod:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter$override fun listMembers: CursorPage<ManualNotificationMemberOption>
MaxLineLength:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter$@param:Value("\${readmates.notifications.kafka.events-topic:readmates.notification.events.v1}") private val eventsTopic: String
MaxLineLength:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter$emailMissingCount = if (selection.requestedChannels != ManualNotificationRequestedChannels.IN_APP) eligibility.missing else 0
MaxLineLength:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter$val inAppIds = if (selection.requestedChannels != ManualNotificationRequestedChannels.EMAIL) finalIds else emptyList()
ReturnCount:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter$@Transactional override fun confirmManualDispatch: ManualNotificationConfirmedDispatch?
ReturnCount:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter$private fun maskEmail: String
ReturnCount:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter.ManualDispatchCursor.Companion$fun from: ManualDispatchCursor?
ReturnCount:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter.ManualMemberCursor.Companion$fun from: ManualMemberCursor?
TooManyFunctions:JdbcManualNotificationDispatchAdapter.kt:JdbcManualNotificationDispatchAdapter : ManualNotificationDispatchPort
```

- [ ] **Step 1: Pin characterization and source ownership before moving code.** Strengthen the existing DB test to assert byte-stable selection/target hashes, member/dispatch cursor continuation without duplicate IDs, masked email output, EMAIL/IN_APP eligibility, preview row lock, unchanged revision recheck, host/audience lock order, one outbox/manual-dispatch pair, preview consume-once, and retry returning the stored receipt. Add a source rule requiring the façade to contain no SQL literal and requiring each new collaborator to stay in notification persistence and depend on application ports/models only.
- [ ] **Step 2: Run RED.** The source rule must fail while SQL and helpers remain in the façade.

  ```bash
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerQualityRatchetTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Extract responsibility units without changing the transaction.** Move read SQL/mapping/cursors, audience eligibility, preview persistence, confirm transition, and row mapping to the named files. Keep `confirmManualDispatch` on the façade with the exact transaction annotation and a single delegate call. Preserve club/session/preview `FOR UPDATE` order, event topic injection, SQL text/predicates, UTC timestamps, UUID generation points, and all rejection precedence.
- [ ] **Step 4: Retire the 12 exact identities atomically.** Delete only those IDs from `baseline.xml`, append the normalized strings above to the retired file, and assert `449 current + 12 retired = 461 approved`; approved seed and ktlint files are byte-identical.
- [ ] **Step 5: Execute load-bearing mutations.** Remove the preview `FOR UPDATE` and confirm-concurrency must fail; bypass content revision recheck and the stale-revision test must fail; include EMAIL-ineligible members and channel counts/hash must fail; return raw email and masking must fail; skip preview consumption and retry/duplicate assertions must fail. Restore each mutation and rerun the exact selector.
- [ ] **Step 6: Run GREEN, review, and commit.** Run Step 2 plus Detekt and main-source ktlint. Reviewer checks lock order, transaction ownership, SQL/result parity, no new identity, and `449/12/461`. Commit:

  ```bash
  git commit -m "refactor(server): decompose manual notification persistence"
  ```

  Correction subject: `fix(server): correct manual notification decomposition review`.

### Task 2: Split Host Session Commands, Queries, And Policy

**Exact allowlist:**

- Delete: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWriteOperations.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionDraftWriteOperations.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionAttendanceWriteOperations.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionPublicationWriteOperations.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionLifecycleWriteOperations.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWriteQueries.kt`
- Create: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWritePolicy.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt`
- Modify: `server/config/detekt/baseline.xml`
- Modify: `server/config/detekt/phase-0-retired-identities.txt`

**Consumes:** Existing `HostSessionQueries`, `JdbcTemplate`, application commands/responses/errors, and session/sessionrecord domain types. **Produces:** The exact current `JdbcHostSessionWriteAdapter` bean implementing the same six output ports; the pure `HostSessionWritePolicy` signatures defined above.

**Exact retired identities (9):**

```text
LongMethod:HostSessionWriteOperations.kt:HostSessionWriteOperations$fun createDraftSession: CreatedSessionResponse
LongMethod:HostSessionWriteOperations.kt:HostSessionWriteOperations$fun updateHostSession: HostSessionDetailResponse
MagicNumber:HostSessionWriteOperations.kt:HostSessionWriteOperations$23
MagicNumber:HostSessionWriteOperations.kt:HostSessionWriteOperations$59
MagicNumber:HostSessionWriteOperations.kt:HostSessionWriteOperations$9
MagicNumber:HostSessionWriteOperations.kt:HostSessionWriteOperations.<no name provided>$3
MagicNumber:HostSessionWriteOperations.kt:HostSessionWriteOperations.<no name provided>$4
ThrowsCount:HostSessionWriteOperations.kt:HostSessionWriteOperations$fun open: HostSessionTransitionResult
TooManyFunctions:HostSessionWriteOperations.kt:HostSessionWriteOperations
```

- [ ] **Step 1: Pin schedule, exposure, attendance, and lifecycle behavior.** Add or strengthen DB assertions for defaults `20:00/22:00`, deadline previous day `23:59 +09:00` converted to UTC, blank/null patch semantics, `end > start`, same-club locks, active participant creation, DRAFT→OPEN→CLOSED→PUBLISHED guards/idempotency, one-open-session uniqueness, compatibility dual-write, and publication eligibility predicates. Add source rules that policy imports no JDBC/Spring, command units own no read-result mapping, and the deleted class name has zero production/test consumers.
- [ ] **Step 2: Run RED.** Source rules must fail on the combined class and missing policy units.

  ```bash
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.session.api.HostSessionControllerDbTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerQualityRatchetTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Implement the command/query/policy split.** Move parsing/default/exposure decisions to `HostSessionWritePolicy`; move locks and state/schedule/exposure/active-member reads to `HostSessionWriteQueries`; move create/update, attendance, publication/visibility, and lifecycle SQL to their respective command units. Keep `JdbcHostSessionWriteAdapter` transaction participation, outbound interfaces, return values, SQL predicates, audit call sites, and `HostSessionQueries` use unchanged.
- [ ] **Step 4: Retire exact identities and hidden suppression.** Remove the nine IDs from current baseline, append them to retired, delete `@Suppress("LargeClass")` with the old file, and assert `440 current + 21 retired = 461 approved`. No new class may use `LargeClass`, `TooManyFunctions`, `LongMethod`, `ThrowsCount`, or MagicNumber suppression.
- [ ] **Step 5: Execute load-bearing mutations.** Change default start time, accept equal end time, remove club lock, let OPEN reopen as changed, omit active participants, loosen publish `GUEST_READABLE`/summary predicate, and map public exposure to MEMBER; each corresponding DB assertion must fail independently. Restore and rerun.
- [ ] **Step 6: Run GREEN, review, and commit.** Run Step 2, Detekt, and main-source ktlint. Reviewer checks command/query direction, pure policy, lock/state semantics, no façade growth, identity partition, and public exposure parity. Commit:

  ```bash
  git commit -m "refactor(server): decompose host session writes"
  ```

  Correction subject: `fix(server): correct host session write review`.

### Task 3: Separate Platform-Admin Notification Read, Replay, Policy, And JSON Boundaries

**Exact allowlist:**

- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationReplayService.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationReplayPolicy.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/AdminNotificationJsonCodec.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/out/codec/JacksonAdminNotificationJsonCodec.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/service/AdminNotificationReplayServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/api/AdminNotificationReplayTransactionIntegrationTest.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/adapter/out/codec/JacksonAdminNotificationJsonCodecTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt`
- Modify: `server/config/detekt/baseline.xml`
- Modify: `server/config/detekt/phase-0-retired-identities.txt`

**Consumes/produces:** Produces the exact `AdminNotificationJsonCodec` and `AdminNotificationReplayService` interfaces shown above. `AdminNotificationOperationsService` continues to produce the one `ManageAdminNotificationOperationsUseCase` bean consumed by the controller/admin signal provider.

**Exact retired identity (1):**

```text
ThrowsCount:AdminNotificationOperationsService.kt:AdminNotificationOperationsService$override fun confirmReplay: AdminNotificationReplayConfirmResult
```

- [ ] **Step 1: Pin read and replay characterization.** Keep read delegation tests separate from replay tests. Pin OWNER/OPERATOR allow, SUPPORT deny, trimmed reason/code-point/UTF-8 bounds, exact `maxTargets + 1` overflow check, canonical selection hash, contract version 2, actor/role/hash/expiry/receipt validation order, idempotent stored confirmation, audit metadata JSON keys, preview consume conflict, and rollback of reset/audit/receipt/consume on forced failure.
- [ ] **Step 2: Run RED.** Add source rules that application service files import no Jackson type, read façade has no transaction annotation, replay service owns both transaction annotations, and policy imports no Spring/JDBC/Jackson. These fail before extraction.

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.notification.application.service.AdminNotificationOperationsServiceTest \
    --tests com.readmates.notification.application.service.AdminNotificationReplayServiceTest \
    --tests com.readmates.notification.adapter.out.codec.JacksonAdminNotificationJsonCodecTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.notification.api.AdminNotificationReplayTransactionIntegrationTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerQualityRatchetTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Extract replay orchestration, pure policy, and codec adapter.** Preserve exception types/messages and validation order. Do not alter `AdminNotificationReplayPort`, JDBC adapter, SQL, V48, role enum, filter model, or HTTP mapping. The read façade delegates replay calls without adding a second transaction boundary.
- [ ] **Step 4: Retire the exact identity.** Move it from baseline to retired and assert `439 current + 22 retired = 461 approved`.
- [ ] **Step 5: Execute load-bearing mutations.** Remove one replay transaction annotation and forced-failure rollback must fail; allow SUPPORT and authorization tests fail; use `maxTargets` instead of `+1` and overflow test fails; change one metadata key and codec test fails; accept legacy contract v1 or expired preview and replay tests fail. Restore and rerun.
- [ ] **Step 6: Run GREEN, review, and commit.** Run Step 2, Detekt, main-source ktlint, and `git diff --check`. Reviewer checks single transaction, receipt idempotency, JSON byte/field parity, role/error parity, and `439/22/461`. Commit:

  ```bash
  git commit -m "refactor(server): decompose admin notification replay"
  ```

  Correction subject: `fix(server): correct admin notification replay review`.

### Task 4: Split Redis AI Job Capabilities, Keyspace, And Script Execution

**Exact allowlist:**

- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisContext.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisKeyspace.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationPayloadStore.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationTransitionStore.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationCommitStore.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationRecoveryStore.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationRecoveryIndex.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationConditionalLoadingTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreFailureTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationFailureRecoveryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGroundedAiGenerationJobStoreTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt`
- Modify: `server/config/detekt/baseline.xml`
- Modify: `server/config/detekt/phase-0-retired-identities.txt`

**Consumes/produces:** Produces the three capability ports and composite `AiGenerationJobStore` defined above. The conditional `RedisAiGenerationJobStore` bean still implements the composite plus `AiGenerationFailureRecoveryPort` and `ActiveAiGenerationJobProbe`. Existing scripts, record codec, indexes, service constructors, and fake composite remain consumers.

**Exact retired identities (2):**

```text
FunctionOnlyReturningConstant:RedisAiGenerationJobStore.kt:RedisAiGenerationJobStore$private fun activeJobsKey
TooManyFunctions:AiGenerationJobStore.kt:AiGenerationJobStore
```

- [ ] **Step 1: Pin key, payload, transition, lease, and recovery characterization.** Add an exact keyspace table test for hash/transcript/turns/result/evidence/provider-attempt/admission/index/repair keys. Pin hash field names, TTLs, payload separation, status/revision/progress/error transitions, exact Lua keys and arguments, commit lease results, cleanup, atomic delete, corrupt/missing classification, recovery disposition, index epoch/repair/quarantine, queue probe unavailable reasons, and metric operation tags. Pin the Spring bean condition and all five implemented port types.
- [ ] **Step 2: Run RED.** Add source rules requiring the façade to contain no Redis command or inline Lua, capability port methods to partition the old method set exactly once, key literals to exist only in keyspace/script files, and the composite port to declare no direct function. These rules fail before extraction.

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationConditionalLoadingTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStoreFailureTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationFailureRecoveryTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisGroundedAiGenerationJobStoreTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerQualityRatchetTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Split application capabilities and Redis delegates.** Move methods unchanged by responsibility. Keep script objects byte-identical and call the same script with the same key/argument order. Centralize only key construction and shared dependencies. Keep `loadMetadata` payload-free, `load` grounded-payload validation, existing default list limits/fallback behavior, time source, UUID generation points, metric names/tags, and conditional bean properties.
- [ ] **Step 4: Remove hidden suppressions and retire two identities.** Delete `@Suppress("LargeClass", "TooManyFunctions")`, move the two exact active IDs to retired, and assert `437 current + 24 retired = 461 approved`. No delegate or capability interface may require those suppressions or produce a new baseline identity.
- [ ] **Step 5: Execute load-bearing mutations.** Change one Redis key suffix, one transient TTL, one Lua key order, one status expected set, one lease revision argument, one recovery classification, and `Unavailable` to empty `Available`; the exact corresponding characterization must fail independently. Restore each mutation and rerun. Also compare the SHA-256 of `AiGenerationRedisScripts.kt` and `GroundedAiGenerationRedisScripts.kt` to the Task 4 base; both must be byte-identical.
- [ ] **Step 6: Run GREEN, review, and commit.** Run Step 2 plus all AI Redis unit/integration classes selected by `rg --files .../aigen/adapter/out/redis`, Detekt, main-source ktlint, and `git diff --check`. Reviewer checks one bean, exact port delegation, key/Lua/TTL parity, PII separation, failure semantics, and `437/24/461`. Commit:

  ```bash
  git commit -m "refactor(server): decompose AI Redis job store"
  ```

  Correction subject: `fix(server): correct AI Redis store review`.

### Task 5: Split Session-Record Read, Apply, Draft, And Row Assembly Persistence

**Exact allowlist:**

- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/application/port/out/SessionRecordStorePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordReadStore.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordApplyStore.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordDraftStore.kt`
- Create: `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/SessionRecordPersistenceRows.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordDraftServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/sessionimport/api/HostSessionImportControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerQualityRatchetTest.kt`

**Consumes/produces:** Produces the three capability interfaces and composite `SessionRecordStorePort` defined above. Existing application services, integration injection, and test fakes consume the unchanged composite interface. `JdbcSessionRecordAdapter` remains the single Spring bean.

**Exact retired identities:** None. Neither suppressed `TooManyFunctions` identity exists in the approved seed, so adding a tombstone would corrupt the partition. Detekt remains `437 current + 24 retired = 461 approved`.

- [ ] **Step 1: Pin read/apply/draft characterization.** Pin host/club scoping, `FOR UPDATE` flags, live snapshot entry and feedback assembly, receipt idempotency, baseline-if-absent, immutable applied revision, draft CAS/rebase/delete, restored draft revision, ordering, nullable payloads, and absent-row results. Add source rules that the composite port declares no direct methods, façade contains no SQL, each method belongs to exactly one capability, row assembly contains no writes, and snapshot codec/sort policy imports do not move back into persistence.
- [ ] **Step 2: Run RED.** Source rules fail on the combined port/adapter.

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.sessionrecord.application.service.SessionRecordApplyServiceTest \
    --tests com.readmates.sessionrecord.application.service.SessionRecordDraftServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.sessionrecord.adapter.out.persistence.JdbcSessionRecordAdapterTest \
    --tests com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest \
    --tests com.readmates.sessionimport.api.HostSessionImportControllerDbTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerQualityRatchetTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Split port capabilities and JDBC delegates.** Move methods exactly once and delegate from the composite bean. Keep SQL text, optimistic predicates, revision numbering, timestamps, UUID creation, row ordering, visibility, snapshot JSON/hash, and the outer `SessionRecordApplyService.apply` transaction unchanged. Do not make delegates Spring beans.
- [ ] **Step 4: Remove hidden suppressions without inventing identities.** Remove `@Suppress("TooManyFunctions")` from `SessionRecordStorePort` and `JdbcSessionRecordAdapter`. Prove the approved/current/retired files are byte-identical to the Task 5 base and Detekt creates no replacement issue.
- [ ] **Step 5: Execute load-bearing mutations.** Remove draft revision CAS predicate, change live entry ordering, overwrite an existing baseline, accept a mismatched apply receipt, omit feedback assembly, and make restored draft insert non-conditional; each focused assertion must fail independently. Restore and rerun.
- [ ] **Step 6: Run GREEN, review, and commit.** Run Step 2, Detekt, main-source ktlint, and `git diff --check`. Reviewer checks composite source compatibility, transaction participation, SQL/result parity, no codec/sort regression, suppression removal, and unchanged `437/24/461`. Commit:

  ```bash
  git commit -m "refactor(server): decompose session record persistence"
  ```

  Correction subject: `fix(server): correct session record persistence review`.

### Task 6: Document Phase 2 Completion And Run Canonical Whole-Program Gates

**Exact allowlist:**

- Modify: `docs/development/architecture.md`
- Modify: `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- Modify: `CHANGELOG.md`
- Create: `docs/reports/2026-08-15-backend-quality-phase-0-2-closeout.md`
- Create ignored only: `${SDD_WORKSPACE}/final-report.md`

**Produces:** Current architecture guidance, ADR rationale, Unreleased note, a dated public-safe release-readiness/program evidence snapshot, and the ignored execution report. It changes no product interface.

- [ ] **Step 1: Audit exact completion state before writing claims.** Record fresh counts and sets: boundary `0/39/39`, feature `37/4/41`, SCC empty, Detekt `437/24/461`, ktlint `171/0/171`, no target `LargeClass`/`TooManyFunctions` suppression, no new baseline/config exception, and no production consumer of deleted combined classes. If any value differs, stop the docs task and route the discrepancy to the originating task.
- [ ] **Step 2: Update active docs and CHANGELOG.** Replace the explicit “large-class closeout remains” wording with the exact responsibility split and completion criteria. State that Phase 2 is complete because boundary debt is zero, cycles are zero, temporary architecture exceptions are zero, five target responsibility clusters are decomposed, and exact target identities/suppressions are removed. Explicitly state that 437 current Detekt identities and 171 ktlint identities are non-target legacy static-analysis debt, not zero and not hidden.
- [ ] **Step 3: Write the dated closeout/release-readiness report.** Scope review to the real merge base and `origin/main..HEAD`; cover CHANGELOG/Unreleased, CI/deploy files, operator-visible behavior, security-code hygiene, architecture baselines/exceptions, public-release safety, skipped UI/E2E/live validation, and residual non-target debt. Distinguish repository/local evidence from live production evidence. Do not claim merge, push, release, or deployment.
- [ ] **Step 4: Review dirty docs and report before commit.** Run `git diff --check` and targeted public-safety scan over the four tracked docs. Obtain independent review of factual counts, source links, completion wording, and legacy-debt honesty. Commit only after approval:

  ```bash
  git commit -m "docs: close Phase 2 backend quality program"
  ```

  Correction subject: `fix(docs): correct backend quality closeout review`.

- [ ] **Step 5: Run canonical server and persistence gates at final HEAD.** Run sequentially:

  ```bash
  ./server/gradlew -p server compileKotlin --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest --rerun-tasks --no-build-cache --no-configuration-cache
  ./scripts/server-ci-check.sh
  ./server/gradlew -p server integrationTest --rerun-tasks --no-build-cache --no-configuration-cache
  git diff --check origin/main..HEAD
  ```

- [ ] **Step 6: Run public-candidate safety checks.** These prove repository packaging/public safety only; they do not deploy.

  ```bash
  ./scripts/build-public-release-candidate.sh
  ./scripts/public-release-check.sh .tmp/public-release-candidate
  ```

- [ ] **Step 7: Record explicit excluded validation.** Frontend lint/test/build and Playwright E2E are intentionally not run because no frontend/BFF/API/auth/user-flow contract changes. Live Redis/provider/email, production data, migration, deployment, tag, PR, and push are not run. If source review finds an actual contract change, this exclusion is invalid and the plan must be corrected before closeout.
- [ ] **Step 8: Perform fresh whole-branch release-readiness and whole-program review.** Review the entire branch against its real base, not only Task 6. Require verdicts for behavioral compatibility, architecture ownership, transaction/concurrency, Detekt partition/suppression removal, public safety, and Phase 0–2 requirement coverage. Resolve all Critical/Important/Material findings through the originating task and rerun affected focused plus canonical gates.
- [ ] **Step 9: Final exact audit and clean-state handoff.** Write `${SDD_WORKSPACE}/final-report.md` with every command/result, mutation failure/restoration, task commit, review verdict, skipped validation, and residual non-target debt. Confirm tracked clean state and report readiness for the controller's separate local-main integration and authorized push workflow; do not merge or push from this task.

## Final Acceptance Criteria

- Boundary ledger is exactly `0 current + 39 retired = 39 approved`.
- Feature ledger is exactly `37 current + 4 retired = 41 approved`, approved forward edges remain, and cyclic components are empty.
- Temporary architecture exceptions are zero: no current boundary debt row, no cycle exception, no non-empty persistence web/http exception set, and no new boundary allowlist/config exclusion.
- Detekt partition is exactly `437 current + 24 retired = 461 approved`; ktlint is `171 + 0 = 171`; there is no identity substitution, baseline regeneration, approved-seed growth, or configuration weakening.
- The five target responsibility clusters are decomposed by use case, transaction, external system, command/query, or policy-versus-SQL/serialization boundaries. `HostSessionWriteOperations.kt` is gone, the four target façades contain no moved SQL/Redis commands, and the target class-level `LargeClass`/`TooManyFunctions` suppressions are gone.
- Manual dispatch lock/claim/confirm, host session state/exposure, admin replay atomicity, Redis job/key/Lua/recovery, and session-record apply/draft/revision behavior are characterized and mutation-sensitive.
- REST/API/auth, DB schema/migrations, Kafka, Redis wire storage, frontend/BFF, deployment, and public behavior are unchanged.
- Active docs, ADR, CHANGELOG, and dated closeout evidence state Phase 2 completion accurately while documenting remaining non-target legacy Detekt/ktlint debt instead of claiming global static-analysis zero.
- Final canonical server CI, full integration, public candidate, safety scan, whole-branch release-readiness review, independent whole-program review, and clean worktree evidence all pass at the same final HEAD.
