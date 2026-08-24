# Platform Admin Safe Command Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플랫폼 어드민의 위험 명령이 재시도·동시 실행·응답 유실 상황에서도 중복 효과를 만들지 않도록, 도메인별 preview/receipt가 공유할 최소 운영 idempotency와 HMAC 기반을 제공한다.

**Architecture:** Flyway V57은 mutable claim `platform_admin_command_idempotency`, key-version alias `platform_admin_command_idempotency_keys`, retirement state `platform_admin_command_digest_key_state`를 분리한다. `shared/mutation`의 versioned canonical HMAC primitive를 재사용하되 platform-admin identity는 host membership identity와 분리한다. 각 club/notification/AI/support application service가 자기 transaction 안에서 모든 active-key alias를 같은 claim에 예약하고 자기 immutable receipt와 함께 완료하며, 범용 명령 controller·executor·receipt body는 만들지 않는다.

**Tech Stack:** Kotlin, Spring Boot, JDBC, MySQL 8, Flyway, JUnit 5, Testcontainers, Micrometer.

**Spec:** `docs/superpowers/specs/2026-08-22-readmates-platform-admin-service-spine-redesign-design.md`

ADR impact: implements proposed ADR-0040; constraining reference — ADR-0028, ADR-0029, ADR-0033

## Global Constraints

- Prerequisite: host/public safety migrations V52–V56 must land first. If current main does not contain them, stop and rebase this plan; never edit or renumber an applied migration.
- V57 stores no raw reason, email, name, URL, request JSON, canonical input, idempotency key, or plaintext digest.
- Logical identity is `(platformAdminUserId, commandType, targetType, targetId, idempotencyKey)`. Plaintext key는 저장하지 않고 key version별 HMAC alias만 같은 claim에 연결한다. It never uses club membership IDs.
- Same key + same canonical request converges to the same domain receipt. Same key + different request is `409 IDEMPOTENCY_CONFLICT`. A live claim is `409 COMMAND_IN_PROGRESS` with bounded retry guidance.
- Digest and idempotency-key fingerprints use purpose-separated, versioned HMAC and constant-time comparison. Rotation overlap에서는 current·previous alias를 모두 예약하며 unknown or retired versions fail closed.
- Origin claim states are only `IN_PROGRESS|COMPLETED`. Persisted lease takeover와 bare `FAILED`는 없고 committed `IN_PROGRESS`는 fail closed한다. L3 lease는 origin commit 이후 convergence work에만 존재한다.
- The operational row is not business audit. Domain-owned immutable receipts and audit events remain the only user-visible proof.
- Application services own transaction boundaries. Controller and adapter must not orchestrate multi-port business transactions.
- Purge removes only expired `COMPLETED` claims after at least 24 hours and cascades only to their operational aliases, never to immutable receipts. Key retirement also requires no remaining alias plus a 24-hour unreferenced buffer.
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

interface CanonicalAdminCommandRequest {
    val schemaVersion: String
    fun canonicalFields(): List<Pair<String, String>>
}
```

Canonicalization applies NFC, explicit UTF-8 byte framing, field-name sorting, length prefixes, and command-specific schema version. `targetId` is a stable UUID or documented synthetic slot such as `new-club`; free text is included in the request HMAC but never persisted.

`AdminCommandDigest`는 한 key version의 alias material이다. Task 3 claim reservation은 configured current·previous version 각각의 digest를 version 오름차순으로 계산해야 하며, 하나의 current digest만 stable claim identity로 취급하지 않는다.

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
- Modify: `server/src/main/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandIdentityService.kt`
- Modify: `server/src/test/kotlin/com/readmates/shared/adminmutation/application/service/AdminCommandIdentityServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`

**Interfaces:**

```kotlin
sealed interface AdminCommandClaimResult {
    data class Claimed(val claimId: UUID, val claimToken: UUID) : AdminCommandClaimResult
    data class Completed(val receiptType: String, val receiptId: String) : AdminCommandClaimResult
    data object InProgress : AdminCommandClaimResult
    data object Conflict : AdminCommandClaimResult
}

interface AdminCommandIdempotencyPort {
    fun claim(identity: PlatformAdminCommandIdentity, aliases: List<AdminCommandDigest>, now: Instant): AdminCommandClaimResult
    fun complete(claimId: UUID, claimToken: UUID, receiptType: String, receiptId: String, now: Instant): Boolean
}
```

The service exposes claim primitives to domain application services; it does not open a nested transaction. Domain code must claim, perform effect, insert immutable receipt/audit, and complete the pointer inside one outer transaction. A response-loss retry obtains `Completed` and reauthorizes before loading the domain receipt. A committed `IN_PROGRESS` returns `InProgress` and is never automatically taken over or failed.

- [ ] **Step 1: Write RED unit state-machine tests.** Cover first claim with sorted current·previous aliases, either-version replay, live/committed `IN_PROGRESS` fail-closed, identical completed replay, conflicting request HMAC, stale-token completion, and invalid receipt pointer. Assert no failed/takeover transition exists.
- [ ] **Step 2: Write RED two-connection integration tests.** Synchronize concurrent overlapping-version claims with latches; assert exactly one claim, aliases from both versions point to it, savepoint rollback removes a partial candidate reservation before duplicate reconciliation, outer transaction rollback removes the incomplete claim, and completion plus a fixture domain receipt commit atomically.
- [ ] **Step 3: Run RED.**

  Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyServiceTest`

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.shared.adminmutation.adapter.out.persistence.AdminCommandIdempotencyConcurrencyTest`

  Expected: FAIL.
- [ ] **Step 4: Implement sorted alias reservation with a savepoint, conditional SQL, and typed service outcomes.** On any alias duplicate, rollback the whole candidate reservation to the savepoint before reconciling the existing claim. Use affected-row counts; never catch all exceptions as idempotent success and never add origin-claim lease takeover.
- [ ] **Step 5: Run GREEN.** Run both Task 3 commands; expected PASS.
- [ ] **Step 6: Commit.** Commit: `feat(server): implement atomic admin command claims`

### Task 4: Add retention, observability, and a full security-chain harness

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/adapter/in/scheduling/AdminCommandIdempotencyPurgeScheduler.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adminmutation/adapter/out/observability/AdminCommandMetrics.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/adapter/in/scheduling/AdminCommandIdempotencyPurgeSchedulerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/adminmutation/adapter/out/observability/AdminCommandMetricsTest.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/api/PlatformAdminBffSecurityTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureInventoryTest.kt`

The shared security test supplies real Spring Security, BFF secret header, canonical Origin/Referer, session principal, `CurrentPlatformAdmin` resolution, and method/path cases. Domain plans extend its parameter matrix; they do not replace it with standalone matcher tests.

- [ ] **Step 1: Write RED purge/key-retirement/metric tests.** Keep every `IN_PROGRESS` row and non-expired `COMPLETED` row; purge a bounded batch of expired `COMPLETED` claims and their aliases; prove receipt fixture survives. Reject key retirement while an alias exists or until `unreferenced_since` has aged at least 24 hours. Assert only bounded tags.
- [ ] **Step 2: Write the initial RED security harness.** Prove a representative admin POST rejects missing/wrong BFF secret, cross-site origin, inactive/non-admin actor, and insufficient capability; accepts the exact same-origin BFF request.
- [ ] **Step 3: Run RED.** Run: `./server/gradlew -p server unitTest --tests com.readmates.shared.adminmutation.adapter.in.scheduling.AdminCommandIdempotencyPurgeSchedulerTest --tests com.readmates.shared.adminmutation.adapter.out.observability.AdminCommandMetricsTest --tests com.readmates.auth.api.PlatformAdminBffSecurityTest`; expected FAIL.
- [ ] **Step 4: Implement completed-only bounded purge, fail-closed key retirement, metrics, and reusable test fixture.** Do not add a generic production controller or purge/take over committed `IN_PROGRESS` claims.
- [ ] **Step 5: Run GREEN.** Run the Task 4 command; expected PASS.
- [ ] **Step 6: Commit.** Commit: `feat(server): operate admin command claims safely`

### Task 5: Verify substrate acceptance before domain adoption

**Files:**
- Modify only if operator behavior changes: `CHANGELOG.md`

- [ ] **Step 1: Run focused tests repeatedly.** Run the Task 2–4 unit and integration commands three times; expected deterministic PASS with no flaky concurrency result.
- [ ] **Step 2: Run MySQL and server gates.**

  Run: `./server/gradlew -p server integrationTest --tests com.readmates.support.MySqlFlywayMigrationTest --tests com.readmates.shared.adminmutation.adapter.out.persistence.AdminCommandIdempotencyConcurrencyTest`

  Run: `./scripts/server-ci-check.sh`

  Expected: PASS.
- [ ] **Step 3: Inspect data/log safety.** Search migration, model, DTO, logs, and captured SQL parameters for raw `reason|email|idempotencyKey|canonicalRequest`; only in-memory names and redacted HMAC columns may remain.
- [ ] **Step 4: Run hygiene.** Run: `git diff --check` and `python3 scripts/agent-preflight.py --paths server/src/main/kotlin/com/readmates/shared/adminmutation --paths server/src/main/resources/db/mysql/migration/V57__platform_admin_command_idempotency.sql`; expected no errors.
- [ ] **Step 5: Commit acceptance-only changes if any.** Commit: `test(server): verify admin command substrate`
