# ReadMates Platform Admin Operations Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플랫폼 관리자가 `/admin/today`에서 네 운영 source의 문제를 하나의 내구성 있는 케이스 큐로 확인하고, 보류하고, 검증 후 해결하며, desktop과 mobile에서 정확한 상세 route로 이어갈 수 있게 한다.

**Architecture:** 새 `com.readmates.admin.operations` workflow slice가 기존 club, notification, AI, closing-risk application contract를 safe signal로 투영하고 MySQL case/event ledger와 조정한다. Frontend는 새 case API만 소비하며 `api -> queries/model -> route -> ui` 경계를 유지하고, 기존 domain mutation route는 변경하지 않는다.

**Tech Stack:** Kotlin 2.x, Spring Boot, Spring JDBC, MySQL 8/Flyway, JUnit 5/Testcontainers, React 19, React Router 8, TanStack Query 5, TypeScript, Vitest/Testing Library, Playwright, CSS.

## Global Constraints

- Source of truth: current code, tests, `docs/development/architecture.md`, and the approved design `docs/superpowers/specs/2026-08-04-readmates-platform-admin-operations-command-center-design.md`.
- Scope is Slice 1 only: case lifecycle, queue/inspector, source freshness, deep links, responsive shell. Do not add club publication preview, notification replay changes, AI action changes, support-grant changes, or host-app redesign.
- Implement backend-first: server model/persistence/source/API must pass before the frontend switches `/admin/today` to the new contract.
- Production migration is `server/src/main/resources/db/mysql/migration/V47__admin_operation_cases.sql`; V46 is the current highest migration on this branch.
- Initial signal sources are exactly club readiness/domain/first-host, notification snapshot, AI failed/stale jobs, and today closing risks.
- AI policy-disabled is `DISABLED`, not an incident. Source fetch failure is `UNAVAILABLE`, not a persistent case.
- Case states are exactly `OPEN`, `ACKNOWLEDGED`, `SNOOZED`, `RESOLVED`; severities are `CRITICAL`, `WARNING`, `READY`, `INFO`.
- Only OWNER and OPERATOR may mutate case state. SUPPORT may read safe case projections but receives no mutation capabilities.
- Snooze must be later than the server clock and no more than 7 days ahead; the UI offers 1 hour, 4 hours, 1 day, and 7 days.
- Resolve must revalidate the exact source identity. Active or unverifiable signals return `409 CASE_STILL_ACTIVE` or `503 CASE_SOURCE_UNAVAILABLE`; absence from a partial page is never proof of resolution.
- Mutation requests require `expectedVersion`; stale writes return `409 CASE_VERSION_CONFLICT` and do not append an event.
- Keep browser calls on existing same-origin `/api/bff/**` proxy behavior; no BFF file or secret/config change is required.
- Never expose raw email, recipient, transcript, provider raw error, generated JSON, private member content, secret, token-shaped value, deployment identifier, or raw domain in case summaries, logs, metrics, fixtures, screenshots, docs, or final evidence.
- Preserve existing `/admin/**` URLs and existing domain authorization. Do not add a generic execute endpoint.
- Use Korean-first UI copy. Use editorial type only for page identity; operational labels, counts, status, and actions use the sans hierarchy.
- Use warm paper/ink surfaces, ledger rows and separators; avoid gradients, glass, glow, and nested-card walls.
- Mobile is a list -> detail -> back flow, not a compressed three-column layout. Interactive targets are at least 44px.
- Run focused RED/GREEN tests first, then the canonical frontend, server, integration, E2E, diff, and public-safety gates at final HEAD.

---

## File And Responsibility Map

### Server files to create

| File | Responsibility |
| --- | --- |
| `server/src/main/kotlin/com/readmates/admin/operations/application/model/AdminOperationCaseModels.kt` | Wire-independent states, filters, case, event, source batch, capability models |
| `server/src/main/kotlin/com/readmates/admin/operations/application/service/AdminOperationCasePolicy.kt` | Pure transition, snooze, severity ordering, role-action policy |
| `server/src/main/kotlin/com/readmates/admin/operations/application/port/in/AdminOperationUseCases.kt` | List/detail/acknowledge/snooze/resolve use cases |
| `server/src/main/kotlin/com/readmates/admin/operations/application/port/out/AdminOperationCasePorts.kt` | Case/event persistence ports |
| `server/src/main/kotlin/com/readmates/admin/operations/application/port/out/AdminOperationSignalProvider.kt` | Safe signal collection and exact verification contract |
| `server/src/main/kotlin/com/readmates/admin/operations/application/port/out/AdminOperationMetricsPort.kt` | Low-cardinality reconciliation/lifecycle metrics |
| `server/src/main/kotlin/com/readmates/admin/operations/application/service/AdminOperationReconciliationService.kt` | Per-source isolation, dedupe, persistence reconciliation |
| `server/src/main/kotlin/com/readmates/admin/operations/application/service/AdminOperationCaseService.kt` | Authorization, list/detail, optimistic lifecycle mutations, verification |
| `server/src/main/kotlin/com/readmates/admin/operations/application/AdminOperationException.kt` | Typed application failures and stable error codes |
| `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/persistence/JdbcAdminOperationCaseAdapter.kt` | MySQL case/event ledger, cursor paging, optimistic updates |
| `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source/ClubReadinessOperationSignalProvider.kt` | Club readiness/domain/first-host safe signals |
| `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source/NotificationOperationSignalProvider.kt` | Notification club/platform failure signals |
| `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source/AiOperationSignalProvider.kt` | AI disabled/failed/stale safe signals |
| `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source/ClosingRiskOperationSignalProvider.kt` | Closing-risk safe signals |
| `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/observability/MicrometerAdminOperationMetricsAdapter.kt` | Low-cardinality Micrometer counters/timers |
| `server/src/main/kotlin/com/readmates/admin/operations/adapter/in/web/PlatformAdminOperationsController.kt` | HTTP parsing and response mapping |
| `server/src/main/kotlin/com/readmates/admin/operations/adapter/in/web/AdminOperationErrorHandler.kt` | Typed status/code/message response |
| `server/src/main/resources/db/mysql/migration/V47__admin_operation_cases.sql` | Current case table, immutable event table, durable source-freshness table, constraints and indexes |

### Frontend files to create

| File | Responsibility |
| --- | --- |
| `front/features/platform-admin/api/platform-admin-operations-contracts.ts` | API-owned wire types |
| `front/features/platform-admin/api/platform-admin-operations-api.ts` | Same-origin case list/detail/lifecycle requests |
| `front/features/platform-admin/queries/platform-admin-operations-queries.ts` | Query keys, polling, mutations, invalidation |
| `front/features/platform-admin/model/platform-admin-operations-model.ts` | Pure labels, filters, URL state, selection, mobile summaries |
| `front/features/platform-admin/ui/admin-command-status.tsx` | One-line global freshness/open-count status |
| `front/features/platform-admin/ui/admin-operations-queue.tsx` | Filter controls and ledger rows |
| `front/features/platform-admin/ui/admin-operations-inspector.tsx` | Impact, freshness, deep link, history |
| `front/features/platform-admin/ui/admin-operation-state-actions.tsx` | Acknowledge/snooze/resolve controls |
| `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx` | Mobile list/detail/back presentation |

### Existing files to modify or retire

- Modify `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt` to register `admin.operations` as `WORKFLOW`.
- Modify `front/features/platform-admin/model/admin-route-catalog.ts` and tests for `Command`, `Operations`, `Review` grouping and Korean-first labels.
- Modify `front/features/platform-admin/route/admin-shell-layout.tsx`, `admin-shell-data.ts`, and tests to use compact command status.
- Modify `front/features/platform-admin/route/admin-today-data.ts`, `admin-today-route.tsx`, and tests to consume only the operations API.
- Modify `front/features/platform-admin/ui/admin-today-ledger.tsx` and its test as the desktop composition surface.
- Delete the today-only `front/features/platform-admin/ui/admin-work-queue.tsx` and `admin-selected-brief.tsx` after the new queue/inspector tests are green.
- Delete `front/features/platform-admin/ui/admin-status-strip.tsx`, its test, `front/features/platform-admin/model/admin-status-strip-model.ts`, and its test after shell status replacement is green.
- Keep `platform-admin-workbench-model.ts`; club detail and related UI still import its types. Remove only imports no longer used by `/admin/today`.
- Modify admin CSS sections in `front/src/styles/globals.css`; do not rewrite unrelated public/member/host rules.
- Modify `front/tests/e2e/admin-today.spec.ts`, `admin-today-closing-risks.spec.ts`, and `admin-shell.spec.ts` for the new contract and visual evidence.
- Modify `docs/development/architecture.md`, `docs/development/admin-hardening-baseline.md`, and `CHANGELOG.md` after implementation behavior is verified.

---

### Task 1: Define The Case Model And Pure Lifecycle Policy

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/operations/application/model/AdminOperationCaseModels.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/application/service/AdminOperationCasePolicy.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/application/AdminOperationException.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/operations/application/service/AdminOperationCasePolicyTest.kt`

**Interfaces:**
- Produces: `AdminOperationCaseState`, `AdminOperationSeverity`, `AdminOperationSourceType`, `AdminOperationSourceStatus`, `AdminOperationAction`, `AdminOperationCase`, `AdminOperationCaseEvent`, `AdminOperationCaseFilter`, `AdminOperationCaseCounts`, `AdminOperationSignal`, `AdminOperationSignalBatch`, `AdminOperationSourceFreshness`, `AdminOperationError`, and `AdminOperationException`.
- Produces: `AdminOperationCasePolicy.allowedActions(role, state)` and `validateSnooze(now, snoozedUntil)`.

- [ ] **Step 1: Write failing policy tests**

```kotlin
@Test
fun `support receives no lifecycle actions`() {
    assertThat(policy.allowedActions(PlatformAdminRole.SUPPORT, AdminOperationCaseState.OPEN)).isEmpty()
}

@Test
fun `operator can acknowledge snooze and request resolution`() {
    assertThat(policy.allowedActions(PlatformAdminRole.OPERATOR, AdminOperationCaseState.OPEN))
        .containsExactlyInAnyOrder(ACKNOWLEDGE, SNOOZE, RESOLVE)
}

@Test
fun `snooze rejects past and more than seven days`() {
    assertThatThrownBy { policy.validateSnooze(NOW, NOW.minusMinutes(1)) }.isInstanceOf(AdminOperationException::class.java)
    assertThatThrownBy { policy.validateSnooze(NOW, NOW.plusDays(7).plusSeconds(1)) }.isInstanceOf(AdminOperationException::class.java)
}
```

- [ ] **Step 2: Run the RED test**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.application.service.AdminOperationCasePolicyTest'
```

Expected: FAIL because the operations model and policy do not exist.

- [ ] **Step 3: Implement the wire-independent model**

```kotlin
enum class AdminOperationCaseState { OPEN, ACKNOWLEDGED, SNOOZED, RESOLVED }
enum class AdminOperationSeverity { CRITICAL, WARNING, READY, INFO }
enum class AdminOperationSourceType { CLUB_READINESS, NOTIFICATION, AI_JOB, CLOSING_RISK }
enum class AdminOperationSourceStatus { AVAILABLE, PARTIAL, UNAVAILABLE, DISABLED }
enum class AdminOperationAction { ACKNOWLEDGE, SNOOZE, RESOLVE }
enum class AdminOperationAssigneeFilter { ME }

data class AdminOperationCaseFilter(
    val states: Set<AdminOperationCaseState> = emptySet(),
    val severities: Set<AdminOperationSeverity> = emptySet(),
    val sources: Set<AdminOperationSourceType> = emptySet(),
    val assignee: AdminOperationAssigneeFilter? = null,
)

data class AdminOperationCaseCounts(
    val open: Long,
    val critical: Long,
    val assignedToMe: Long,
    val snoozed: Long,
)

data class AdminOperationCase(
    val id: UUID,
    val sourceType: AdminOperationSourceType,
    val sourceKey: String,
    val clubId: UUID?,
    val state: AdminOperationCaseState,
    val severity: AdminOperationSeverity,
    val summaryCode: String,
    val firstObservedAt: OffsetDateTime,
    val lastObservedAt: OffsetDateTime,
    val snoozedUntil: OffsetDateTime?,
    val assigneeAdminId: UUID?,
    val resolvedAt: OffsetDateTime?,
    val reopenCount: Int,
    val version: Long,
    val impactCount: Int,
    val detailHref: String,
)

data class AdminOperationCaseEvent(
    val id: UUID,
    val caseId: UUID,
    val fromState: AdminOperationCaseState?,
    val toState: AdminOperationCaseState,
    val action: AdminOperationAction?,
    val actorAdminId: UUID?,
    val reasonCode: String,
    val occurredAt: OffsetDateTime,
    val caseVersion: Long,
)

data class AdminOperationSignal(
    val sourceType: AdminOperationSourceType,
    val sourceKey: String,
    val clubId: UUID?,
    val severity: AdminOperationSeverity,
    val summaryCode: String,
    val impactCount: Int,
    val detailHref: String,
    val observedAt: OffsetDateTime,
)

data class AdminOperationSignalBatch(
    val sourceType: AdminOperationSourceType,
    val status: AdminOperationSourceStatus,
    val generatedAt: OffsetDateTime,
    val authoritative: Boolean,
    val signals: List<AdminOperationSignal>,
)

data class AdminOperationSourceFreshness(
    val sourceType: AdminOperationSourceType,
    val status: AdminOperationSourceStatus,
    val generatedAt: OffsetDateTime,
    val lastSuccessfulAt: OffsetDateTime?,
    val authoritative: Boolean,
)

data class AdminOperationTransitionCommand(
    val caseId: UUID,
    val expectedVersion: Long,
    val action: AdminOperationAction,
    val actorAdminId: UUID,
    val snoozedUntil: OffsetDateTime?,
    val reasonCode: String,
    val now: OffsetDateTime,
)

enum class AdminOperationError {
    CASE_NOT_FOUND, PERMISSION_DENIED, INVALID_SNOOZE_WINDOW,
    CASE_VERSION_CONFLICT, CASE_STILL_ACTIVE, CASE_SOURCE_UNAVAILABLE,
    INVALID_CURSOR, INVALID_FILTER
}

class AdminOperationException(val error: AdminOperationError) : RuntimeException(error.name)
```

Keep every reason code allowlisted by application policy. Do not place free-form operator input or provider error text in the case or event model.

- [ ] **Step 4: Implement exact policy rules**

```kotlin
fun allowedActions(role: PlatformAdminRole, state: AdminOperationCaseState): Set<AdminOperationAction> =
    if (role == PlatformAdminRole.SUPPORT) emptySet() else when (state) {
        OPEN -> setOf(ACKNOWLEDGE, SNOOZE, RESOLVE)
        ACKNOWLEDGED -> setOf(SNOOZE, RESOLVE)
        SNOOZED -> setOf(ACKNOWLEDGE, RESOLVE)
        RESOLVED -> emptySet()
    }

fun validateSnooze(now: OffsetDateTime, snoozedUntil: OffsetDateTime) {
    if (!snoozedUntil.isAfter(now)) throw AdminOperationException(INVALID_SNOOZE_WINDOW)
    if (snoozedUntil.isAfter(now.plusDays(7))) throw AdminOperationException(INVALID_SNOOZE_WINDOW)
}
```

- [ ] **Step 5: Run the focused test and architecture compilation**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.application.service.AdminOperationCasePolicyTest'
./server/gradlew -p server compileKotlin
```

Expected: PASS.

- [ ] **Step 6: Commit the model boundary**

```bash
git add server/src/main/kotlin/com/readmates/admin/operations/application server/src/test/kotlin/com/readmates/admin/operations/application/service/AdminOperationCasePolicyTest.kt
git commit -m "feat(server): define admin operation case lifecycle"
```

---

### Task 2: Add The Case And Event Ledger Persistence

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V47__admin_operation_cases.sql`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/application/port/out/AdminOperationCasePorts.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/persistence/JdbcAdminOperationCaseAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/operations/adapter/out/persistence/JdbcAdminOperationCaseAdapterTest.kt`

**Interfaces:**
- Consumes: case, event, filter, signal models from Task 1; shared `PageRequest`, `CursorPage`, and `CursorCodec`.
- Produces: `LoadAdminOperationCasesPort`, `WriteAdminOperationCasesPort`, `AdminOperationCaseUpdateResult`.

- [ ] **Step 1: Write failing MySQL integration tests**

Cover:

```kotlin
@Test fun `upsert keeps one case per source identity and increments version`()
@Test fun `resolved case reopens and increments reopen count`()
@Test fun `expired snoozed case reopens when its signal remains active`()
@Test fun `unavailable source does not resolve an existing case`()
@Test fun `optimistic transition rejects stale expected version without event`()
@Test fun `cursor order is severity then first observed then id`()
@Test fun `history is immutable and ordered newest first`()
@Test fun `source status preserves last successful time across an unavailable attempt`()
@Test fun `concurrent reconciliation preserves one source identity`()
```

Assert `admin_operation_cases`, `admin_operation_case_events`, and `admin_operation_source_status`; clean child events before cases in `@Sql` cleanup.

- [ ] **Step 2: Run the RED integration test**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.admin.operations.adapter.out.persistence.JdbcAdminOperationCaseAdapterTest'
```

Expected: FAIL because V47 and the adapter are absent.

- [ ] **Step 3: Add V47 with strict constraints**

Create `admin_operation_cases`, `admin_operation_case_events`, and one-row-per-source `admin_operation_source_status`. The core keys and checks must be:

```sql
UNIQUE KEY admin_operation_cases_source_identity_uk (source_type, source_key),
CHECK (state IN ('OPEN','ACKNOWLEDGED','SNOOZED','RESOLVED')),
CHECK (severity IN ('CRITICAL','WARNING','READY','INFO')),
CHECK (impact_count >= 0),
CHECK (version >= 0)
```

Index `(state, severity, first_observed_at, id)`, `(assignee_admin_id, state, first_observed_at)`, and event `(case_id, occurred_at, id)`. Use nullable FKs to `clubs(id)` and `users(id)` with `ON DELETE SET NULL` on both optional references; never cascade-delete history. Source status stores allowlisted `source_type`, current `status`, `attempted_at`, nullable `last_successful_at`, and `authoritative`; it stores no exception text.

- [ ] **Step 4: Define persistence ports and results**

```kotlin
interface LoadAdminOperationCasesPort {
    fun list(filter: AdminOperationCaseFilter, page: PageRequest): CursorPage<AdminOperationCase>
    fun counts(adminId: UUID): AdminOperationCaseCounts
    fun get(caseId: UUID): AdminOperationCase?
    fun history(caseId: UUID, limit: Int): List<AdminOperationCaseEvent>
    fun sourceFreshness(): List<AdminOperationSourceFreshness>
}

interface WriteAdminOperationCasesPort {
    fun reconcile(batch: AdminOperationSignalBatch, now: OffsetDateTime): List<AdminOperationCase>
    fun recordSourceFreshness(freshness: AdminOperationSourceFreshness)
    fun transition(command: AdminOperationTransitionCommand): AdminOperationCaseUpdateResult
}

sealed interface AdminOperationCaseUpdateResult {
    data class Updated(val case: AdminOperationCase) : AdminOperationCaseUpdateResult
    data object NotFound : AdminOperationCaseUpdateResult
    data object VersionConflict : AdminOperationCaseUpdateResult
}
```

- [ ] **Step 5: Implement JDBC mapping, cursor and atomic event append**

Use `@Transactional` on `reconcile`, `recordSourceFreshness`, and `transition`. Transition SQL must include `where id = ? and version = ?`; append an event only when exactly one row changed. Encode cursor keys `severityRank`, `firstObservedAt`, and `id` with `CursorCodec`. Lock by source identity during reconciliation so concurrent observations cannot create duplicate cases or lose a reopen increment.

- [ ] **Step 6: Run persistence GREEN and full integration migration discovery**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.admin.operations.adapter.out.persistence.JdbcAdminOperationCaseAdapterTest'
```

Expected: PASS, including Flyway V1-V47 application.

- [ ] **Step 7: Commit persistence**

```bash
git add server/src/main/resources/db/mysql/migration/V47__admin_operation_cases.sql server/src/main/kotlin/com/readmates/admin/operations/application/port/out/AdminOperationCasePorts.kt server/src/main/kotlin/com/readmates/admin/operations/adapter/out/persistence/JdbcAdminOperationCaseAdapter.kt server/src/test/kotlin/com/readmates/admin/operations/adapter/out/persistence/JdbcAdminOperationCaseAdapterTest.kt
git commit -m "feat(server): persist admin operation cases"
```

---

### Task 3: Project The Four Existing Sources Into Safe Signals

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/operations/application/port/out/AdminOperationSignalProvider.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source/ClubReadinessOperationSignalProvider.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source/NotificationOperationSignalProvider.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source/AiOperationSignalProvider.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source/ClosingRiskOperationSignalProvider.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/operations/adapter/out/source/AdminOperationSignalProvidersTest.kt`

**Interfaces:**
- Consumes: existing platform admin club use cases, `ManageAdminNotificationOperationsUseCase`, AI capabilities/config plus `ListAiOpsJobsUseCase` and `GetAiOpsJobUseCase`, and `ListAdminTodayClosingRisksUseCase`.
- Produces: `AdminOperationSignalProvider.collect(admin)` and `verify(admin, sourceKey)`.

- [ ] **Step 1: Write failing source projection tests with fake use cases**

Assert exact identities and summary codes:

```text
CLUB_READINESS:<clubId>          -> CLUB_SETUP_REQUIRED | CLUB_DOMAIN_ACTION_REQUIRED | CLUB_READY_TO_PUBLISH
NOTIFICATION:CLUB:<clubId>       -> NOTIFICATION_DELIVERY_FAILURE
NOTIFICATION:PLATFORM_BACKLOG    -> NOTIFICATION_PLATFORM_BACKLOG
AI_JOB:<jobId>                   -> AI_JOB_FAILED | AI_JOB_STALE
CLOSING_RISK:<sessionId>         -> SESSION_CLOSING_BLOCKED
```

Also assert:

- raw hostname, email, safeErrorMessage, book title, and blocker code are absent from `summaryCode`, `sourceKey`, and metrics labels;
- AI disabled returns `status=DISABLED`, `signals=[]`;
- provider exception returns through the reconciliation layer, not as a fabricated signal;
- `verify` returns `ACTIVE`, `ABSENT`, or `UNAVAILABLE`, never infers absence from a partial batch.
- a club page is authoritative only when fewer than 100 rows are returned;
- notification club-health is authoritative only when fewer than 25 rows are returned, while the platform backlog signal may use the snapshot's global aggregate counters;
- an AI batch is authoritative only when `nextCursor == null`;
- a closing-risk batch is authoritative only when fewer than 25 rows are returned;
- at any source boundary, a missing identity in a full-size or continued result verifies as `UNAVAILABLE`, never `ABSENT`; AI exact verification uses `GetAiOpsJobUseCase`.

- [ ] **Step 2: Run the RED source test**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.adapter.out.source.AdminOperationSignalProvidersTest'
```

Expected: FAIL because provider contracts and adapters are absent.

- [ ] **Step 3: Define the provider contract**

```kotlin
interface AdminOperationSignalProvider {
    val sourceType: AdminOperationSourceType
    fun collect(admin: CurrentPlatformAdmin): AdminOperationSignalBatch
    fun verify(admin: CurrentPlatformAdmin, sourceKey: String): AdminOperationSignalVerification
}

enum class AdminOperationSignalVerification { ACTIVE, ABSENT, UNAVAILABLE }
```

- [ ] **Step 4: Implement source-specific mapping without HTTP self-calls**

Each adapter injects existing application contracts, calls them with `CurrentPlatformAdmin`, and maps only allowlisted fields. Detail links are server-generated internal paths:

```text
/admin/clubs/<clubId>
/admin/notifications?clubId=<clubId>
/admin/notifications?focus=outbox_backlog
/admin/ai-ops?clubId=<clubId>
/clubs/<slug>/app/host/sessions/<sessionId>/closing
```

Do not inject controllers, persistence adapters, repositories, or `JdbcTemplate` into these source adapters.

- [ ] **Step 5: Run source GREEN**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.adapter.out.source.AdminOperationSignalProvidersTest'
```

Expected: PASS.

- [ ] **Step 6: Commit safe source adapters**

```bash
git add server/src/main/kotlin/com/readmates/admin/operations/application/port/out/AdminOperationSignalProvider.kt server/src/main/kotlin/com/readmates/admin/operations/adapter/out/source server/src/test/kotlin/com/readmates/admin/operations/adapter/out/source/AdminOperationSignalProvidersTest.kt
git commit -m "feat(server): project admin operation signals"
```

---

### Task 4: Reconcile Sources Without Cross-Source Failure Propagation

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/operations/application/service/AdminOperationReconciliationService.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/application/port/out/AdminOperationMetricsPort.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/operations/application/service/AdminOperationReconciliationServiceTest.kt`

**Interfaces:**
- Consumes: all `AdminOperationSignalProvider` beans and `WriteAdminOperationCasesPort`.
- Produces: `AdminOperationReconciliationResult(generatedAt, sources)` with one `AdminOperationSourceFreshness` per source.

- [ ] **Step 1: Write failing reconciliation tests**

```kotlin
@Test fun `one provider failure preserves successful source cases and reports unavailable freshness`()
@Test fun `disabled AI is reported without persistence reconcile`()
@Test fun `duplicate identities inside one batch fail closed instead of last-write-wins`()
@Test fun `authoritative empty batch can resolve source cases but partial empty batch cannot`()
@Test fun `providers run in deterministic source order for stable evidence`()
```

- [ ] **Step 2: Run RED**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.application.service.AdminOperationReconciliationServiceTest'
```

Expected: FAIL because reconciliation does not exist.

- [ ] **Step 3: Implement isolated collection and reconciliation**

```kotlin
data class AdminOperationReconciliationResult(
    val generatedAt: OffsetDateTime,
    val sources: List<AdminOperationSourceFreshness>,
)

fun reconcile(admin: CurrentPlatformAdmin): AdminOperationReconciliationResult {
    val freshness = providers.sortedBy { it.sourceType.name }.map { provider ->
        runCatching { provider.collect(admin) }
            .map { batch -> reconcileBatch(batch) }
            .getOrElse { unavailable(provider.sourceType, clock.now()) }
    }
    return AdminOperationReconciliationResult(clock.now(), freshness)
}
```

Validate source type ownership, nonblank source key/summary code, nonnegative impact, safe relative `detailHref`, and no duplicate identity before calling persistence. Record every attempt in the durable source-status row; a successful `AVAILABLE` or `PARTIAL` attempt advances `lastSuccessfulAt`, while `UNAVAILABLE` and `DISABLED` preserve the prior successful time.

- [ ] **Step 4: Add a no-op metrics port for unit tests and call sites**

Metrics methods are `recordReconciliation(source, status)`, `recordLifecycle(action, result)`, and `recordCaseAge(source, severity, seconds)`. Labels are enums only.

- [ ] **Step 5: Run reconciliation GREEN**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.application.service.AdminOperationReconciliationServiceTest'
```

Expected: PASS.

- [ ] **Step 6: Commit reconciliation**

```bash
git add server/src/main/kotlin/com/readmates/admin/operations/application/service/AdminOperationReconciliationService.kt server/src/main/kotlin/com/readmates/admin/operations/application/port/out/AdminOperationMetricsPort.kt server/src/test/kotlin/com/readmates/admin/operations/application/service/AdminOperationReconciliationServiceTest.kt
git commit -m "feat(server): reconcile admin operation sources"
```

---

### Task 5: Implement Authorized Case Queries And Lifecycle Mutations

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/operations/application/port/in/AdminOperationUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/application/service/AdminOperationCaseService.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/operations/application/service/AdminOperationCaseServiceTest.kt`

**Interfaces:**
- Consumes: Task 1 policy, Task 2 ports, Task 3 providers, Task 4 reconciliation/metrics.
- Produces: list/detail/acknowledge/snooze/resolve use cases and typed errors.

- [ ] **Step 1: Write failing service tests**

Cover:

```kotlin
@Test fun `list reconciles then returns cases plus every source freshness`()
@Test fun `support can list and inspect but acknowledge is forbidden`()
@Test fun `acknowledge writes event and increments version once`()
@Test fun `snooze validates server clock and seven day maximum`()
@Test fun `resolve verifies exact provider identity before transition`()
@Test fun `active signal returns CASE_STILL_ACTIVE`()
@Test fun `unavailable verification returns CASE_SOURCE_UNAVAILABLE`()
@Test fun `stale expected version returns CASE_VERSION_CONFLICT without event`()
@Test fun `list returns durable last successful time when one provider is unavailable`()
```

- [ ] **Step 2: Run RED**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.application.service.AdminOperationCaseServiceTest'
```

Expected: FAIL because use cases and service are absent.

- [ ] **Step 3: Define inbound commands and views**

```kotlin
data class AdminOperationMutationCommand(val caseId: UUID, val expectedVersion: Long)
data class SnoozeAdminOperationCommand(val caseId: UUID, val expectedVersion: Long, val snoozedUntil: OffsetDateTime)
data class AdminOperationCaseView(
    val case: AdminOperationCase,
    val allowedActions: Set<AdminOperationAction>,
    val source: AdminOperationSourceFreshness,
)
data class AdminOperationCasePage(
    val generatedAt: OffsetDateTime,
    val counts: AdminOperationCaseCounts,
    val sources: List<AdminOperationSourceFreshness>,
    val cases: CursorPage<AdminOperationCaseView>,
)
data class AdminOperationCaseDetail(
    val case: AdminOperationCaseView,
    val history: List<AdminOperationCaseEvent>,
)

interface ListAdminOperationCasesUseCase {
    fun list(admin: CurrentPlatformAdmin, filter: AdminOperationCaseFilter, page: PageRequest): AdminOperationCasePage
}
interface GetAdminOperationCaseUseCase { fun get(admin: CurrentPlatformAdmin, caseId: UUID): AdminOperationCaseDetail }
interface AcknowledgeAdminOperationCaseUseCase { fun acknowledge(admin: CurrentPlatformAdmin, command: AdminOperationMutationCommand): AdminOperationCase }
interface SnoozeAdminOperationCaseUseCase { fun snooze(admin: CurrentPlatformAdmin, command: SnoozeAdminOperationCommand): AdminOperationCase }
interface ResolveAdminOperationCaseUseCase { fun resolve(admin: CurrentPlatformAdmin, command: AdminOperationMutationCommand): AdminOperationCase }
```

- [ ] **Step 4: Implement role, version, verification and error mapping decisions**

Use the stable error enum created in Task 1:

```kotlin
enum class AdminOperationError {
    CASE_NOT_FOUND, PERMISSION_DENIED, INVALID_SNOOZE_WINDOW,
    CASE_VERSION_CONFLICT, CASE_STILL_ACTIVE, CASE_SOURCE_UNAVAILABLE,
    INVALID_CURSOR, INVALID_FILTER
}
```

Resolve calls the provider matching `case.sourceType`, then transitions only on `ABSENT`. A request against `RESOLVED` is idempotent only when `expectedVersion` equals the current version; otherwise return version conflict.

Acknowledging an unassigned case as OWNER or OPERATOR atomically sets `assigneeAdminId` to the acting admin. No separate assignment endpoint exists in Slice 1; `assignee=me` filters this deterministic ownership rule. Re-acknowledging an acknowledged case is not offered by policy.

- [ ] **Step 5: Run service GREEN**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.application.service.AdminOperationCaseServiceTest'
```

Expected: PASS.

- [ ] **Step 6: Commit application service**

```bash
git add server/src/main/kotlin/com/readmates/admin/operations/application server/src/test/kotlin/com/readmates/admin/operations/application/service/AdminOperationCaseServiceTest.kt
git commit -m "feat(server): manage admin operation cases"
```

---

### Task 6: Expose The Safe Platform Admin Operations API

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/operations/adapter/in/web/PlatformAdminOperationsController.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/operations/adapter/in/web/AdminOperationErrorHandler.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/operations/adapter/in/web/PlatformAdminOperationsControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/operations/api/PlatformAdminOperationsApiIntegrationTest.kt`

**Interfaces:**
- Consumes: Task 5 inbound use cases and errors.
- Produces: the five `/api/admin/operations/cases` endpoints and JSON contract used by Task 8.

- [ ] **Step 1: Write failing controller slice tests**

Assert request parsing, max `limit=50`, strict cursor rejection, ISO snooze parsing, expectedVersion requirement, and response projection. The response shape starts with:

```json
{
  "schema": "admin.operation_cases.v1",
  "generatedAt": "2026-08-04T00:00:00Z",
  "counts": { "open": 2, "critical": 1, "assignedToMe": 0, "snoozed": 1 },
  "sources": [],
  "items": [],
  "nextCursor": null
}
```

- [ ] **Step 2: Run controller RED**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.adapter.in.web.PlatformAdminOperationsControllerTest'
```

Expected: FAIL because the controller is absent.

- [ ] **Step 3: Implement request/response DTOs and error handler**

Routes:

```text
GET  /api/admin/operations/cases
GET  /api/admin/operations/cases/{caseId}
POST /api/admin/operations/cases/{caseId}/acknowledge
POST /api/admin/operations/cases/{caseId}/snooze
POST /api/admin/operations/cases/{caseId}/resolve
```

Return error bodies compatible with `ReadmatesApiError`:

```json
{ "code": "CASE_VERSION_CONFLICT", "message": "다른 운영자가 먼저 상태를 변경했습니다.", "status": 409 }
```

- [ ] **Step 4: Write and run MySQL/auth integration tests**

Cover unauthenticated/host 403, disabled admin 403, OWNER/OPERATOR mutation success, SUPPORT read 200 and mutation 403, version conflict, source unavailable, and forbidden sentinel absence.

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.admin.operations.api.PlatformAdminOperationsApiIntegrationTest'
```

Expected: PASS after implementation.

- [ ] **Step 5: Run both API lanes**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.adapter.in.web.PlatformAdminOperationsControllerTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.admin.operations.api.PlatformAdminOperationsApiIntegrationTest'
```

Expected: PASS.

- [ ] **Step 6: Commit API**

```bash
git add server/src/main/kotlin/com/readmates/admin/operations/adapter/in/web server/src/test/kotlin/com/readmates/admin/operations/adapter/in/web server/src/test/kotlin/com/readmates/admin/operations/api
git commit -m "feat(server): expose admin operation case API"
```

---

### Task 7: Register Architecture Boundaries And Low-Cardinality Metrics

**Files:**
- Create: `server/src/main/kotlin/com/readmates/admin/operations/adapter/out/observability/MicrometerAdminOperationMetricsAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/admin/operations/adapter/out/observability/MicrometerAdminOperationMetricsAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

**Interfaces:**
- Consumes: `AdminOperationMetricsPort` from Task 4.
- Produces: metrics `readmates.admin.operations.reconciliation`, `readmates.admin.operations.lifecycle`, `readmates.admin.operations.case.age` with enum-only labels.

- [ ] **Step 1: Write failing metrics and architecture tests**

```kotlin
@Test fun `metrics contain only source status action result severity labels`()
@Test fun `admin operations is registered as workflow slice`()
@Test fun `admin operations application does not depend on adapters jdbc or spring web`()
```

- [ ] **Step 2: Run RED**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.adapter.out.observability.MicrometerAdminOperationMetricsAdapterTest'
./server/gradlew -p server architectureTest --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

Expected: FAIL until adapter and registry entry exist.

- [ ] **Step 3: Implement metrics and register the slice**

Add:

```kotlin
ServerSlice(
    name = "admin.operations",
    type = ServerSliceType.WORKFLOW,
    webAdapterPackages = listOf("com.readmates.admin.operations.adapter.in.web.."),
    applicationPackages = listOf("com.readmates.admin.operations.application.."),
)
```

Do not use case id, club id, source key, summary code, href, error message, or actor id as metric labels.

- [ ] **Step 4: Run GREEN**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.adapter.out.observability.MicrometerAdminOperationMetricsAdapterTest'
./server/gradlew -p server architectureTest --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

Expected: PASS.

- [ ] **Step 5: Commit observability and boundary enforcement**

```bash
git add server/src/main/kotlin/com/readmates/admin/operations/adapter/out/observability server/src/test/kotlin/com/readmates/admin/operations/adapter/out/observability server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "test(server): enforce admin operations boundaries"
```

---

### Task 8: Add Frontend Contracts, API Client, And Query Ownership

**Files:**
- Create: `front/features/platform-admin/api/platform-admin-operations-contracts.ts`
- Create: `front/features/platform-admin/api/platform-admin-operations-api.ts`
- Test: `front/features/platform-admin/api/platform-admin-operations-api.test.ts`
- Create: `front/features/platform-admin/queries/platform-admin-operations-queries.ts`
- Test: `front/features/platform-admin/queries/platform-admin-operations-queries.test.tsx`

**Interfaces:**
- Consumes: Task 6 JSON contract.
- Produces: `adminOperationsKeys`, `platformAdminOperationCasesQuery`, `platformAdminOperationCaseQuery`, and three lifecycle mutation hooks.

- [ ] **Step 1: Write failing API contract tests**

Define exact wire unions:

```ts
export type AdminOperationCaseState = "OPEN" | "ACKNOWLEDGED" | "SNOOZED" | "RESOLVED";
export type AdminOperationSeverity = "CRITICAL" | "WARNING" | "READY" | "INFO";
export type AdminOperationSourceType = "CLUB_READINESS" | "NOTIFICATION" | "AI_JOB" | "CLOSING_RISK";
export type AdminOperationAction = "ACKNOWLEDGE" | "SNOOZE" | "RESOLVE";
export type AdminOperationSummaryCode =
  | "CLUB_SETUP_REQUIRED"
  | "CLUB_DOMAIN_ACTION_REQUIRED"
  | "CLUB_READY_TO_PUBLISH"
  | "NOTIFICATION_DELIVERY_FAILURE"
  | "NOTIFICATION_PLATFORM_BACKLOG"
  | "AI_JOB_FAILED"
  | "AI_JOB_STALE"
  | "SESSION_CLOSING_BLOCKED";
```

Test query-string encoding, `expectedVersion` bodies, snooze ISO body, typed error propagation, and no legacy summary/notification/AI calls in this module.

- [ ] **Step 2: Run API RED**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/api/platform-admin-operations-api.test.ts
```

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement API functions**

```ts
export function fetchAdminOperationCases(filter: AdminOperationCaseFilter): Promise<AdminOperationCasesResponse>;
export function fetchAdminOperationCase(caseId: string): Promise<AdminOperationCaseDetailResponse>;
export function acknowledgeAdminOperationCase(caseId: string, expectedVersion: number): Promise<AdminOperationCaseResponse>;
export function snoozeAdminOperationCase(caseId: string, expectedVersion: number, snoozedUntil: string): Promise<AdminOperationCaseResponse>;
export function resolveAdminOperationCase(caseId: string, expectedVersion: number): Promise<AdminOperationCaseResponse>;
```

Use `readmatesFetch` and encode only allowlisted filter keys.

- [ ] **Step 4: Write failing query ownership tests**

Assert key stability, `refetchInterval` only for visible active consumers, lifecycle success invalidates list/detail, and conflict leaves cached data intact for route-level recovery.

- [ ] **Step 5: Implement query options and mutations, then run GREEN**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/api/platform-admin-operations-api.test.ts features/platform-admin/queries/platform-admin-operations-queries.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run frontend boundary test**

```bash
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

Expected: PASS; query modules import API/model only and UI imports no API/query/route.

- [ ] **Step 7: Commit frontend data boundary**

```bash
git add front/features/platform-admin/api/platform-admin-operations-contracts.ts front/features/platform-admin/api/platform-admin-operations-api.ts front/features/platform-admin/api/platform-admin-operations-api.test.ts front/features/platform-admin/queries/platform-admin-operations-queries.ts front/features/platform-admin/queries/platform-admin-operations-queries.test.tsx
git commit -m "feat(front): add admin operations data contract"
```

---

### Task 9: Build The Pure Operations View Model And URL Contract

**Files:**
- Create: `front/features/platform-admin/model/platform-admin-operations-model.ts`
- Test: `front/features/platform-admin/model/platform-admin-operations-model.test.ts`

**Interfaces:**
- Consumes: wire contracts from Task 8 as type-only imports.
- Produces: `parseAdminOperationsSearch`, `serializeAdminOperationsSearch`, `buildAdminOperationsView`, safe labels, selection fallback, mobile summary.

- [ ] **Step 1: Write failing model tests**

Cover:

```ts
it("round-trips case state severity source assignee and cursor filters");
it("drops unknown URL values instead of forwarding them to the API");
it("selects requested case or first visible case without mutating the list");
it("labels every summary code without showing unknown raw code");
it("sorts critical before warning before ready before info and then by age");
it("builds mobile counts and source freshness messages");
```

- [ ] **Step 2: Run RED**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-operations-model.test.ts
```

Expected: FAIL because the model is absent.

- [ ] **Step 3: Implement explicit label maps and URL allowlists**

```ts
const SUMMARY_LABELS: Record<AdminOperationSummaryCode, { title: string; description: string }> = {
  CLUB_SETUP_REQUIRED: { title: "클럽 설정이 필요합니다", description: "공개 전 필수 조건을 확인하세요." },
  CLUB_DOMAIN_ACTION_REQUIRED: { title: "도메인 확인이 필요합니다", description: "연결 상태를 확인하세요." },
  CLUB_READY_TO_PUBLISH: { title: "클럽이 공개 준비를 마쳤습니다", description: "클럽 상세에서 조건을 검토하세요." },
  NOTIFICATION_DELIVERY_FAILURE: { title: "알림 전달 실패가 반복되고 있습니다", description: "같은 원인의 실패를 확인하세요." },
  NOTIFICATION_PLATFORM_BACKLOG: { title: "알림 처리 지연이 감지되었습니다", description: "알림 운영 상태를 확인하세요." },
  AI_JOB_FAILED: { title: "AI 작업이 실패했습니다", description: "안전한 작업 정보만 확인합니다." },
  AI_JOB_STALE: { title: "AI 작업 갱신이 지연되고 있습니다", description: "작업 상태를 확인하세요." },
  SESSION_CLOSING_BLOCKED: { title: "회차 마감이 완료되지 않았습니다", description: "호스트 클로징 보드를 확인하세요." },
};
```

Unknown summary code displays `운영 상태 확인 필요`; never render the unknown code.

- [ ] **Step 4: Run model GREEN**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-operations-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit pure model**

```bash
git add front/features/platform-admin/model/platform-admin-operations-model.ts front/features/platform-admin/model/platform-admin-operations-model.test.ts
git commit -m "feat(front): model admin operation cases"
```

---

### Task 10: Replace The Metric Strip With The Command Shell Status

**Files:**
- Modify: `front/features/platform-admin/model/admin-route-catalog.ts`
- Modify: `front/features/platform-admin/model/admin-route-catalog.test.ts`
- Modify: `front/features/platform-admin/ui/admin-layout-nav.tsx`
- Modify: `front/features/platform-admin/ui/admin-layout-nav.test.tsx`
- Create: `front/features/platform-admin/ui/admin-command-status.tsx`
- Test: `front/features/platform-admin/ui/admin-command-status.test.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-data.ts`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.test.tsx`
- Delete: `front/features/platform-admin/ui/admin-status-strip.tsx`
- Delete: `front/features/platform-admin/ui/admin-status-strip.test.tsx`
- Delete: `front/features/platform-admin/model/admin-status-strip-model.ts`
- Delete: `front/features/platform-admin/model/admin-status-strip-model.test.ts`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: operations list metadata query from Task 8 and view labels from Task 9.
- Produces: compact global status and nav groups `command`, `operations`, `review`.

- [ ] **Step 1: Write failing shell/nav/status tests**

Assert:

- nav groups are `Command`, `Operations`, `Review` with Korean item labels;
- active route keeps `aria-current=page`;
- status says `전체 신호 정상 · 8건 열림 · HH:mm 기준` when all sources are available;
- partial source says `일부 신호 확인 불가` with `role=status`;
- command status contains no four-card metric strip;
- workspace switcher, skip link, role badge, and new-club action still work.

- [ ] **Step 2: Run shell RED**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/ui/admin-layout-nav.test.tsx features/platform-admin/ui/admin-command-status.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx
```

Expected: FAIL against the old `오늘/헬스` grouping and metric strip.

- [ ] **Step 3: Implement the compact shell without making operations availability route-fatal**

`AdminShellLayout` uses an optional operations summary query. Summary/clubs remain required for existing shell role/workspace behavior; operations failure renders compact unavailable status and does not block `<Outlet />`.

- [ ] **Step 4: Replace only admin shell CSS blocks**

Use a sticky top header, 220px ledger navigation at desktop, warm paper body, rule-based status line, and existing breakpoints. Do not touch public/member/host selectors.

- [ ] **Step 5: Run shell GREEN and boundary tests**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/model/admin-route-catalog.test.ts features/platform-admin/ui/admin-layout-nav.test.tsx features/platform-admin/ui/admin-command-status.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit shell redesign**

```bash
git add front/features/platform-admin/model/admin-route-catalog.ts front/features/platform-admin/model/admin-route-catalog.test.ts front/features/platform-admin/ui/admin-layout-nav.tsx front/features/platform-admin/ui/admin-layout-nav.test.tsx front/features/platform-admin/ui/admin-command-status.tsx front/features/platform-admin/ui/admin-command-status.test.tsx front/features/platform-admin/route/admin-shell-data.ts front/features/platform-admin/route/admin-shell-layout.tsx front/features/platform-admin/route/admin-shell-layout.test.tsx front/features/platform-admin/ui/admin-status-strip.tsx front/features/platform-admin/ui/admin-status-strip.test.tsx front/features/platform-admin/model/admin-status-strip-model.ts front/features/platform-admin/model/admin-status-strip-model.test.ts front/src/styles/globals.css
git commit -m "feat(front): reshape admin command shell"
```

---

### Task 11: Switch `/admin/today` To The Case Queue And Inspector

**Files:**
- Create: `front/features/platform-admin/ui/admin-operations-queue.tsx`
- Test: `front/features/platform-admin/ui/admin-operations-queue.test.tsx`
- Create: `front/features/platform-admin/ui/admin-operations-inspector.tsx`
- Test: `front/features/platform-admin/ui/admin-operations-inspector.test.tsx`
- Create: `front/features/platform-admin/ui/admin-operation-state-actions.tsx`
- Test: `front/features/platform-admin/ui/admin-operation-state-actions.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`
- Modify: `front/features/platform-admin/route/admin-today-data.ts`
- Modify: `front/features/platform-admin/route/admin-today-route.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`
- Delete: `front/features/platform-admin/ui/admin-work-queue.tsx`
- Delete: `front/features/platform-admin/ui/admin-selected-brief.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: Task 8 queries and Task 9 view model.
- Produces: desktop queue/inspector, URL `case/state/severity/source/assignee`, lifecycle callbacks.

- [ ] **Step 1: Write failing queue, inspector and action tests**

Assert:

- rows expose title, source, impact, age, severity text and `aria-pressed`;
- unknown summary code is not rendered;
- inspector shows safe impact, freshness, canonical detail link and history;
- SUPPORT receives no lifecycle buttons;
- snooze presets emit exact ISO target from injected clock;
- resolve asks for confirmation but close/Escape/backdrop calls no mutation;
- pending mutation disables repeat submission;
- 409 conflict displays refresh-required copy and triggers detail refetch.

- [ ] **Step 2: Run component RED**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-operations-inspector.test.tsx features/platform-admin/ui/admin-operation-state-actions.test.tsx
```

Expected: FAIL because components are absent.

- [ ] **Step 3: Implement prop/callback-only UI components**

None of the three UI files may import API, queries, route modules, `fetch`, or `shared/api`. Use semantic buttons/links, `role=status|alert`, and one primary action per panel.

- [ ] **Step 4: Write route RED against seeded operations queries**

Replace old seeded summary/clubs/notification/AI/closing-risk route data with one operations page and one detail. Assert `/admin/today?case=case-notification` restores selection and filter changes preserve the case when still visible.

- [ ] **Step 5: Switch loader and route**

`adminTodayLoaderFactory` fetches `platformAdminOperationCasesQuery(parsedFilter)` only. `AdminTodayRoute` owns URL state, query errors, mutation callbacks, and prop assembly. It no longer imports legacy notification/AI/closing-risk queries or `buildPlatformAdminWorkbench`.

- [ ] **Step 6: Run route/UI GREEN and boundary test**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-operations-inspector.test.tsx features/platform-admin/ui/admin-operation-state-actions.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/route/admin-today-route.test.tsx tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 7: Remove only obsolete today UI files and stale imports**

Confirm with:

```bash
rg -n "AdminWorkQueue|AdminSelectedBrief|admin-work-queue|admin-selected-brief" front/features/platform-admin front/tests
```

Expected: no TypeScript imports or test references; CSS cleanup may remain until this step removes the old selectors.

- [ ] **Step 8: Commit today command center**

```bash
git add front/features/platform-admin/ui front/features/platform-admin/route/admin-today-data.ts front/features/platform-admin/route/admin-today-route.tsx front/features/platform-admin/route/admin-today-route.test.tsx front/src/styles/globals.css
git commit -m "feat(front): build admin operation command center"
```

---

### Task 12: Make Mobile, Partial Failure, And Accessibility First-Class

**Files:**
- Create: `front/features/platform-admin/ui/admin-operation-mobile-detail.tsx`
- Test: `front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-queue.tsx`
- Modify: `front/features/platform-admin/ui/admin-operations-inspector.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: Task 9 mobile summary and Task 11 props/callbacks.
- Produces: list -> detail -> back flow, source banners, stale/empty/error/accessibility states.

- [ ] **Step 1: Write failing mobile and state tests**

Cover 390px semantic behavior without relying on CSS snapshots:

- list is shown first;
- selecting a case replaces the list with detail and exposes `목록으로`;
- back restores filter and selected-row scroll marker;
- partial source failure leaves cases interactive;
- stale source shows last successful time;
- retry control is rendered only on an unavailable source banner and triggers the list query retry callback once; healthy and disabled source banners expose no retry control;
- permission denied replaces the command surface with a safe alert and no stale lifecycle controls;
- background refresh preserves the selected case and current filters;
- resolved and reopened cases expose explicit lifecycle text rather than color alone;
- honest empty has no disabled fake action;
- all interactive elements have accessible names;
- status is not color-only and all primary controls have the 44px class contract;
- Korean and long safe identifiers use wrapping classes.

- [ ] **Step 2: Run mobile RED**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-operation-mobile-detail.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx
```

Expected: FAIL because mobile detail and explicit partial states are absent.

- [ ] **Step 3: Implement mobile composition and responsive CSS**

Desktop keeps queue + inspector. At the existing tablet breakpoint, switch to single column; at mobile, render explicit list/detail modes. Do not hide inspector content with CSS alone when it should be absent from tab order. Wire the per-source retry callback to the existing operations list query refetch; render it only beside `UNAVAILABLE`, and keep it separate from every lifecycle mutation callback.

- [ ] **Step 4: Run mobile/UI GREEN**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/ui/admin-operation-mobile-detail.test.tsx features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/route/admin-today-route.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run lint before committing CSS-heavy work**

```bash
corepack pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 6: Commit responsive and accessibility states**

```bash
git add front/features/platform-admin/ui/admin-operation-mobile-detail.tsx front/features/platform-admin/ui/admin-operation-mobile-detail.test.tsx front/features/platform-admin/ui/admin-today-ledger.tsx front/features/platform-admin/ui/admin-today-ledger.test.tsx front/features/platform-admin/ui/admin-operations-queue.tsx front/features/platform-admin/ui/admin-operations-inspector.tsx front/src/styles/globals.css
git commit -m "feat(front): complete responsive admin operations UX"
```

---

### Task 13: Prove The Browser Contract And No-Action Safety

**Files:**
- Modify: `front/tests/e2e/admin-today.spec.ts`
- Modify: `front/tests/e2e/admin-today-closing-risks.spec.ts`
- Modify: `front/tests/e2e/admin-shell.spec.ts`
- Create: `front/tests/e2e/admin-operations-command-center.spec.ts`

**Interfaces:**
- Consumes: completed server/frontend contract.
- Produces: role, deep-link, lifecycle, responsive, and screenshot evidence.

- [ ] **Step 1: Replace legacy `/admin/today` network fixtures**

Mock `/api/bff/api/admin/operations/cases**` with safe IDs and summary codes. Keep existing auth, summary, clubs mocks needed by the shell. Remove today-page mocks for notification snapshot, AI jobs, and closing risks; those old domain routes remain tested by their own E2E specs.

- [ ] **Step 2: Write failing command-center E2E cases**

Cover:

```text
OWNER: deep link -> acknowledge -> version increments -> history appears
OPERATOR: snooze preset -> snoozed state -> URL/filter preserved
SUPPORT: list/detail visible -> no lifecycle controls -> direct POST returns 403
conflict: stale expectedVersion -> refresh message -> latest detail loaded
partial source: unavailable banner -> other cases remain usable
partial source retry: retry exists only on unavailable banner -> one list refetch -> no lifecycle mutation
mobile: list -> detail -> back at 390x844
no-action: Escape/close/backdrop/navigation keeps mutation count at 0
```

- [ ] **Step 3: Run targeted E2E RED**

```bash
corepack pnpm --dir front test:e2e -- tests/e2e/admin-operations-command-center.spec.ts tests/e2e/admin-today.spec.ts tests/e2e/admin-today-closing-risks.spec.ts tests/e2e/admin-shell.spec.ts
```

Expected: initial failures identify missing route fixture or browser behavior; no unrelated live email/AI action runs.

- [ ] **Step 4: Complete fixtures and capture responsive artifacts**

Capture non-committed screenshots at 1440x1000, 900x900, and 390x844. Assert screenshot buffers are non-empty and DOM text excludes `PRIVATE_SENTINEL_TOKEN`, raw email, raw error, and token-shaped values.

- [ ] **Step 5: Run targeted E2E GREEN**

```bash
corepack pnpm --dir front test:e2e -- tests/e2e/admin-operations-command-center.spec.ts tests/e2e/admin-today.spec.ts tests/e2e/admin-today-closing-risks.spec.ts tests/e2e/admin-shell.spec.ts
```

Expected: PASS at all three viewports with mutation count unchanged after every closure action.

- [ ] **Step 6: Commit E2E evidence code only**

```bash
git add front/tests/e2e/admin-operations-command-center.spec.ts front/tests/e2e/admin-today.spec.ts front/tests/e2e/admin-today-closing-risks.spec.ts front/tests/e2e/admin-shell.spec.ts
git commit -m "test(e2e): prove admin operations workflows"
```

Do not add screenshot, report, trace, video, `.tmp`, or Playwright output files.

---

### Task 14: Synchronize Active Docs And Run Final Gates

**Files:**
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/admin-hardening-baseline.md`
- Modify: `CHANGELOG.md`
- Verify: all Slice 1 files and the branch diff from `origin/main`

**Interfaces:**
- Consumes: verified behavior from Tasks 1-13.
- Produces: active architecture/release notes and final evidence.

- [ ] **Step 1: Update active architecture after code is green**

Document:

- `admin.operations` as a workflow slice;
- V47 case/event ledger ownership;
- four initial signal sources and unavailable/disabled distinction;
- case lifecycle, role boundary, strict resolve verification;
- frontend case API ownership and preserved domain mutation routes;
- no generic execute endpoint and no private content projection.

- [ ] **Step 2: Update the hardening baseline and Unreleased changelog**

Add loading/empty/stale/partial/conflict/resolved/reopened checks, desktop/mobile evidence, and an `Unreleased` operator-facing entry. Do not claim deployment or live production verification.

- [ ] **Step 3: Run focused server gates**

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.admin.operations.*'
./server/gradlew -p server architectureTest --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.admin.operations.*'
```

Expected: PASS.

- [ ] **Step 4: Run canonical server gates**

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

Expected: PASS. If the full Testcontainers lane cannot run, report the exact command and environment reason; do not substitute a pass claim.

- [ ] **Step 5: Run focused and canonical frontend gates**

```bash
corepack pnpm --dir front exec vitest run features/platform-admin/api/platform-admin-operations-api.test.ts features/platform-admin/queries/platform-admin-operations-queries.test.tsx features/platform-admin/model/platform-admin-operations-model.test.ts features/platform-admin/route/admin-today-route.test.tsx features/platform-admin/ui/admin-command-status.test.tsx features/platform-admin/ui/admin-operations-queue.test.tsx features/platform-admin/ui/admin-operations-inspector.test.tsx features/platform-admin/ui/admin-operation-state-actions.test.tsx features/platform-admin/ui/admin-operation-mobile-detail.test.tsx
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

Expected: PASS. Record the exact resolved Corepack command in final evidence.

- [ ] **Step 6: Run diff, docs, and public-safety checks**

```bash
git diff --check
git diff --no-index --check /dev/null docs/superpowers/plans/2026-08-04-readmates-platform-admin-operations-command-center.md
git diff --check origin/main..HEAD
rg -n -i "T[B]D|T[O]DO|F[I]XME|place[h]older|implement l[a]ter|fill in d[e]tails" docs/superpowers/plans/2026-08-04-readmates-platform-admin-operations-command-center.md docs/development/architecture.md docs/development/admin-hardening-baseline.md CHANGELOG.md
rg -n "(^|[^A-Za-z0-9_])([o]cid1\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" docs/superpowers/plans/2026-08-04-readmates-platform-admin-operations-command-center.md docs/development/architecture.md docs/development/admin-hardening-baseline.md CHANGELOG.md
```

Expected: both tracked and untracked-file whitespace checks pass and safety scans return no newly introduced private values. `git diff --no-index` exits `1` when differences exist; only whitespace diagnostics or an exit code above `1` fail this check. The split scanner patterns keep the plan itself free of the terms it rejects.

- [ ] **Step 7: Review the whole branch against the approved spec**

Verify every design success criterion maps to code/test evidence, inspect `origin/main..HEAD`, confirm no domain mutation contract changed, and request an independent code review before closeout.

- [ ] **Step 8: Commit docs and final cleanup**

```bash
git add docs/development/architecture.md docs/development/admin-hardening-baseline.md CHANGELOG.md
git commit -m "docs: record admin operations command center"
git status --short --branch
```

Expected: only intentionally uncommitted planning artifacts remain; product, test, migration, and active-doc changes are committed. Do not push, open a PR, tag, deploy, send email, or call an AI provider without separate authorization.

---

## Acceptance Matrix Selection

| Matrix row | Why selected | Evidence |
| --- | --- | --- |
| Actor or authorization | OWNER/OPERATOR mutate, SUPPORT read-only, non-admin denied | Service tests, MockMvc/MySQL integration, E2E direct denied POST |
| Persistence or migration | V47 case/event ledger, unique identity, cursor, optimistic version | JDBC integration and full `integrationTest` |
| Async, cache, or provider | four source providers can be disabled, partial, unavailable, stale | Provider/reconciliation tests and partial-source E2E |
| Cursor collection | operations list is cursor-paged | empty/first/continuation/last persistence/API tests |
| UI or runtime state | loading, empty, stale, partial, conflict, denied, mobile | Component/route tests and three viewport E2E |

Adjacent rows intentionally excluded:

- Club context: case projection may contain an optional club id, but no club-scoped browser header or host authorization boundary changes.
- Session lifecycle: closing risk is read-only signal projection; session transitions are unchanged.
- Guest/public exposure and guest DTO privacy: no public or guest endpoint changes.
- BFF/OAuth: existing generic same-origin proxy and authentication flow are unchanged.

## Execution Boundary

- The executor may edit and commit only the Slice 1 repository files listed by the tasks, plus narrowly required generated lock metadata if the current code demands it.
- The executor must preserve unrelated dirty worktrees, branches, containers, ports, and ignored artifacts.
- No remote push, PR, tag, release, deploy, production data mutation, email send, or billable AI call is authorized by this plan.
