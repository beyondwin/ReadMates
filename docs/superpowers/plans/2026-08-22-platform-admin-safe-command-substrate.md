# Platform Admin Safe Command Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플랫폼 어드민의 위험 명령이 재시도·동시 실행·응답 유실 상황에서도 중복 효과를 만들지 않도록, 도메인별 preview/receipt가 공유할 최소 운영 idempotency와 HMAC 기반을 제공한다.

**Architecture:** Flyway V57은 mutable claim `platform_admin_command_idempotency`, key-version alias `platform_admin_command_idempotency_keys`, retirement state `platform_admin_command_digest_key_state`를 분리한다. `shared/mutation`의 versioned canonical HMAC primitive를 재사용하되 platform-admin identity는 host membership identity와 분리한다. 각 club/notification/AI/support application service가 rotation phase의 alias write candidates를 자기 transaction 안에서 같은 claim에 예약하고 자기 immutable receipt와 함께 완료하며, 범용 명령 controller·executor·receipt body는 만들지 않는다.

**Tech Stack:** Kotlin, Spring Boot, JDBC, MySQL 8, Flyway, JUnit 5, Testcontainers, Micrometer.

**Spec:** `docs/superpowers/specs/2026-08-22-readmates-platform-admin-service-spine-redesign-design.md`

ADR impact: implements proposed ADR-0040; constraining reference — ADR-0028, ADR-0029, ADR-0033

## Global Constraints

- Prerequisite: host/public safety migrations V52–V56 must land first. If current main does not contain them, stop and rebase this plan; never edit or renumber an applied migration.
- V57 stores no raw reason, email, name, URL, request JSON, canonical input, idempotency key, or plaintext digest.
- Logical identity is `(platformAdminUserId, commandType, targetType, targetId, idempotencyKey)`. Plaintext key는 저장하지 않고 key version별 HMAC alias만 같은 claim에 연결한다. It never uses club membership IDs.
- Same key + same canonical request converges to the same domain receipt. Same key + different request is `409 IDEMPOTENCY_CONFLICT`. A live claim is `409 COMMAND_IN_PROGRESS` with bounded retry guidance.
- Digest and idempotency-key fingerprints use purpose-separated, versioned HMAC and constant-time comparison. Rotation은 `writePreviousAlias=true` overlap에서 current·previous alias를 dual-write하고, old writer drain 확인 뒤 `false`로 바꿔 current alias만 새로 쓰되 previous는 lookup에 유지한다. Expired completed claim purge로 previous alias를 제거하고, zero-reference 이후 최소 24시간 buffer를 거친 뒤에만 previous key를 제거한다. Unknown or retired versions fail closed.
- Origin claim states are only `IN_PROGRESS|COMPLETED`. Persisted lease takeover와 bare `FAILED`는 없고 committed `IN_PROGRESS`는 fail closed한다. L3 lease는 origin commit 이후 convergence work에만 존재한다.
- Claim creation expiry는 retention anchor가 아니다. Completion CAS가 `expiresAt = completedAt + retention`으로 다시 설정하고 retention은 최소 24시간이어야 한다. Initial expiry 뒤까지 실행된 long-running claim도 valid claim token이면 완료할 수 있다.
- The operational row is not business audit. Domain-owned immutable receipts and audit events remain the only user-visible proof.
- Application services own transaction boundaries. Controller and adapter must not orchestrate multi-port business transactions.
- Purge removes only expired `COMPLETED` claims after at least 24 hours and cascades only to their operational aliases, never to immutable receipts. Key retirement also requires no remaining alias plus a 24-hour unreferenced buffer.
- The existing `AdminCommandIdentityStartupValidator` checks configuration syntax and secret presence only; it is not retirement evidence. A separate DB-backed startup validator runs after Flyway, locks key-state rows, and fails application startup when configured keys cannot replay every alias or removed versions lack locked zero-alias retirement evidence.
- Metrics have bounded tags only: command type, claim result, outcome. Never tag actor, target, idempotency key, digest, receipt ID, or error text.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Schema and retention | 1 |
| Canonical admin identity and HMAC rotation | 2 |
| Atomic claim/complete protocol | 3 |
| Domain adoption boundary and security harness | 4 |
| Concurrency and operational acceptance | 5 |

## Dependency Order

`1 → 2 → 3 → 4 → 5`. Club, service, and review plans depend on Task 3 and supply their own receipt tables, DTOs, and controller paths.

---

### Task 1: Add the operational idempotency table

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V57__platform_admin_command_idempotency.sql`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

**Schema:** UUID-valued `id`, `platform_admin_user_id`, `claim_token`, `claim_id`는 현재 repository의 `DbColumns.UUID.dbString()` persistence와 맞춰 `char(36) character set ascii collate ascii_bin`을 사용한다. `target_id`와 `receipt_id`는 synthetic slot/domain pointer를 허용하므로 bounded `varchar(128) ascii_bin`을 유지한다.

```sql
platform_admin_command_idempotency(
  id char(36) primary key,
  platform_admin_user_id char(36) not null,
  command_type varchar(96) not null,
  target_type varchar(64) not null,
  target_id varchar(128) not null,
  canonical_schema_version varchar(64) not null,
  state varchar(16) not null,
  claim_token char(36) not null,
  receipt_type varchar(96) null,
  receipt_id varchar(128) null,
  created_at datetime(6) not null,
  updated_at datetime(6) not null,
  expires_at datetime(6) not null,
  unique(id, platform_admin_user_id, command_type, target_type, target_id)
)

platform_admin_command_idempotency_keys(
  claim_id char(36) not null,
  platform_admin_user_id char(36) not null,
  command_type varchar(96) not null,
  target_type varchar(64) not null,
  target_id varchar(128) not null,
  digest_key_version int not null,
  idempotency_key_hmac varbinary(32) not null,
  request_hmac varbinary(32) not null,
  created_at datetime(6) not null,
  unique(platform_admin_user_id, command_type, target_type, target_id,
         digest_key_version, idempotency_key_hmac),
  unique(claim_id, digest_key_version),
  foreign key(claim_id, platform_admin_user_id, command_type, target_type, target_id)
    references platform_admin_command_idempotency(
      id, platform_admin_user_id, command_type, target_type, target_id
    ) on delete cascade
)

platform_admin_command_digest_key_state(
  digest_key_version int primary key,
  last_referenced_at datetime(6) not null,
  unreferenced_since datetime(6) null
)
```

State check is `IN_PROGRESS|COMPLETED`. `IN_PROGRESS` requires both receipt columns null; `COMPLETED` requires both non-null. The claim token is retained after completion as CAS evidence. Main, actor, target, receipt, and key-state rows have no destructive foreign key; only operational alias-to-claim cleanup may cascade.

- [ ] **Step 1: Write RED migration tests.** Cover all three tables on clean and V56 legacy migration; dual-version alias reservation, identity and claim-version uniqueness, composite scope integrity, exact HMAC lengths, non-negative key versions, state/receipt/token checks, bounded expiry index, operational-only alias cascade, and hard deletion of a referenced target.
- [ ] **Step 2: Run RED.** Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest`; expected FAIL because V57 is absent.
- [ ] **Step 3: Implement V57 only after verifying V52–V56 exist.** Do not modify V1–V56.
- [ ] **Step 4: Run GREEN.** Run the Task 1 command; expected PASS.
- [ ] **Step 5: Commit.** Commit: `feat(server): add admin command idempotency schema`

### Task 2: Define versioned canonical admin command identity

**Files:**
- Reuse after prerequisite lands: `server/src/main/kotlin/com/readmates/shared/security/RequestIdentityHmac.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/model/AdminCommandIdentity.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandIdentityService.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandIdentityServiceTest.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `.env.example`

**Interfaces:**

```kotlin
data class PlatformAdminCommandIdentity(
    val platformAdminUserId: UUID,
    val commandType: String,
    val targetType: String,
    val targetId: String,
    val idempotencyKey: String,
)

data class AdminCommandDigest(
    val schemaVersion: String,
    val digestKeyVersion: Int,
    val idempotencyKeyHmac: ByteArray,
    val requestHmac: ByteArray,
)

data class AdminCommandDigestSet(
    val current: AdminCommandDigest,
    val lookupCandidates: List<AdminCommandDigest>,
    val aliasCandidates: List<AdminCommandDigest>,
    val writePreviousAlias: Boolean,
)

interface CanonicalAdminCommandRequest {
    val schemaVersion: String
    fun canonicalFields(): List<Pair<String, String>>
}
```

Canonicalization applies NFC, locale-independent ASCII lowercase command/target tokens, explicit UTF-8 byte framing, field-name sorting, length prefixes, and command-specific schema version. `targetId` is a lowercase stable UUID or lowercase documented synthetic slot such as `new-club`; free text is included in the request HMAC but never persisted.

`AdminCommandDigest`는 한 key version의 alias material이고 `AdminCommandDigestSet`은 raw key를 persistence 밖에 둔 rotation envelope다. `current`는 caller가 새 immutable domain receipt에 연결할 safe digest이며 `lookupCandidates`와 `aliasCandidates` 모두에 반드시 포함된다. `lookupCandidates`는 current와 lookup-capable previous version을 version 오름차순으로 담는다. `aliasCandidates`는 current를 항상 포함하고 `writePreviousAlias=true`인 overlap 동안에만 previous도 포함한다. Old-version writer drain이 확인되면 flag를 `false`로 바꾸지만 previous digest는 response-loss lookup을 위해 `lookupCandidates`에 유지한다. `aliasCandidates`는 `lookupCandidates`의 ordered subset이어야 하며 둘 다 version duplicate를 거절한다.

- [ ] **Step 1: Write RED canonicalization tests.** Cover Unicode NFC equivalence, field-order invariance, absent vs empty distinction, delimiter collision, target/actor/command separation, same/different key behavior, key rotation, unknown/retired key, constant-time verification path, and log capture proving no raw inputs.
- [ ] **Step 2: Run RED.** Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.adminmutation.application.service.AdminCommandIdentityServiceTest`; expected FAIL.
- [ ] **Step 3: Implement by composing `RequestIdentityHmac`.** Do not duplicate secret parsing or create a second cryptographic algorithm.
- [ ] **Step 4: Run GREEN and config validation.** Run the Task 2 command and `./server/gradlew -p server unitTest --tests '*Configuration*Test'`; expected PASS.
- [ ] **Step 5: Commit.** Commit: `feat(server): add canonical admin command identity`

### Task 3: Implement atomic claim, replay, conflict, and completion

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/model/AdminCommandClaim.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/port/out/AdminCommandIdempotencyPort.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandIdempotencyService.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/adapter/out/persistence/JdbcAdminCommandIdempotencyAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/adapter/out/persistence/AdminCommandIdempotencyRows.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandIdempotencyServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/adapter/out/persistence/AdminCommandIdempotencyConcurrencyTest.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/config/AdminCommandIdempotencyProperties.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/config/AdminCommandIdempotencyPropertiesTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/model/AdminCommandIdentity.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandIdentityService.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adminmutation/config/AdminCommandIdentityProperties.kt`
- Modify: `server/src/test/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandIdentityServiceTest.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `.env.example`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`

**Interfaces:**

```kotlin
data class AdminCommandScope(
    val platformAdminUserId: UUID,
    val commandType: String,
    val targetType: String,
    val targetId: String,
)

data class AdminCommandIdentityEnvelope(
    val scope: AdminCommandScope,
    val digests: AdminCommandDigestSet,
)

data class AdminCommandClaimAttempt(
    val claimId: UUID,
    val claimToken: UUID,
    val canonicalSchemaVersion: String,
    val claimedAt: Instant,
    val initialExpiresAt: Instant,
)

sealed interface AdminCommandClaimResult {
    data class Claimed(
        val claimId: UUID,
        val claimToken: UUID,
        val currentDigest: AdminCommandDigest,
    ) : AdminCommandClaimResult
    data class Completed(val receiptType: String, val receiptId: String) : AdminCommandClaimResult
    data object InProgress : AdminCommandClaimResult
    data object Conflict : AdminCommandClaimResult
}

interface AdminCommandIdempotencyPort {
    fun claim(
        scope: AdminCommandScope,
        attempt: AdminCommandClaimAttempt,
        digests: AdminCommandDigestSet,
    ): AdminCommandClaimResult

    fun complete(
        claimId: UUID,
        claimToken: UUID,
        receiptType: String,
        receiptId: String,
        completedAt: Instant,
        retention: Duration,
    ): Boolean
}
```

`PlatformAdminCommandIdentity`와 raw idempotency key는 `AdminCommandIdentityService`가 한 번 canonicalize/HMAC하여 `AdminCommandIdentityEnvelope`로 바꾼 뒤 persistence 경계를 넘지 않는다. 이 envelope의 canonical `AdminCommandScope`를 사용하므로 uppercase UUID 입력도 lowercase UUID retry와 같은 operational scope에 수렴하고, canonicalized command/target token만 저장된다. `AdminCommandIdempotencyPort`는 stripped `AdminCommandScope`, generated `AdminCommandClaimAttempt`, HMAC-only `AdminCommandDigestSet`만 받는다. A successful `Claimed` returns the set's `currentDigest` so downstream immutable domain receipts can persist the safe versioned digest without recomputing from raw input. The service exposes claim primitives to domain application services; it does not open a nested transaction. Domain code must claim, perform effect, insert immutable receipt/audit, and complete the pointer inside one outer transaction. A response-loss retry obtains `Completed` and reauthorizes before loading the domain receipt. A committed `IN_PROGRESS` returns `InProgress` and is never automatically taken over or failed.

- [ ] **Step 1: Write RED unit state-machine/config tests.** Cover digest-set invariants, overlap dual-write, drained current-only alias write with previous lookup, first claim, either-version replay, live/committed `IN_PROGRESS` fail-closed, identical completed replay, conflicting request HMAC, stale-token completion, invalid receipt pointer, and rejection of retention below 24 hours. Assert the port never accepts `PlatformAdminCommandIdentity` or a raw key and no failed/takeover transition exists.
- [ ] **Step 2: Write RED two-connection integration tests.** Synchronize concurrent overlapping-version claims with latches; assert exactly one claim, aliases from both versions point to it, and savepoint rollback removes a partial candidate reservation before duplicate reconciliation. For every `aliasCandidate`, upsert then lock `platform_admin_command_digest_key_state` in globally sorted key-version order inside the same savepoint and outer transaction as claim/alias reservation, update `last_referenced_at`, and clear `unreferenced_since`; assert rollback also restores key-state values. Assert outer transaction rollback removes the incomplete claim, and completion plus a fixture domain receipt commit atomically.
- [ ] **Step 3: Write RED completion-retention integration tests.** Create a claim with a short initial expiry, advance beyond that expiry while the domain transaction remains valid, and complete with the original claim token. Assert completion succeeds, stores the immutable receipt pointer, and sets `expires_at` exactly to `completedAt + retention` with retention at least 24 hours; the claim-created expiry must not shorten completed retention.
- [ ] **Step 4: Run RED.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyServiceTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.shared.adminmutation.adapter.out.persistence.AdminCommandIdempotencyConcurrencyTest`

  Expected: FAIL.
- [ ] **Step 5: Implement stripped persistence inputs, sorted key-state/alias reservation with a savepoint, conditional completion SQL, and typed service outcomes.** On any key-state or alias duplicate, rollback the whole candidate reservation to the savepoint before reconciling the existing claim. Completion CAS matches claim ID/token/state and resets expiry from completion time. Use affected-row counts; never catch all exceptions as idempotent success and never add origin-claim lease takeover.
- [ ] **Step 6: Run GREEN.** Run both Task 3 commands plus `AdminCommandIdempotencyPropertiesTest`; expected PASS.
- [ ] **Step 7: Commit.** Commit: `feat(server): implement atomic admin command claims`

### Task 4: Add retention, observability, and a full security-chain harness

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/adapter/in/scheduling/AdminCommandIdempotencyPurgeScheduler.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/adapter/out/observability/AdminCommandMetrics.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/model/AdminCommandDigestKeyRetirement.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandDigestKeyRetirementService.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandIdempotencyMaintenanceService.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/port/in/PurgeExpiredAdminCommandClaimsUseCase.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/port/out/AdminCommandObservability.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/config/AdminCommandDigestKeyStartupValidator.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/adapter/in/scheduling/AdminCommandIdempotencyPurgeSchedulerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/adapter/out/observability/AdminCommandMetricsTest.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandDigestKeyRetirementServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/adapter/out/persistence/AdminCommandDigestKeyRetirementConcurrencyTest.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/config/AdminCommandDigestKeyStartupIntegrationTest.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`
- Create: `server/src/test/kotlin/com/readmatesharness/PlatformAdminBffSecurityHarnessApplication.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/port/out/AdminCommandIdempotencyPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adminmutation/adapter/out/persistence/JdbcAdminCommandIdempotencyAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adminmutation/config/AdminCommandIdempotencyProperties.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `server/src/main/resources/application-test.yml`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`
- Modify: `server/src/test/resources/application.yml`

The shared security test supplies real Spring Security, BFF secret header, canonical Origin/Referer, session principal, `CurrentPlatformAdmin` resolution, and method/path cases. Domain plans extend its parameter matrix; they do not replace it with standalone matcher tests.

`AdminCommandIdempotencyPurgeScheduler` enters through `PurgeExpiredAdminCommandClaimsUseCase`; `AdminCommandIdempotencyMaintenanceService` owns the transaction. Every scheduled pass first locks digest-key-state rows in global version order, then purges only a bounded expired `COMPLETED` batch. While `writePreviousAlias=true`, the same transaction invalidates any previous-key `unreferenced_since`; an idle dual-write overlap can never pre-age retirement evidence. Only after old writers drain and `writePreviousAlias=false` does the post-delete locked assessment start or retain a fresh zero-alias buffer, even when the delete count is zero, and emit its retirement outcome metric once. Fresh claims prepare every lookup digest-key-state slot by sorted reference/no-op upsert and lock before claim or alias rows. Existing replay/backfill and a duplicate loser likewise no-op-upsert and lock all lookup slots in global order before locking claim/alias rows; an actual alias reservation updates reference state inside its savepoint. This avoids missing-row repeatable-read gap prelocks and prevents the scheduler's alias cascade from deadlocking with initial reservation, duplicate reconciliation, or expired completed replay during rotation and drain. The JDBC adapter never opens a nested transaction.

`AdminCommandIdentityStartupValidator` remains the configuration syntax/secret guard. It cannot prove that persisted aliases are replayable or that a removed key is safely retired. `AdminCommandDigestKeyStartupValidator` is a separate DB-backed startup gate. Mark it with Spring Boot's `@DependsOnDatabaseInitialization` and run its check from `SmartInitializingSingleton` (or an equivalently ordered fail-fast lifecycle) so Flyway has created V57 before any query and a failure aborts context startup before readiness.

The DB-backed check runs in one transaction. It locks `platform_admin_command_digest_key_state` rows in globally sorted version order, then re-reads distinct alias versions and alias counts while those locks are held. Every referenced alias version must have a state row and a configured current or non-blank previous key; any unknown or unconfigured referenced version fails. A historical version removed from config, including a non-zero `previousKeyVersion` whose key is now blank, must retain its state row and may pass only when the locked alias count is zero, `unreferenced_since` is non-null and not before `last_referenced_at`, and the configured buffer of at least 24 hours has elapsed. A current-only first deployment with no persisted alias/state is valid. Missing rows, inconsistent snapshots, query/transaction errors, and unavailable DB all propagate as startup failure; a timestamp-only or configuration-only check is insufficient.

- [ ] **Step 1: Write RED purge/key-retirement/metric tests.** Keep every `IN_PROGRESS` row and non-expired `COMPLETED` row; purge a bounded batch of expired `COMPLETED` claims and their aliases; prove receipt fixture survives. Retirement locks digest-key-state rows in the same global version order as claim reservation, returns `REFERENCED` while any alias exists, starts/retains `unreferenced_since` only at zero aliases after `writePreviousAlias=false`, returns `BUFFER_PENDING` before 24 hours, and returns `REMOVABLE` only after a fresh locked zero-alias check at or beyond 24 hours. Prove dual-write overlap clears prior zero-alias evidence and a later drain transition starts a new full buffer. Assert only bounded metric tags.
- [ ] **Step 2: Write RED two-connection claim-vs-retirement and claim/replay-vs-maintenance tests.** Cover both lock orders. If claim reservation or expired completed replay wins, retirement and scheduled maintenance wait; replay backfills the current alias before purge. If retirement or maintenance wins, a concurrent still-authorized claim waits and clears `unreferenced_since`, while a replay whose expired claim was purged re-reads under the key-state lock and creates a fresh claim instead of deadlocking or treating corruption as success. In drain mode, force a fresh contender's optimistic empty read, commit the winner, and hold the duplicate exception while maintenance competes; the loser must already own previous/current lookup state in sorted order before it locks the winner alias. Prove lookup key-state locks precede claim/replay claim/alias locks, the losing future is blocked before releasing the winning transaction, and all operations finish without deadlock. After old writers drain and `writePreviousAlias=false`, previous remains lookup-capable but no claim path may create a new previous alias; only then may a fresh 24-hour zero-reference result authorize config key removal.
- [ ] **Step 3: Write RED Spring startup integration tests.** Start real Spring contexts against MySQL rather than invoking only the validator method. Assert startup rejects premature previous-key removal with live aliases, an unknown referenced alias version, a referenced current version whose key is blank even under explicit local/test allowance, a referenced or declared removed version with missing key-state row, zero aliases with a pending `<24h` buffer, and any DB/reference query failure. Assert startup succeeds with current·previous configured and referenced, with an empty first-deployment database and configured current key, and with a removed previous version whose locked zero-alias `unreferenced_since` evidence has aged by the full configured `>=24h` buffer. Prove Flyway-before-validator ordering by starting the first-deployment child context against a fresh unmigrated MySQL database and asserting its V57 table/history after startup.
- [ ] **Step 4: Write the initial RED security harness.** Prove a representative admin POST rejects missing/wrong BFF secret, cross-site origin, inactive/non-admin actor, and insufficient capability; accepts the exact same-origin BFF request.
- [ ] **Step 5: Run RED.** Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.adminmutation.adapter.in.scheduling.AdminCommandIdempotencyPurgeSchedulerTest --tests com.readmates.shared.adminmutation.adapter.out.observability.AdminCommandMetricsTest --tests com.readmates.shared.adminmutation.application.service.AdminCommandDigestKeyRetirementServiceTest --tests com.readmates.auth.api.PlatformAdminBffSecurityTest`.

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.shared.adminmutation.adapter.out.persistence.AdminCommandDigestKeyRetirementConcurrencyTest`; expected FAIL.

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.shared.adminmutation.config.AdminCommandDigestKeyStartupIntegrationTest`; expected FAIL.
- [ ] **Step 6: Implement completed-only bounded purge, serialized fail-closed key retirement and startup validation, metrics, and reusable test fixture.** The adapter must provide one atomic locked startup inspection rather than separate unlocked reference/state snapshots. Retirement reports eligibility; key removal is a later configuration rollout step after writer drain and the locked 24-hour gate. Do not add a generic production controller or purge/take over committed `IN_PROGRESS` claims.
- [ ] **Step 7: Run GREEN.** Run all three Task 4 commands; expected PASS.
- [ ] **Step 8: Commit.** Commit: `feat(server): operate admin command claims safely`

### Task 5: Verify substrate acceptance before domain adoption

**Files:**
- Modify only if operator behavior changes: `CHANGELOG.md`

- [ ] **Step 1: Run focused tests repeatedly.** Run the Task 2–4 unit and integration commands three times; expected deterministic PASS with no flaky concurrency result.
- [ ] **Step 2: Run MySQL and server gates.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest --tests com.readmates.shared.adminmutation.adapter.out.persistence.AdminCommandIdempotencyConcurrencyTest --tests com.readmates.shared.adminmutation.adapter.out.persistence.AdminCommandDigestKeyRetirementConcurrencyTest --tests com.readmates.shared.adminmutation.config.AdminCommandDigestKeyStartupIntegrationTest`

  Run: `./scripts/server-ci-check.sh`

  Expected: PASS.
- [ ] **Step 3: Inspect data/log safety.** Search migration, model, DTO, logs, and captured SQL parameters for raw `reason|email|idempotencyKey|canonicalRequest`; only in-memory names and redacted HMAC columns may remain.
- [ ] **Step 4: Run hygiene.** Run: `git diff --check` and `python3 scripts/agent-preflight.py --paths server/src/main/kotlin/com/readmates/shared/adminmutation --paths server/src/main/resources/db/mysql/migration/V57__platform_admin_command_idempotency.sql`; expected no errors.
- [ ] **Step 5: Commit acceptance-only changes if any.** Commit: `test(server): verify admin command substrate`
