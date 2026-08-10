# ReadMates Backend Quality Phase 1 — AI Kafka And Redis Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI-generation Kafka retry exhaustion terminate or defer Redis jobs truthfully, add a restart-safe bounded recovery path, and make Redis queue observability distinguish an unavailable probe from an empty queue.

**Architecture:** An application-owned recovery service decides PENDING versus RUNNING recovery from hash-only recovery metadata. One Redis atomic recovery port compares the observed status and `lastUpdatedAt`, checks the provider-attempt ledger, and performs the job-status/admission-receipt/index transition in one Lua execution. Per-job admission receipts and daily/minute window tokens prevent a late PENDING recovery from decrementing a recreated counter window. A Kafka inbound recoverer returns only after a durable recovery/no-op result and otherwise throws so the offset is not committed. A typed scheduler reuses the same application operation record-by-record, while a scheduled probe sampler publishes one immutable snapshot that three I/O-free gauges read without turning Redis failure into false zero.

**Tech Stack:** Kotlin 2.4, Spring Boot 4 / Spring Kafka 4, Redis + Lua, Kafka/Testcontainers, Micrometer/Prometheus, JUnit 5, AssertJ.

## Global Constraints

- Preserve existing provider request-timeout, reservation, stale-in-flight `UNKNOWN`, three-call cap, grounded validation/repair, commit receipt, API/BFF/frontend, authorization, and notification behavior.
- Do not add an AI DLT. A DLT cannot atomically repair Redis job/admission state and would create a second recovery authority.
- Generic Kafka failures use explicit total attempts `10` and fixed delay `5s`. Listener-thrown `ProviderCallStillInFlightException` remains unlimited with a delay equal to the provider request timeout. A recoverer-thrown deferred/persistence failure is rethrown; Spring resets recovery state and redelivers, and the next listener attempt reclassifies current Redis state. Do not claim the backoff function sees recoverer exceptions.
- Add `readmates.aigen.job.processing-deadline=20m`, `recovery-fixed-delay=1m`, `recovery-batch-size=50`, `recovery-index-repair-batch-size=500`, `recovery-index-repair-max-members=5000`, and `queue-probe-fixed-delay=30s`.
- `processing-deadline` must be greater than or equal to `max-poll-interval + consumer-retry-delay * (consumer-max-attempts - 1)`, strictly less than `redis-ttl`, and between `1m..2h`.
- `redis-ttl` is `1h..24h` with exact whole-second precision; `send-timeout` is exact milliseconds in `1ms..30s`; generic retry delay is exact milliseconds in `1ms..1m`; attempts are `1..100`; recovery/probe delays are exact milliseconds in `1s..10m`; recovery batch is `1..500`; repair batch is `1..5000`; repair maximum is `batch..50000`; maximum LLM calls remains `1..3`.
- Require `ceil(recovery-index-repair-max-members / recovery-index-repair-batch-size) * recovery-fixed-delay < processing-deadline`. Above the declared active-member ceiling is an explicit unavailable/failed repair condition and alert, never a silent bounded-convergence claim.
- Admission creates a per-job receipt that stores immutable daily/minute window tokens and charged flags. A PENDING recovery refunds a counter only when the receipt token still matches the current window token and the counter is positive; an expired/recreated window is never decremented. A legacy job without a receipt still terminalizes but records `recovered_pending_unaccounted` and does not guess a refund. A RUNNING recovery retains consumed host/provider call/cost evidence. Both delete only a club admission lease whose value matches this job and neither terminal transition depends on a lease/counter being present.
- A RUNNING recovery's final Lua reconciles provider attempts with `startedAtEpochMs < providerStaleBefore` to `UNKNOWN/ESTIMATED_UNKNOWN`, then checks the same provider-attempt hash for any remaining `IN_FLIGHT`. A valid non-stale attempt returns `DEFERRED_IN_FLIGHT`; a missing/malformed attempt timestamp returns `CORRUPT`. Both preserve job status/admission/indexes. Redis script serialization guarantees reservation-first means recovery defers and recovery-first means the later reservation's RUNNING CAS fails.
- Scheduler selection carries the exact observed `lastUpdatedAt`; final recovery CAS compares both status and timestamp. `STATE_CHANGED` reloads and classifies terminal/missing as a durable no-op and still-active PENDING/RUNNING as deferred. The processing cutoff is inclusive `lastUpdatedAt <= now - processingDeadline`; provider-staleness remains its existing strict `<` contract.
- Use one injected UTC `Clock` instant per recovery wave. All JVM-owned Redis status timestamps use that Clock; missing or malformed persisted timestamps fail closed and are never synthesized from wall clock.
- Recovery logs, metrics, docs, fixtures, and public artifacts contain no transcript, prompt, result, evidence, member data, provider body, secret, private domain, or local absolute path.
- Redis recovery is explicitly single-node/standalone only: all keys participating in each Lua transition are part of the current single Redis authority. This plan makes no Redis Cluster cross-slot claim.
- No live provider call, production Redis/Kafka mutation, email, remote push, PR, tag, or deploy during task execution.
- All concurrent tests use Redis/Kafka state, offsets, Awaitility, latches, or deterministic barriers; do not use `Thread.sleep`. At each commit, stage only the exact reviewed files listed by that task and prove `git diff --cached --name-only` matches the task allowlist before committing.

---

## Failure Contract And Chosen Approach

Current `DefaultErrorHandler()` uses Spring Kafka's implicit zero-delay nine retries and a logging-only recoverer. When those retries exhaust, the handler treats the record as recovered and commits the offset even though Redis can remain PENDING or RUNNING. Restart also resets the in-memory attempt counter.

The approved recovery sequence is:

```text
Kafka generic exhaustion or scheduled deadline
  -> load hash-only recovery metadata (never require/delete payload)
  -> PENDING:
       atomic CAS (PENDING, observed lastUpdatedAt) -> FAILED(ASYNC_PROCESSING_EXHAUSTED)
       + conditionally refund only matching receipt/window counters
       + delete only matching lease and remove global/club/processing indexes
  -> RUNNING:
       final Lua reconciles strict-stale provider calls to UNKNOWN
       same Lua checks provider hash; live -> DEFER, malformed -> CORRUPT; throw/no commit
       atomic CAS (RUNNING, observed lastUpdatedAt) -> FAILED(ASYNC_PROCESSING_EXHAUSTED)
       + retain counters/cost/call slots
       + delete only matching lease and remove global/club/processing indexes
  -> state changed -> reload; terminal/missing no-op, active defer
  -> corrupt hash -> preserve evidence, quarantine processing-index member, fixed failure result
  -> missing hash -> remove stale index member, fixed missing result
  -> only after a durable result may the Kafka recoverer return
```

Rejected alternatives:

- Logging recoverer only: loses the record and strands Redis state.
- DLT: records transport failure but cannot atomically settle job/admission/provider reservations.
- Kafka attempt budget only: restarts reset it, so it has no wall-clock recovery guarantee.
- Scheduler-only recovery: leaves Kafka offsets retrying indefinitely and hides immediate exhaustion.

---

### Task 1: Typed AI Processing And Recovery Configuration

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationKafkaProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationConfigValidator.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `.env.example`
- Modify: `.github/workflows/sync-config.yml`
- Modify: `scripts/sync-config/import-from-prod-env.sh`
- Modify: `scripts/validate-production-ai-config.sh`
- Modify: `scripts/verify-production-ai-config-fixtures.sh`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationPropertiesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationConfigValidatorTest.kt`
- Modify only positive configuration fixtures that enable AIGEN/Kafka.

**Interfaces:**

- Produces `AiGenerationKafkaProperties.consumerRetryDelay: Duration` and `consumerMaxAttempts: Int`.
- Produces `AiGenerationProperties.Job.processingDeadline`, `recoveryFixedDelay`, `recoveryBatchSize`, `recoveryIndexRepairBatchSize`, `recoveryIndexRepairMaxMembers`, and `queueProbeFixedDelay`.
- Later tasks consume the exact values; no scheduler or handler may read raw environment properties.

- [ ] **Step 1: Write startup RED tests for every local bound.**

  Add table-driven binding tests for zero, negative, below-minimum, above-maximum, and precision truncation. Include `500us`/`PT0.0005S` for millisecond fields, `1500ms` for whole-second TTL, attempts `0/101`, batches `0/501`, repair batch `0/5001`, repair maximum below batch/above `50000`, deadline `59s/121m`, probe delay boundaries, and exact accepted boundaries.

- [ ] **Step 2: Run the property lane and capture RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.config.AiGenerationPropertiesTest \
    --tests com.readmates.aigen.config.AiGenerationConfigValidatorTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Expected: invalid values bind/start successfully because the new fields and cross-constraints do not exist.

- [ ] **Step 3: Add immutable validated properties.**

  Use defaults:

  ```kotlin
  val consumerRetryDelay: Duration = Duration.ofSeconds(5)
  val consumerMaxAttempts: Int = 10

  val processingDeadline: Duration = Duration.ofMinutes(20)
  val recoveryFixedDelay: Duration = Duration.ofMinutes(1)
  val recoveryBatchSize: Int = 50
  val recoveryIndexRepairBatchSize: Int = 500
  val recoveryIndexRepairMaxMembers: Int = 5000
  val queueProbeFixedDelay: Duration = Duration.ofSeconds(30)
  ```

  Validate `sendTimeout`, retry delay, recovery delay, and max-poll as exact positive milliseconds; Redis TTL as exact positive seconds; and all fixed ranges from Global Constraints. Keep actionable property-path messages.

- [ ] **Step 4: Add cross-property startup validation.**

  Compute without unit coercion:

  ```kotlin
  val retryWindow = kafka.consumerRetryDelay.multipliedBy((kafka.consumerMaxAttempts - 1).toLong())
  val minimumDeadline = kafka.maxPollInterval.plus(retryWindow)
  check(properties.job.processingDeadline >= minimumDeadline)
  check(properties.job.processingDeadline < properties.job.redisTtl)
  val repairWaves = ceilDiv(
      properties.job.recoveryIndexRepairMaxMembers,
      properties.job.recoveryIndexRepairBatchSize,
  )
  check(properties.job.recoveryFixedDelay.multipliedBy(repairWaves.toLong()) < properties.job.processingDeadline)
  ```

  Preserve the existing provider-call processing-budget check.

- [ ] **Step 5: Render public configuration.**

  Add public-safe variables:

  ```text
  READMATES_AIGEN_KAFKA_CONSUMER_RETRY_DELAY=5s
  READMATES_AIGEN_KAFKA_CONSUMER_MAX_ATTEMPTS=10
  READMATES_AIGEN_PROCESSING_DEADLINE=20m
  READMATES_AIGEN_RECOVERY_FIXED_DELAY=1m
  READMATES_AIGEN_RECOVERY_BATCH_SIZE=50
  READMATES_AIGEN_RECOVERY_INDEX_REPAIR_BATCH_SIZE=500
  READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS=5000
  READMATES_AIGEN_QUEUE_PROBE_FIXED_DELAY=30s
  ```

  Keep application defaults, `.env.example`, sync workflow, production-env importer allowlist/rendering, and production AI validator semantically aligned. Add hermetic production-config fixtures for omission, malformed units, convergence failure, and exact accepted defaults.

- [ ] **Step 6: Run focused GREEN and config agreement scans.**

  Re-run Step 2, then scan all eight values across every public/production configuration surface. Run actionlint/YAML parsing and `./scripts/verify-production-ai-config-fixtures.sh`; prove the importer and validator reject drift rather than silently defaulting it.

- [ ] **Step 7: Commit.**

  Stage with explicit `git add -- <path...>` arguments containing only the Task 1 Files list, then compare `git diff --cached --name-only` to that allowlist.

  ```bash
  git commit -m "refactor(server): type AI recovery runtime"
  ```

---

### Task 2: Deterministic Redis Failure Recovery And Restart Index

**Files:**

- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationRecoveryUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationFailureRecoveryPort.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationFailureRecoveryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisRecordCodec.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisIndexes.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisScripts.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/GroundedAiGenerationRedisScripts.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCounters.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/ProviderCallReservationRedisScripts.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFailureRecoveryServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationFailureRecoveryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCountersTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationMetricsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/MetricLabelsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGroundedAiGenerationJobStoreTest.kt`
- Modify direct fake/job fixtures mechanically for new required methods.

**Interfaces:**

```kotlin
interface RecoverExhaustedAiGenerationJobUseCase {
    fun recoverExhausted(jobId: UUID): AiGenerationRecoveryResult
}

interface RecoverStalledAiGenerationJobsUseCase {
    fun recoverStalledBatch(): List<AiGenerationRecoveryResult>
}

enum class AiGenerationRecoveryResult {
    RECOVERED_PENDING,
    RECOVERED_PENDING_UNACCOUNTED,
    RECOVERED_RUNNING,
    ALREADY_TERMINAL,
    MISSING,
    DEFERRED_IN_FLIGHT,
    DEFERRED_STATE_CHANGED,
    CORRUPT,
}

enum class AiGenerationRecoverySource { KAFKA, SCHEDULED }
```

`loadRecoveryMetadata(jobId)` reads only the job hash and never calls normal payload materialization/deletion. Its typed result distinguishes missing hash, valid metadata with `payloadPresent`, and corrupt metadata. The outbound recovery command contains job/host/club IDs, exact expected status and observed `lastUpdatedAt`, strict `providerStaleBefore`, fixed safe error, normalized `now`, TTL, and admission disposition `RELEASE_PENDING` or `COMPLETE_RUNNING`. A separate outbound `AiGenerationAtomicRecoveryResult` distinguishes `RECOVERED`, `RECOVERED_UNACCOUNTED`, `STATE_CHANGED`, `DEFERRED_IN_FLIGHT`, `CORRUPT`, and `MISSING`; the application reloads `STATE_CHANGED` and maps an active row to public `DEFERRED_STATE_CHANGED`.

- [ ] **Step 1: Write application RED tests.**

  Cover PENDING with current/expired/recreated counter windows, legacy PENDING without receipt, RUNNING without provider attempt, RUNNING stale attempt, RUNNING live attempt, terminal, missing hash, missing payload, corrupt hash, status/timestamp CAS loss, Redis exception, source ownership, fixed-cardinality metrics, and one-Clock behavior. Assert:

  - PENDING selects `RELEASE_PENDING`.
  - RUNNING passes the strict provider-stale cutoff and `COMPLETE_RUNNING` to the atomic port; it does not perform a separate reconciliation call.
  - live provider attempts yield a typed deferred result in the application core; only the Kafka adapter converts it to an exception.
  - missing payload never deletes an active job and does not block hash-only terminal recovery.
  - `STATE_CHANGED` reloads: terminal/missing is a durable no-op; still-active state refreshes the processing-index score to the newly observed `lastUpdatedAt` and returns `DEFERRED_STATE_CHANGED`.
  - corrupt rows are preserved, removed from the processing index, and added to a dedicated recovery-quarantine index with fixed reason/time; a bad first row cannot stop later records in the same scheduled batch.
  - Redis/provider recovery failure propagates; it never becomes success.
  - safe error is `ASYNC_PROCESSING_EXHAUSTED` with a fixed content-free message.
  - one per-job application invocation records exactly one `readmates.aigen.failure.recovery{source,result}` outcome after final classification and before returning or propagating; one repair page records exactly one separate `readmates.aigen.recovery.index.repair{result}` outcome; only fixed enums are tags.

- [ ] **Step 2: Run service RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.application.service.AiGenerationFailureRecoveryServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Expected: compile failure for missing use cases, result model, error code, and recovery port.

- [ ] **Step 3: Write real-Redis atomic RED tests.**

  Prove in one Redis-visible transition:

  - admission atomically writes a per-job receipt containing immutable daily/minute window tokens and charged flags alongside the existing counter increments/lease;
  - PENDING becomes FAILED, sets exact Clock timestamp/error, removes global-active/club-active/processing indexes, refunds daily/minute once only while the receipt token matches the current token and the counter is positive, and deletes only its matching admission lease;
  - before/equality/after the original 60-second minute window, a recreated minute counter is never decremented; after the 5-minute admission lease, a missing or newer lease never blocks terminalization or gets deleted; repeated recovery never refunds twice;
  - a legacy PENDING job without a receipt becomes FAILED with `RECOVERED_PENDING_UNACCOUNTED`, preserves counters, and emits the bounded result;
  - RUNNING becomes FAILED, removes global-active/club-active/processing indexes and its matching receipt/lease, but retains daily/minute/provider attempt/cost evidence;
  - RUNNING final Lua receives the provider-attempt hash, converts only strict-stale valid attempts to `UNKNOWN/ESTIMATED_UNKNOWN`, and returns `DEFERRED_IN_FLIGHT` if any valid-live or malformed-timestamp `:state=IN_FLIGHT` remains;
  - final CAS compares exact status and `lastUpdatedAt`, so a RUNNING-to-RUNNING progress refresh after scheduler selection yields `STATE_CHANGED` and never fails the active job;
  - repeated recovery changes nothing and never decrements twice.
  - CAS loss, missing job, mismatched/newer admission, and Redis failure do not claim success.
  - a crash/fault injected between the conceptual status/admission/index steps cannot expose a partial state because Lua owns the transition.

  Add deterministic two-client race tests with latches/barriers, not sleeps: reservation wins before recovery (recovery defers), recovery wins before reservation (reservation CAS fails), and progress timestamp refresh wins after stale selection (recovery returns state-changed). Assert no reachable state contains `FAILED` plus an `IN_FLIGHT` provider attempt.

- [ ] **Step 4: Implement the atomic recovery port in Redis.**

  Extend the cost-counter adapter's admission script to create daily/minute window-token keys and the per-job receipt in the same Redis execution as increments/lease. Tokens are opaque generations whose TTL is aligned with their counter window; whenever a counter key is absent, admission rotates its token before incrementing, even if a stale token key remains. The receipt TTL equals `redisTtl`. Recovery never recreates a missing token. Receipt deletion is the exactly-once refund guard: refund matching positive counters independently of whether the club lease is missing/newer, delete only a matching lease, then delete the receipt atomically. Route ordinary `releaseAdmission` through the same receipt/token-safe refund primitive so it also cannot decrement a recreated window. Preserve rolling compatibility for old jobs with no receipt.

  Create one narrow recovery Redis adapter whose Lua keys include the job hash, provider-attempt hash, admission receipt, daily/minute counter+token keys, matching club lease, global-active, club-active, processing-recovery, and session-recent structures. The script must CAS exact expected status plus observed `lastUpdatedAt`; for RUNNING it performs strict-stale reconciliation and the live/malformed attempt decision inside that same execution before any job mutation. It then finishes status/admission/index/session timestamp changes atomically. Session-recent behavior is retained with the recovery timestamp and existing TTL; provider attempt/cost evidence is retained. The design is for the existing single-node Redis only.

  Add `ErrorCode.ASYNC_PROCESSING_EXHAUSTED` and a fixed `GenerationError`; do not store exception text.

- [ ] **Step 5: Add a dedicated processing-recovery index with rolling repair.**

  Maintain `aigen:jobs:processing-recovery` only for PENDING/RUNNING, scored by `lastUpdatedAt`. Inventory every production writer of `status` or `lastUpdatedAt`, including initial save, `updateStatus`, generic transition/result Lua, grounded progress/result Lua, admin retry, and terminal/cleanup paths. Each current-version hash mutation must add/update/remove the processing member in the same Redis Lua execution; add a source-structure test so a new writer cannot omit the processing key. This current-version invariant, not eventual repair, is what makes timestamp selection load-bearing.

  Add a bounded persisted-cursor repair of the legacy global active sorted set using Redis `ZSCAN COUNT recoveryIndexRepairBatchSize`. Store `{activeIndexEpoch, opaqueScanCursor, completedEpoch}` in `aigen:jobs:processing-recovery:repair-state` with TTL at least `redisTtl`; create/rotate an epoch atomically whenever a save observes the global active set absent before `ZADD`, refresh the epoch TTL on every active-index write, and reset cursor/completedEpoch on epoch mismatch. Each scheduler wave scans one page: exact valid PENDING/RUNNING metadata is idempotently added to the processing index; every other valid status is removed from the processing index only; a missing hash is removed from processing and the stale global member; a corrupt hash is moved to `aigen:jobs:processing-recovery:quarantine` with only fixed reason/time while its hash/payload/global evidence is preserved. Repair skips quarantined IDs until an operator resolves the evidence and removes the quarantine entry. Cursor `0` marks `completedEpoch=currentEpoch`; the next wave begins a new pass without erasing the completed marker. Redis may return duplicates during concurrent mutation, so every repair operation is idempotent. New PENDING/RUNNING writes always update the processing index directly, so ZSCAN's guarantee for members present throughout a pass is sufficient for legacy convergence.

  Before each page, read global active cardinality. If it exceeds `recoveryIndexRepairMaxMembers`, record a fixed repair-over-cap failure/availability state and alert while continuing bounded pages; never claim deadline convergence above the configured ceiling. The startup inequality from Task 1 guarantees a complete pass within the processing deadline at or below the ceiling. Test multi-page scan, persisted restart cursor, duplicate returns, concurrent add/remove, corrupt/missing records, epoch/key recreation, pass completion, and the next pass.

  Repair is for historical records created before this version and for restart self-healing; it is not a substitute for atomic current-version writes. The production deployment contract drains the old single backend writer before the new sampler can claim a completed authoritative epoch. Mixed-version concurrent writers are excluded and must keep queue availability at `0` until cutover plus one full repair pass; document this rollout gate rather than claiming undetectable mixed-writer exactness.

  `loadProcessingRecoveryJobs(staleBefore, limit)` reads only scores `<= staleBefore`, oldest first, returns each exact observed status+`lastUpdatedAt`, and uses hash-only recovery metadata. Redis failure propagates; individual missing/corrupt rows become typed per-record outcomes and do not abort later records.

- [ ] **Step 6: Make Redis time deterministic and persisted timestamps fail closed.**

  Inject the shared `Clock` into `RedisAiGenerationJobStore`; replace every JVM-owned `Instant.now()` in that store. Remove codec fallback `Instant.now() + ttl`; missing or malformed `createdAt`, `expiresAt`, or `lastUpdatedAt` throws `CorruptAiGenerationJobRecordException` and leaves evidence for operator recovery.

- [ ] **Step 7: Implement application recovery.**

  `recoverExhausted` accepts a fixed `source` and reads one Clock instant when invoked from Kafka. `recoverStalledBatch` reads one Clock instant for the wave, repairs one bounded page, loads records with inclusive `lastUpdatedAt <= now - processingDeadline`, and applies the same core operation record-by-record without re-reading Clock. The core returns typed results and does not throw for deferred/state-changed/missing/corrupt; the scheduler catches any persistence exception per record, records `failed`, and continues. Metric ownership records exactly one result per operation invocation/source.

- [ ] **Step 8: Run focused Redis/service GREEN and mutation checks.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.application.service.AiGenerationFailureRecoveryServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationFailureRecoveryTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisGroundedAiGenerationJobStoreTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisProviderCallReservationAdapterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Mutate expected status, observed timestamp, inclusive cutoff equality, admission receipt token, minute/daily refund guard, provider-attempt recheck, each index removal, and each race ordering one at a time; each required assertion must fail. Include the current provider reservation tests so the combined reserve/recover invariant is load-bearing.

- [ ] **Step 9: Commit.**

  Stage with explicit `git add -- <path...>` arguments containing only the Task 2 Files list and mechanically required fake fixtures discovered by compile RED, then compare `git diff --cached --name-only` to the approved allowlist.

  ```bash
  git commit -m "fix(server): recover stranded AI generation jobs"
  ```

---

### Task 3: Explicit Kafka Exhaustion Recoverer

**Files:**

- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationConsumerRecordRecoverer.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationKafkaConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumer.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobProducer.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationKafkaErrorHandlerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumerIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/messaging/GroundedAiGenerationJobConsumerIntegrationTest.kt`
- Modify logging tests only for truthful fixed-code wording.

**Interfaces:**

- The inbound recoverer implements Spring Kafka `ConsumerRecordRecoverer` and depends only on `RecoverExhaustedAiGenerationJobUseCase`.
- Producer records carry one content-free routing header containing the canonical job UUID; it is the only recovery input allowed when `ErrorHandlingDeserializer` supplies a null value.
- The listener validates that a present header is one canonical UUID and equals the deserialized job ID before invoking the worker. A valid-value/header mismatch is poison and neither identifier is selected for direct recovery; the scheduler remains the authority-safe backstop.
- The recoverer returns only for durable `RECOVERED_*`, `ALREADY_TERMINAL`, or `MISSING` results.
- It throws `AiGenerationRecoveryDeferredException` for `DEFERRED_IN_FLIGHT`, `DEFERRED_STATE_CHANGED`, and persistence failure so the offset is not committed. `CORRUPT` is not treated as durable recovery.
- If both a valid deserialized UUID and a valid routing header exist they must match. An absent/invalid/mismatched header for a malformed value is an `UNROUTABLE_MALFORMED` poison record: after the same bounded generic attempt budget, record fixed source/result telemetry and return/commit without logging raw key/value/header bytes. Restart scheduler recovery remains the Redis-state backstop for any associated job.

- [ ] **Step 1: Write error-handler contract RED tests.**

  Assert exact fixed backoff `5s`, total attempts `10` (`9` retries), explicit recoverer bean, `ackAfterHandle=true`, `resetStateOnRecoveryFailure=true`, no DLT/dead-letter publisher, unlimited timeout-sized backoff only for listener-thrown provider-live exceptions, and manual ack unchanged. Verify from Spring Kafka behavior that a recoverer-thrown deferred exception resets recovery state and is redelivered; do not assert that it enters the listener-exception backoff function.

  Add producer/listener/serializer/deserializer RED cases for the fixed header name, canonical UUID bytes, valid equality, null value from `ErrorHandlingDeserializer`, absent/invalid/mismatched header, mismatch rejected before worker invocation, and no raw-byte logging.

- [ ] **Step 2: Write real Kafka exhaustion RED.**

  Use Kafka + Redis Testcontainers to prove current code fails these scenarios:

  - generic worker failure exhausts but leaves PENDING/RUNNING and commits offset;
  - PENDING exhaustion must finish FAILED and then commit;
  - RUNNING with live provider attempt must stay RUNNING and must not commit;
  - after the attempt becomes stale, redelivery reconciles UNKNOWN, marks FAILED, and commits once;
  - restart of the listener/error-handler does not create a second provider reservation or physical call.
  - a recoverer-thrown deferred/persistence failure leaves the offset uncommitted, resets recovery state, and the next listener delivery uses current Redis state;
  - malformed value with a valid content-free job-id header recovers that job before commit;
  - malformed value without a routable header consumes exactly the bounded poison budget, records `source=kafka,result=unroutable_malformed`, commits once, exposes no raw bytes, and is later harmless to scheduler recovery.

  Override retry/request/deadline values with validator-legal millisecond/second test values so the real delivery/offset tests remain fast. Use Awaitility, consumer-group offsets, listener latches, and Redis state barriers; do not weaken production defaults or use sleeps.

- [ ] **Step 3: Implement the adapter and explicit handler.**

  Construct:

  ```kotlin
  DefaultErrorHandler(
      aiGenerationConsumerRecordRecoverer,
      FixedBackOff(retryDelay.toMillis(), (maxAttempts - 1).toLong()),
  ).also {
      it.setAckAfterHandle(true)
      it.setResetStateOnRecoveryFailure(true)
  }
  ```

  Keep the backoff function for listener-thrown `ProviderCallStillInFlightException` at request-timeout delay with `UNLIMITED_ATTEMPTS`. Do not swallow recoverer exceptions and do not add `AiGenerationRecoveryDeferredException` to a function that cannot observe it. Update the consumer comment: the recoverer, not the worker, owns generic exhaustion terminalization. Add the content-free producer header and bounded unroutable-malformed policy without a DLT.

- [ ] **Step 4: Run focused Kafka GREEN.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.config.AiGenerationKafkaErrorHandlerTest \
    --tests com.readmates.aigen.adapter.messaging.AiGenerationJobConsumerLoggingTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.aigen.adapter.in.messaging.AiGenerationJobConsumerIntegrationTest \
    --tests com.readmates.aigen.adapter.messaging.GroundedAiGenerationJobConsumerIntegrationTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Inspect actual committed offsets, delivery counts, Redis job/admission/provider-attempt rows, and the reserve/recover race invariant; log output must contain fixed enums only.

- [ ] **Step 5: Commit.**

  Stage with explicit `git add -- <path...>` arguments containing only the Task 3 Files list, then compare `git diff --cached --name-only` to that allowlist.

  ```bash
  git commit -m "fix(server): terminalize exhausted AI Kafka jobs"
  ```

---

### Task 4: Restart Scheduler, Truthful Queue Probe, And Operations Evidence

**Files:**

- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationFailureRecoveryScheduler.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationFailureRecoverySchedulerTest.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationQueueProbeScheduler.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationQueueProbeSchedulerTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinder.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinderTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationMetricsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/MetricLabelsTest.kt`
- Modify: `ops/prometheus/alerts/aigen-rules.yml`
- Create: `ops/prometheus/tests/aigen-rules.test.yml`
- Modify: `scripts/validate-prometheus-rules.sh`
- Modify: `ops/grafana/dashboards/aigen.json`
- Modify: `docs/operations/observability/metrics-catalog.md`
- Modify: `docs/operations/observability/alerts.md`
- Modify: `docs/operations/observability/dashboards.md`
- Modify: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`
- Modify public-candidate fixtures/builder only after an omission RED.

**Interfaces and metrics:**

```text
readmates_aigen_failure_recovery_total{source,result}
  source = kafka|scheduled
  result = recovered_pending|recovered_pending_unaccounted|recovered_running|already_terminal|missing|deferred_in_flight|deferred_state_changed|corrupt|unroutable_malformed|failed
readmates_aigen_recovery_index_repair_total{result}
  result = page_completed|pass_completed|epoch_reset|over_cap|failed
readmates_aigen_queue_depth
  finite count on successful probe; NaN when Redis probe is unavailable
readmates_aigen_queue_probe_available
  1 on latest successful probe; 0 on failure
readmates_aigen_queue_probe_last_success_age_seconds
  nonnegative age; NaN before first success
```

Only fixed enums `source` and `result` are added to the metric-label allowlist. No job/session/club/model text is a tag. Each per-job recovery invocation records exactly one failure-recovery result/source after final classification; the Kafka adapter records the application result before propagating a deferred/failure exception and must not double-count it on the same invocation. Each repair-page invocation independently records exactly one repair result, so over-cap/epoch lifecycle evidence is not mislabeled as a job recovery.

- [ ] **Step 1: Write scheduler RED.**

  Prove the recovery scheduled annotation uses typed `recoveryFixedDelay`, calls only the input use case with no join/wait, and an unexpected wave-level exception is logged with fixed class/result but does not stop future invocations. Prove the application batch isolates each row, so deferred/corrupt/persistence failure in the first item still processes later items. Use ApplicationContextRunner/scheduled-task inspection and latches/offsets, never wall-clock sleeps.

- [ ] **Step 2: Write probe/metric RED.**

  Add a typed `ActiveAiGenerationJobProbe.Available(depth)` / `Unavailable(fixedReason)` port result and an immutable `AiGenerationQueueProbeSnapshot(sampledAt, depth, available, lastSuccessAt)` in one `AtomicReference`. The Redis probe is one Lua/read transaction that returns exact `ZCARD(processing-recovery)` only when `completedEpoch == activeIndexEpoch`, global active cardinality is within the configured ceiling, and the quarantine set is empty. Before the first completed pass, after epoch recreation, while over cap, or while quarantine is nonempty it returns `Unavailable` rather than a partial count. Assert successful exact PENDING/RUNNING count, unavailable queue depth `NaN`, availability `0`, first-success age `NaN`, later success age computed at sample time from injected Clock, fixed recovery source/result cardinality, and metric failures cannot change recovery state.

  Prove one scheduled sample performs exactly one Redis probe, publishes all three values atomically, and arbitrary gauge callback order/repeated scrapes perform zero Redis I/O. Before the first sample all three gauges expose the defined unavailable snapshot. A failed later sample retains `lastSuccessAt`, sets depth NaN/available0, and advances only `sampledAt`.

- [ ] **Step 3: Implement scheduler and probe composition.**

  The recovery and probe schedulers are thin inbound adapters. The queue sampler uses typed `queueProbeFixedDelay`; the Redis store maps Redis failure and the fixed index-unready/over-cap/quarantined states to `Unavailable` only for observability, while authoritative recovery loading still throws. The sampler reads one Clock instant and one Redis probe, then swaps one immutable snapshot. Gauge callbacks are I/O-free reads of that snapshot; they never independently probe Redis and therefore remain coherent for a scrape in any callback order.

- [ ] **Step 4: Add operational rules and docs.**

  Add alerts for queue probe unavailable, recovery `failed`/`corrupt`, and repair `over_cap`/`failed`; guard queue-lag evaluation with probe availability. Document:

  - ten generic attempts, no DLT, and offset commit only after durable terminal/no-op recovery;
  - live provider calls remain deferred;
  - scheduler deadline and bounded index repair;
  - the configured repair ceiling/convergence inequality, repair cursor/epoch lifecycle, corrupt-row quarantine, and over-cap alert;
  - PENDING versus RUNNING admission/cost semantics;
  - receipt/window-token refund behavior for legacy, expired, recreated, newer-lease, and missing-counter cases;
  - `NaN` versus actual zero;
  - queue depth remains unavailable until the current repair epoch has one completed pass and has no over-cap/quarantined ambiguity;
  - malformed Kafka routing-header policy and scheduler compensation without a DLT;
  - operator action for repeated failed/deferred recovery;
  - no blind manual replay while a provider attempt is live.

  State the single-node Redis boundary explicitly. Document the inclusive processing cutoff separately from the strict provider-stale cutoff.

- [ ] **Step 5: Validate observability and public safety.**

  Add pinned real `promtool test rules` cases in `ops/prometheus/tests/aigen-rules.test.yml` and make `scripts/validate-prometheus-rules.sh` execute them. Cover queue depth high with availability1, depth NaN/availability0, absent availability, recovery failed increase, repair-over-cap, and deferred-only no-alert. Run focused units, Prometheus syntax+rule tests, Grafana lint/JSON parsing, actionlint/YAML parsing, production AI config fixtures, candidate fixture omission checks, changed-line sensitive scans, and `git diff --check`.

- [ ] **Step 6: Commit.**

  Stage with explicit `git add -- <path...>` arguments containing only the Task 4 Files list plus candidate files whose omission was first captured RED, then compare `git diff --cached --name-only` to that allowlist.

  ```bash
  git commit -m "feat(ops): expose AI recovery availability"
  ```

---

### Task 5: Canonical Closeout And Whole-Plan Review

**Review before gates:**

- Re-read all reports and final source. Verify no logging-only generic recoverer, implicit handler defaults, false-zero/live-I/O gauge, `Instant.now()` in the touched Redis job path, timestamp synthesis, ignored status+timestamp CAS/result, provider-reservation TOCTOU, counter refund without receipt/window ownership, DLT, raw error metric/log, or unbounded scheduler/repair query remains.
- Verify active metadata never depends on payload materialization, corrupt/missing rows cannot starve a batch, the repair cursor/epoch survives restart, and the convergence ceiling is validated and observable.
- Verify handler tests assert actual Spring Kafka recovery failure behavior (`ackAfterHandle`, reset, delivery and committed offsets), not an unreachable recoverer-exception backoff branch. Verify malformed records use only the content-free routing header or the bounded unroutable policy.
- Verify the queue sampler performs one Redis call per scheduled sample and all gauge callbacks are I/O-free reads of one immutable snapshot.
- Verify provider reservation/UNKNOWN recovery, job call cap, grounded generation, commit recovery, auth/API/BFF/frontend, notification runtime, and outbox tests remain unchanged and green.
- Verify public configuration/docs/rules/dashboard agree on every new value and metric.

**Canonical gates, sequential final HEAD:**

```bash
./server/gradlew -p server compileKotlin --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server architectureTest --rerun-tasks --no-build-cache --no-configuration-cache
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest --rerun-tasks --no-build-cache --no-configuration-cache
./scripts/verify-production-ai-config-fixtures.sh
./scripts/validate-prometheus-rules.sh
git diff --check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Record foreground integration exit code/duration, fresh XML suite/test/failure/error/skip totals, named Kafka/Redis/provider/commit suites, changed-file candidate byte identity, no `.git`/symlink, and gitleaks output. Frontend E2E is excluded unless API/BFF/frontend/auth diffs appear.

After all task reviews approve, generate one full review package from this plan commit/base through final HEAD. A strongest independent reviewer must issue separate plan-compliance, code-quality/release-readiness, and Phase 2 readiness verdicts. Bundle any material findings into one correction wave and repeat scoped plus whole-plan review.

**Commit:** verification-only unless a factual correction is required.

---

## Acceptance Mapping

- **Async/cache/provider:** bounded generic exhaustion, malformed-record policy, live-call defer, provider-reservation/progress-refresh race safety, atomic PENDING/RUNNING recovery, receipt/window-safe refund, restart deadline/index repair, provider UNKNOWN/cost preservation.
- **Configuration/time:** typed local/cross/convergence bounds, exact units, one Clock per wave, inclusive processing cutoff, strict provider-stale cutoff, no malformed timestamp synthesis.
- **Architecture:** Kafka and scheduler remain inbound adapters calling application ports; Redis/Lua remains outbound; application owns policy and safe failure model.
- **Operations/public:** fixed-cardinality source/result recovery counter, sampled truthful queue probe, real promtool semantics, alert/runbook evidence, importer/validator/public config parity and gitleaks.
- **API/frontend/auth:** unchanged; E2E excluded unless final diff proves contract drift.

## Explicit Residuals And Excluded Scope

- A provider may have accepted a request before a crash; stale recovery records `UNKNOWN` and retains reserved cost/call slot rather than pretending no call occurred.
- Legacy PENDING jobs created before admission receipts cannot be safely attributed to a current counter window. They still become terminal but counters are not guessed/refunded; `recovered_pending_unaccounted` is observable.
- Redis itself is the authority for job/admission/provider state. During a Redis outage the recoverer throws and Kafka does not commit; the scheduler probe reports unavailable. Recovery resumes after Redis returns.
- Redis Cluster is excluded. The atomic scripts rely on the existing single-node Redis authority and do not claim cross-slot operation.
- Kafka broker unavailability and consumer lag remain Kafka operational concerns. An unroutable malformed record is committed only after its bounded poison budget with fixed telemetry; any associated Redis job is recovered by the wall-clock scheduler. This plan does not create a DLT.
- Bounded legacy-index convergence is guaranteed only while global active membership is at or below `recovery-index-repair-max-members`; exceeding it is an explicit alerted failure state while repair continues page-by-page.
- Redis public-cache stale exposure, rate-limit fail-open, notification SMTP at-least-once, replay-target retention, and Phase 2 architecture decomposition remain separate approved boundaries.
