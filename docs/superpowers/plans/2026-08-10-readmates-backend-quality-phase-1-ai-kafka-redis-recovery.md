# ReadMates Backend Quality Phase 1 — AI Kafka And Redis Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI-generation Kafka retry exhaustion terminate or defer Redis jobs truthfully, add a restart-safe bounded recovery path, and make Redis queue observability distinguish an unavailable probe from an empty queue.

**Architecture:** An application-owned recovery service decides PENDING versus RUNNING recovery from hash-only recovery metadata. One Redis atomic recovery port compares the observed status and `lastUpdatedAt`, checks the provider-attempt ledger, and performs the job-status/admission-receipt/index transition in one Lua execution. Per-job admission receipts and daily/minute window tokens prevent a late PENDING recovery from decrementing a recreated counter window. A Kafka inbound recoverer returns only after a durable recovery/no-op result and otherwise throws so the offset is not committed. A typed scheduler reuses the same application operation record-by-record, while a scheduled probe sampler publishes one immutable snapshot that three dynamic gauges read; a fourth static interval gauge is also I/O-free, and none turns Redis failure into false zero.

**Tech Stack:** Kotlin 2.4, Spring Boot 4 / Spring Kafka 4, Redis + Lua, Kafka/Testcontainers, Micrometer/Prometheus, JUnit 5, AssertJ.

## Global Constraints

- Preserve existing provider request-timeout, reservation, stale-in-flight `UNKNOWN`, three-call cap, grounded validation/repair, commit receipt, API/BFF/frontend, authorization, and notification behavior.
- Do not add an AI DLT. A DLT cannot atomically repair Redis job/admission state and would create a second recovery authority.
- Generic Kafka failures use explicit total attempts `10` and fixed delay `5s`. Listener-thrown `ProviderCallStillInFlightException` remains unlimited with a delay equal to the provider request timeout. A recoverer-thrown deferred/persistence failure is rethrown; Spring resets recovery state and redelivers, and the next listener attempt reclassifies current Redis state. Do not claim the backoff function sees recoverer exceptions.
- Add `readmates.aigen.job.processing-deadline=20m`, `recovery-fixed-delay=1m`, `recovery-batch-size=50`, `recovery-index-repair-batch-size=500`, `recovery-index-repair-max-members=5000`, and `queue-probe-fixed-delay=30s`.
- `processing-deadline` must be greater than or equal to `max-poll-interval + consumer-retry-delay * (consumer-max-attempts - 1)`, strictly less than `redis-ttl`, and between `1m..2h`.
- `redis-ttl` is `1h..24h` with exact whole-second precision; `send-timeout` is exact milliseconds in `1ms..30s`; generic retry delay is exact milliseconds in `1ms..1m`; attempts are `1..100`; recovery/probe delays are exact milliseconds in `1s..10m`; recovery batch is `1..500`; repair batch is `1..5000`; repair maximum is `batch..50000`; maximum LLM calls remains `1..3`.
- `recovery-index-repair-max-members` bounds one persisted legacy repair worklist snapshot. Above the declared active-member ceiling is an explicit unavailable/failed repair condition and alert. Do not claim a wall-clock legacy repair deadline: Redis/network execution time and retries are not bounded by scheduler fixed delay. Current-version jobs are indexed atomically and do not depend on repair convergence.
- Admission creates a per-job receipt that stores immutable daily/minute window tokens and charged flags. A PENDING recovery refunds a counter only when the receipt token still matches the current window token and the counter is positive; an expired/recreated window is never decremented. A legacy job without a receipt still terminalizes but records `recovered_pending_unaccounted` and does not guess a refund. A RUNNING recovery retains consumed host/provider call/cost evidence. Both delete only a club admission lease whose value matches this job and neither terminal transition depends on a lease/counter being present.
- A RUNNING recovery's final Lua reconciles provider attempts with `startedAtEpochMs < providerStaleBefore` to `UNKNOWN/ESTIMATED_UNKNOWN`, then checks the same provider-attempt hash for any remaining `IN_FLIGHT`. A valid non-stale attempt returns `DEFERRED_IN_FLIGHT`; a missing/malformed attempt timestamp returns `CORRUPT`. Both preserve job status/admission/indexes. Redis script serialization guarantees reservation-first means recovery defers and recovery-first means the later reservation's RUNNING CAS fails.
- Scheduler selection carries the exact observed `lastUpdatedAt`; final recovery CAS compares both status and timestamp and independently rechecks the scheduled cutoff inside Lua. `STATE_CHANGED` invokes an atomic hash reclassification that removes terminal/missing members or refreshes an active member from the hash's current timestamp without stale JVM-side `ZADD`. The processing cutoff is inclusive `lastUpdatedAt <= now - processingDeadline`; provider-staleness remains its existing strict `<` contract.
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

  Keep application defaults, `.env.example`, sync workflow, production-env importer allowlist/rendering, and production AI validator semantically aligned. Add hermetic production-config fixtures for omission, malformed units, repair maximum below batch/above the absolute ceiling, and exact accepted defaults. Do not encode a false wall-clock repair convergence formula.

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
    fun recoverExhausted(jobId: UUID, source: AiGenerationRecoverySource): AiGenerationRecoveryResult
}

interface RecoverStalledAiGenerationJobsUseCase {
    fun recoverStalledBatch(): List<AiGenerationRecoveryResult>
}

interface RecordUnroutableAiGenerationRecordUseCase {
    fun recordUnroutableKafkaRecord()
}

enum class AiGenerationRecoveryResult {
    RECOVERED_PENDING,
    RECOVERED_PENDING_UNACCOUNTED,
    RECOVERED_RUNNING,
    ALREADY_TERMINAL,
    MISSING,
    DEFERRED_IN_FLIGHT,
    DEFERRED_STATE_CHANGED,
    DEFERRED_NOT_STALE,
    CORRUPT,
}

enum class AiGenerationRecoverySource { KAFKA, SCHEDULED }
```

`loadRecoveryMetadata(jobId)` reads only the job hash and never calls normal payload materialization/deletion. Its typed result distinguishes missing hash, valid hash regardless of transient-payload presence, and corrupt hash; when exact epoch fields exist they must match the parsed ISO `lastUpdatedAt`. The outbound recovery command contains job/host/club IDs, exact expected status and observed ISO/epoch-second/nano timestamp tuple, scheduled cutoff tuple when applicable, strict `providerStaleBefore`, fixed safe error, normalized `now`, TTL, and admission disposition `RELEASE_PENDING` or `COMPLETE_RUNNING`. A separate outbound `AiGenerationAtomicRecoveryResult` distinguishes `RECOVERED`, `RECOVERED_UNACCOUNTED`, `STATE_CHANGED`, `NOT_STALE`, `DEFERRED_IN_FLIGHT`, `CORRUPT`, and `MISSING` and carries bounded typed details for attempts reconciled to `UNKNOWN`; the application atomically reclassifies `STATE_CHANGED`, maps an active row to public `DEFERRED_STATE_CHANGED`, and maps an unchanged exact-cutoff rejection to `DEFERRED_NOT_STALE`.

- [ ] **Step 1: Write application RED tests.**

  Cover PENDING with current/expired/recreated counter windows, legacy PENDING without receipt, RUNNING without provider attempt, RUNNING stale attempt, RUNNING live attempt, terminal, missing hash, missing payload, corrupt hash, status/timestamp CAS loss, Redis exception, source ownership, fixed-cardinality metrics, and one-Clock behavior. Assert:

  - PENDING selects `RELEASE_PENDING`.
  - RUNNING passes the strict provider-stale cutoff and `COMPLETE_RUNNING` to the atomic port; it does not perform a separate reconciliation call.
  - live provider attempts yield a typed deferred result in the application core; only the Kafka adapter converts it to an exception.
  - missing payload never deletes an active job and does not block hash-only terminal recovery.
  - `STATE_CHANGED` calls an atomic reclassify operation: it re-reads the hash, removes missing/terminal processing membership, or writes the active hash's current timestamp score, then returns the matching durable no-op or `DEFERRED_STATE_CHANGED`. No previously read metadata may drive a later `ZADD`.
  - `NOT_STALE` maps to `DEFERRED_NOT_STALE` without mutation; same-millisecond-but-newer and exact equality tests distinguish it from `STATE_CHANGED` and the recoverable inclusive boundary.
  - corrupt rows are preserved, removed from the processing index, and added to a dedicated recovery-quarantine index with fixed reason/time; a bad first row cannot stop later records in the same scheduled batch.
  - every attempt reconciled to `UNKNOWN/ESTIMATED_UNKNOWN` is returned as bounded typed provider/cost evidence and calls the existing `recordProviderCost` path once in the observed execution; repeated recovery returns no reconciled attempt and cannot double-record it.
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

  - admission atomically writes a per-job receipt containing immutable nonblank daily/minute window tokens and charged flags alongside the existing counter increments/lease, including rolling rows where a legacy counter exists but its token does not;
  - PENDING becomes FAILED, sets exact Clock timestamp/error, removes global-active/club-active/processing indexes, refunds daily/minute once only while the receipt token matches the current token and the counter is positive, and deletes only its matching admission lease;
  - before/equality/after the original 60-second minute window, a recreated minute counter is never decremented; after the 5-minute admission lease, a missing or newer lease never blocks terminalization or gets deleted; repeated recovery never refunds twice;
  - a legacy PENDING job without a receipt becomes FAILED with `RECOVERED_PENDING_UNACCOUNTED`, preserves counters, and emits the bounded result;
  - RUNNING becomes FAILED, removes global-active/club-active/processing indexes and its matching receipt/lease, but retains daily/minute/provider attempt/cost evidence;
  - RUNNING final Lua receives the provider-attempt hash, converts only strict-stale valid attempts to `UNKNOWN/ESTIMATED_UNKNOWN`, returns their attempt IDs/details, returns `DEFERRED_IN_FLIGHT` when a valid-live attempt remains, and returns `CORRUPT` when an IN_FLIGHT timestamp is missing/malformed;
  - final CAS compares exact status and `lastUpdatedAt`, and for `source=SCHEDULED` also checks the hash's exact epoch-second/nano tuple `<= staleBefore`; a RUNNING-to-RUNNING progress refresh after scheduler selection yields `STATE_CHANGED`/`NOT_STALE` and never fails the active job;
  - repeated recovery changes nothing and never decrements twice.
  - CAS loss, missing job, mismatched/newer admission, and Redis failure do not claim success.
  - a crash/fault injected between the conceptual status/admission/index steps cannot expose a partial state because Lua owns the transition.

  Add deterministic two-client race tests with latches/barriers, not sleeps: reservation wins before recovery (recovery defers), recovery wins before reservation (reservation CAS fails), and progress timestamp refresh wins after stale selection (recovery returns state-changed). Assert no reachable state contains `FAILED` plus an `IN_FLIGHT` provider attempt.

- [ ] **Step 4: Implement the atomic recovery port in Redis.**

  Extend the cost-counter adapter's admission script to create daily/minute window-token keys and the per-job receipt in the same Redis execution as increments/lease. Each opaque token is nonblank and aligned with its counter window. After cap checks, rotate when either the counter is absent or its token is absent/blank/malformed: a new counter/token gets the full configured TTL; a legacy existing counter with positive finite PTTL gets a new token with exactly that remaining PTTL, without resetting the counter window. An existing counter with nonpositive/no expiry fails closed rather than fabricating ownership. Test daily and minute independently for counter-present/token-missing, malformed token, remaining-TTL preservation, and later window recreation. Only admissions after token creation receive receipts; legacy charges remain nonrefundable. The receipt TTL equals `redisTtl`. Recovery never recreates a missing token. Receipt deletion is the exactly-once refund guard: refund matching positive counters independently of whether the club lease is missing/newer, delete only a matching lease, then delete the receipt atomically. Route ordinary `releaseAdmission` through the same receipt/token-safe refund primitive so it also cannot decrement a recreated window. Preserve rolling compatibility for old jobs with no receipt.

  Create one narrow recovery Redis adapter whose Lua keys include the job hash, provider-attempt hash, admission receipt, daily/minute counter+token keys, matching club lease, global-active, club-active, processing-recovery, quarantine, and session-recent structures. The script must CAS exact expected status plus all observed ISO/epoch-second/nano timestamp fields; scheduled commands also pass the cutoff as `(epochSecond, nano)` and require the exact hash tuple to be `<=` it. For RUNNING it performs strict-stale reconciliation and the live/malformed attempt decision inside that same execution before any job mutation; scanning the provider ledger is bounded by the preserved maximum-three-call invariant. Its typed response includes only reconciled attempt IDs; the adapter loads the now-terminal ledger entries and returns bounded provider/cost-basis/reserved-cost evidence so the application preserves existing UNKNOWN cost metrics. It then finishes status/admission/index/session timestamp changes atomically and removes any old quarantine entry. Session-recent behavior is retained with the recovery timestamp and existing TTL; provider attempt/cost evidence is retained. The design is for the existing single-node Redis only.

  Add `ErrorCode.ASYNC_PROCESSING_EXHAUSTED` and a fixed `GenerationError`; do not store exception text.

- [ ] **Step 5: Add a dedicated processing-recovery index with rolling repair.**

  Maintain `aigen:jobs:processing-recovery` only for PENDING/RUNNING, using epoch-millisecond score as a candidate index while the hash stores the exact `lastUpdatedAt` plus `lastUpdatedAtEpochSecond` and `lastUpdatedAtNano`. Inventory every production writer of `status` or `lastUpdatedAt`, including initial save, `updateStatus`, generic transition/result Lua, grounded progress/result Lua, admin retry, and terminal/cleanup paths. Each current-version hash mutation must write all timestamp fields and add/update/remove the processing member in the same Redis Lua execution; add a source-structure test so a new writer cannot omit the processing key or exact tuple. This current-version invariant, not eventual repair, is what makes timestamp selection load-bearing.

  Define the repair lifecycle explicitly. `aigen:jobs:active:epoch` is created with an opaque supplied generation on startup when absent, rotated atomically whenever **any** current writer (initial save, transition, progress, result, admin retry) is about to `ZADD` an active member and observes the global active set absent, and refreshed to `redisTtl` on every current active-index write. Test external active-key deletion followed separately by save, RUNNING progress, and terminal-to-PENDING retry; each active writer must rotate/refresh the epoch. `aigen:jobs:processing-recovery:repair-state` stores `{activeIndexEpoch, passId, remainingCount, completedEpoch}` and is refreshed with the active worklist on every wave. Epoch mismatch discards the old pass/worklist and clears the old completed marker. An atomic start-pass Lua reads global active `ZCARD`; when it is within `recoveryIndexRepairMaxMembers`, it snapshots the sorted set into `aigen:jobs:processing-recovery:repair-worklist:<passId>` (for example bounded `ZUNIONSTORE`), stores its exact `remainingCount`, and applies `redisTtl` to state/worklist. A zero-member initial snapshot sets `completedEpoch=currentEpoch` in that same start-pass execution.

  Each scheduler wave reads exactly `ZRANGE 0 recoveryIndexRepairBatchSize-1`. A per-member repair Lua verifies current epoch/pass, re-reads the job hash, atomically reclassifies processing/quarantine state, and then `ZREM`s that exact worklist member. Only `ZREM == 1` decrements `remainingCount`; the transition to zero sets `completedEpoch=currentEpoch` and clears the active `passId` in the same Lua, so last-member response loss is still durably complete. It never uses metadata read before the Lua. A crash before member removal simply retries the same idempotent member. A missing worklist with `remainingCount > 0` resets only that broken pass (preserving a same-epoch completed marker from an earlier full pass, if any); a missing worklist with `remainingCount == 0` and `completedEpoch == activeEpoch` is a valid finished pass. The next pass starts from a fresh bounded snapshot without erasing that authoritative same-epoch marker.

  Quarantine is `aigen:jobs:processing-recovery:quarantine`, scored by `quarantinedAt + redisTtl`. Repair/probe Lua prunes expired members before cardinality checks; current valid state writers and successful/terminal recovery remove their own member atomically. A repaired operator row remains excluded until the runbook-directed quarantine member removal, after which the next pass reclassifies it. Test automatic removal after hash expiry/TTL, current-writer healing, operator removal, and no permanent unavailable gauge caused by orphaned quarantine metadata.

  If the start-pass cardinality exceeds `recoveryIndexRepairMaxMembers`, create no unbounded snapshot, record fixed repair-over-cap failure/availability, and alert; retry on later waves. Test an exact multi-page worklist, restart with persisted passId/remainingCount, duplicate retry after injected crash, concurrent terminal/progress mutation, stale repair-after-terminal, corrupt/missing records, epoch/key recreation, empty initial snapshot, last-member response loss/restart, missing-midpass reset, completed missing-worklist recognition, pass completion, the next pass, and over-cap refusal. Do not assert completion within `processingDeadline`; assert only per-wave work is bounded by the snapshot ceiling and batch.

  Repair is for historical records created before this version and for restart self-healing; it is not a substitute for atomic current-version writes. The production deployment contract drains the old single backend writer before the new sampler can claim a completed authoritative epoch. Mixed-version concurrent writers are excluded and must keep queue availability at `0` until cutover plus one full worklist pass; document this rollout gate rather than claiming undetectable mixed-writer exactness.

  `loadProcessingRecoveryJobs(staleBefore, limit)` uses epoch-millisecond score to read candidates `<= staleBefore`, oldest first, returns each exact observed status+`lastUpdatedAt`, and uses hash-only recovery metadata. Redis failure propagates; individual missing/corrupt rows become typed per-record outcomes and do not abort later records. Millisecond score is only a candidate query; the final scheduled Lua always compares the exact hash `(epochSecond,nano)` tuple with the exact same cutoff, so a same-millisecond but newer value is rejected.

- [ ] **Step 6: Make Redis time deterministic and persisted timestamps fail closed.**

  Inject the shared `Clock` into `RedisAiGenerationJobStore`; replace every JVM-owned `Instant.now()` in that store. Every current writer persists exact ISO `lastUpdatedAt` and its exact epoch-second/nano tuple from the same Instant. Reads reject a present-but-mismatched tuple. Legacy repair parses the ISO value in the JVM, then its per-member Lua backfills an absent tuple only if that exact ISO value and active status are still current; a concurrent terminal/progress write is reclassified inside Lua instead of stale-added. Remove codec fallback `Instant.now() + ttl`; missing or malformed `createdAt`, `expiresAt`, or `lastUpdatedAt` throws `CorruptAiGenerationJobRecordException` and leaves evidence for operator recovery.

- [ ] **Step 7: Implement application recovery.**

  `recoverExhausted(jobId, source)` requires an explicit fixed source and reads one Clock instant when invoked from Kafka. `recoverStalledBatch` has intrinsic `SCHEDULED` source, reads one Clock instant for the wave, repairs one bounded page, loads records with inclusive `lastUpdatedAt <= now - processingDeadline`, and applies the same core operation record-by-record without re-reading Clock. The application service is the sole owner of routable recovery metrics: it records exactly one final result per job invocation, records returned UNKNOWN provider-cost evidence, and records `failed` before rethrowing persistence failure. The core returns typed results and does not throw for deferred/state-changed/missing/corrupt; the scheduled batch catches persistence failure per record and continues. `RecordUnroutableAiGenerationRecordUseCase` is the same application metric boundary for a Kafka record with no authority-safe job ID.

- [ ] **Step 8: Run focused Redis/service GREEN and mutation checks.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.application.service.AiGenerationFailureRecoveryServiceTest \
    --tests com.readmates.aigen.application.service.AiGenerationMetricsTest \
    --tests com.readmates.aigen.application.service.MetricLabelsTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationFailureRecoveryTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisGenerationCostCountersTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisGroundedAiGenerationJobStoreTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisProviderCallReservationAdapterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Mutate expected status, observed timestamp, inclusive cutoff equality, same-millisecond exact nano cutoff/`NOT_STALE`, admission receipt token, minute/daily refund guard, provider-attempt recheck, each index removal, and each race ordering one at a time; each required assertion must fail. Include the current provider reservation tests so the combined reserve/recover invariant is load-bearing.

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
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationKafkaRecordRoutingTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobProducerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumerIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/messaging/GroundedAiGenerationJobConsumerIntegrationTest.kt`
- Modify logging tests only for truthful fixed-code wording.

**Interfaces:**

- The inbound recoverer implements Spring Kafka `ConsumerRecordRecoverer` and depends only on `RecoverExhaustedAiGenerationJobUseCase` plus `RecordUnroutableAiGenerationRecordUseCase`; it does not own counters directly.
- Producer records carry one content-free routing header containing the canonical job UUID; it is the only recovery input allowed when `ErrorHandlingDeserializer` supplies a null value.
- The listener validates that a present header is one canonical UUID and equals the deserialized job ID before invoking the worker. A valid-value/header mismatch is poison and neither identifier is selected for direct recovery; the scheduler remains the authority-safe backstop.
- The recoverer returns only for durable `RECOVERED_*`, `ALREADY_TERMINAL`, or `MISSING` results.
- It throws `AiGenerationRecoveryDeferredException` for `DEFERRED_IN_FLIGHT`, `DEFERRED_STATE_CHANGED`, `DEFERRED_NOT_STALE`, and persistence failure so the offset is not committed. `CORRUPT` is not treated as durable recovery.
- Recovery identity resolution is exact: `(valid value, equal valid header)` and `(null value, valid header)` are routable; `(valid value, absent/invalid/mismatched header)` and `(null value, absent/invalid header)` are `UNROUTABLE_RECORD`. After the same bounded generic attempt budget, call `RecordUnroutableAiGenerationRecordUseCase`, return/commit, and never log raw key/value/header bytes. Restart scheduler recovery remains the Redis-state backstop for any associated job.

- [ ] **Step 1: Write error-handler contract RED tests.**

  Assert exact fixed backoff `5s`, total attempts `10` (`9` retries), explicit recoverer bean, `ackAfterHandle=true`, `resetStateOnRecoveryFailure=true`, no DLT/dead-letter publisher, unlimited timeout-sized backoff only for listener-thrown provider-live exceptions, and manual ack unchanged. Pin Spring Kafka 4.0.6's default fatal `DeserializationException` behavior RED, then require the handler to explicitly classify Spring Kafka `DeserializationException` and the fixed routing-mismatch exception as retryable so both consume exactly the configured poison budget. Verify from actual behavior that a recoverer-thrown deferred exception resets recovery state and is redelivered; do not assert that it enters the listener-exception backoff function.

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
  - malformed value without a routable header and valid-value/header absent-invalid-mismatch cases each consume exactly the bounded poison budget, record `source=kafka,result=unroutable_record`, never invoke a worker or choose either ambiguous ID, commit once, expose no raw bytes, and are later harmless to scheduler recovery.

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
      it.addRetryableExceptions(
          DeserializationException::class.java,
          AiGenerationRoutingMismatchException::class.java,
      )
  }
  ```

  Keep the backoff function for listener-thrown `ProviderCallStillInFlightException` at request-timeout delay with `UNLIMITED_ATTEMPTS`. Do not swallow recoverer exceptions and do not add `AiGenerationRecoveryDeferredException` to a function that cannot observe it. Update the consumer comment: the recoverer, not the worker, owns generic exhaustion terminalization. Add exact content-free producer-header validation, explicit poison retry classification, and the bounded unroutable-record policy without a DLT.

- [ ] **Step 4: Run focused Kafka GREEN.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.config.AiGenerationKafkaErrorHandlerTest \
    --tests com.readmates.aigen.adapter.in.messaging.AiGenerationKafkaRecordRoutingTest \
    --tests com.readmates.aigen.adapter.out.messaging.AiGenerationJobProducerTest \
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
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationQueueProbeUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/ActiveAiGenerationJobProbe.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationQueueProbeService.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationQueueProbeServiceTest.kt`
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
  result = recovered_pending|recovered_pending_unaccounted|recovered_running|already_terminal|missing|deferred_in_flight|deferred_state_changed|deferred_not_stale|corrupt|unroutable_record|failed
readmates_aigen_recovery_index_repair_total{result}
  result = page_completed|pass_completed|epoch_reset|quarantined|over_cap|failed
readmates_aigen_queue_depth
  finite count on successful probe; NaN when Redis probe is unavailable
readmates_aigen_queue_probe_available
  1 on latest successful probe; 0 on failure
readmates_aigen_queue_probe_last_success_timestamp_seconds
  Unix timestamp of latest success; NaN before first success
readmates_aigen_queue_probe_sample_interval_seconds
  configured typed sampling interval; finite and positive
```

Only fixed enums `source` and `result` are added to the metric-label allowlist. No job/session/club/model text is a tag. The application recovery service alone records routable per-job results before returning them; Kafka and scheduler adapters only map those results to transport behavior. The separate unroutable-record input use case records the poison result when no job identity is safe. Each repair-page invocation independently records exactly one repair result with precedence `failed > over_cap > epoch_reset > quarantined > pass_completed > page_completed`; thus repair-discovered corruption is observable without double-counting it as a job recovery.

- [ ] **Step 1: Write scheduler RED.**

  Prove the recovery scheduled annotation uses typed `recoveryFixedDelay`, calls only the recovery input use case with no join/wait, and an unexpected wave-level exception is logged with fixed class/result but does not stop future invocations. Prove the queue scheduled annotation uses typed `queueProbeFixedDelay` and calls only the sample input use case. Architecture/source tests must reject either scheduler depending directly on Redis/job-store ports. Prove the application recovery batch isolates each row, so deferred/corrupt/persistence failure in the first item still processes later items. Use ApplicationContextRunner/scheduled-task inspection and latches/offsets, never wall-clock sleeps.

- [ ] **Step 2: Write probe/metric RED.**

  Add `SampleAiGenerationQueueProbeUseCase` and `ReadAiGenerationQueueProbeSnapshotUseCase`, implemented by an application service that owns one `AtomicReference<AiGenerationQueueProbeSnapshot(sampledAt, depth, available, lastSuccessAt)>` and depends on the typed outbound `ActiveAiGenerationJobProbe.Available(depth)` / `Unavailable(fixedReason)`. The Redis probe is one Lua/read transaction that prunes expired quarantine and returns exact `ZCARD(processing-recovery)` only when `completedEpoch == activeIndexEpoch`, global active cardinality is within the configured ceiling, and quarantine is empty. Before the first completed pass, after epoch recreation, while over cap, or while quarantine is nonempty it returns `Unavailable` rather than a partial count. Assert successful exact PENDING/RUNNING count, unavailable queue depth `NaN`, availability `0`, first-success timestamp `NaN`, later success timestamp from injected Clock, finite typed sample-interval gauge, fixed recovery source/result cardinality, and metric failures cannot change recovery state.

  Prove one scheduled sample performs exactly one Redis probe, publishes all three values atomically, and arbitrary gauge callback order/repeated scrapes perform zero Redis I/O. Before the first sample all three gauges expose the defined unavailable snapshot. A failed later sample retains `lastSuccessAt`, sets depth NaN/available0, and advances only `sampledAt`. The timestamp gauge remains the stored success epoch; PromQL/dashboard age is `time() - readmates_aigen_queue_probe_last_success_timestamp_seconds`, so age advances even if sampling stops.

- [ ] **Step 3: Implement scheduler and probe composition.**

  The recovery and probe schedulers are thin inbound adapters. `AiGenerationQueueProbeScheduler` uses the typed `queueProbeFixedDelay` annotation and depends only on `SampleAiGenerationQueueProbeUseCase`; the binder depends only on `ReadAiGenerationQueueProbeSnapshotUseCase`. The application service owns Clock/snapshot policy; the outbound Redis probe maps Redis failure and fixed index-unready/over-cap/quarantined states to `Unavailable`, while authoritative recovery loading still throws. One sample reads one Clock instant and one Redis probe, then swaps one immutable snapshot. Gauge callbacks are I/O-free reads of that snapshot; they never independently probe Redis and therefore remain coherent for a scrape in any callback order.

- [ ] **Step 4: Add operational rules and docs.**

  Add alerts for queue probe unavailable, absent/NaN/stale last-success timestamp, recovery `failed`/`corrupt`, and repair `quarantined`/`over_cap`/`failed`. Queue-lag PromQL must require availability `1`, a present non-NaN last-success timestamp, and `time() - last_success_timestamp < 3 * sample_interval`; a stopped sampler with frozen availability/depth must never fire a misleading lag alert. Document:

  - ten generic attempts, no DLT, and offset commit only after durable terminal/no-op recovery;
  - live provider calls remain deferred;
  - scheduler deadline and bounded index repair;
  - the configured repair ceiling, persisted worklist/pass/epoch lifecycle, absence of a false wall-clock convergence claim, corrupt-row quarantine, and over-cap alert;
  - PENDING versus RUNNING admission/cost semantics;
  - receipt/window-token refund behavior for legacy, expired, recreated, newer-lease, and missing-counter cases;
  - `NaN` versus actual zero and timestamp-based last-success age via PromQL `time()`;
  - queue depth remains unavailable until the current repair epoch has one completed pass and has no over-cap/quarantined ambiguity;
  - malformed Kafka routing-header policy and scheduler compensation without a DLT;
  - operator action for repeated failed/deferred recovery;
  - no blind manual replay while a provider attempt is live.

  State the single-node Redis boundary explicitly. Document the inclusive processing cutoff separately from the strict provider-stale cutoff.

- [ ] **Step 5: Validate observability and public safety.**

  Add pinned real `promtool test rules` cases in `ops/prometheus/tests/aigen-rules.test.yml` and make `scripts/validate-prometheus-rules.sh` execute them. Cover fresh high depth with availability1, depth NaN/availability0, absent availability, absent/present-NaN/stale last-success timestamp, stopped-sampler high-depth suppression, recovery failed increase, repair quarantined/over-cap, and deferred-only no-alert. Run these focused units before Prometheus syntax+rule tests, Grafana lint/JSON parsing, actionlint/YAML parsing, production AI config fixtures, candidate fixture omission checks, changed-line sensitive scans, and `git diff --check`:

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.adapter.in.scheduling.AiGenerationFailureRecoverySchedulerTest \
    --tests com.readmates.aigen.adapter.in.scheduling.AiGenerationQueueProbeSchedulerTest \
    --tests com.readmates.aigen.application.service.AiGenerationQueueProbeServiceTest \
    --tests com.readmates.aigen.application.service.AiGenerationQueueDepthGaugeBinderTest \
    --tests com.readmates.aigen.application.service.AiGenerationMetricsTest \
    --tests com.readmates.aigen.application.service.MetricLabelsTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 6: Commit.**

  Stage with explicit `git add -- <path...>` arguments containing only the Task 4 Files list plus candidate files whose omission was first captured RED, then compare `git diff --cached --name-only` to that allowlist.

  ```bash
  git commit -m "feat(ops): expose AI recovery availability"
  ```

---

### Task 5: Canonical Closeout And Whole-Plan Review

**Review before gates:**

- Re-read all reports and final source. Verify no logging-only generic recoverer, implicit handler defaults, false-zero/live-I/O gauge, `Instant.now()` in the touched Redis job path, timestamp synthesis, ignored status+timestamp CAS/result, provider-reservation TOCTOU, counter refund without receipt/window ownership, DLT, raw error metric/log, or unbounded scheduler/repair query remains.
- Verify active metadata never depends on payload materialization, corrupt/missing rows cannot starve a batch, the bounded repair worklist/pass/epoch survives restart, and over-cap/unready states are observable without a false deadline claim.
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

- **Async/cache/provider:** bounded generic exhaustion, malformed-record policy, live-call defer, provider-reservation/progress-refresh race safety, atomic PENDING/RUNNING recovery, receipt/window-safe refund, restart recovery plus independently bounded index repair without a wall-clock repair deadline, provider UNKNOWN/cost preservation.
- **Configuration/time:** typed local/cross/repair-ceiling bounds, exact units, one Clock per wave, inclusive exact processing cutoff, strict provider-stale cutoff, no malformed timestamp synthesis.
- **Architecture:** Kafka and scheduler remain inbound adapters calling application ports; Redis/Lua remains outbound; application owns policy and safe failure model.
- **Operations/public:** fixed-cardinality source/result recovery counter, sampled truthful queue probe, real promtool semantics, alert/runbook evidence, importer/validator/public config parity and gitleaks.
- **API/frontend/auth:** unchanged; E2E excluded unless final diff proves contract drift.

## Explicit Residuals And Excluded Scope

- A provider may have accepted a request before a crash; stale recovery records `UNKNOWN` and retains reserved cost/call slot rather than pretending no call occurred.
- Legacy PENDING jobs created before admission receipts cannot be safely attributed to a current counter window. They still become terminal but counters are not guessed/refunded; `recovered_pending_unaccounted` is observable.
- Redis itself is the authority for job/admission/provider state. During a Redis outage the recoverer throws and Kafka does not commit; the scheduler probe reports unavailable. Recovery resumes after Redis returns.
- Redis Cluster is excluded. The atomic scripts rely on the existing single-node Redis authority and do not claim cross-slot operation.
- Kafka broker unavailability and consumer lag remain Kafka operational concerns. An unroutable record—malformed value or absent/invalid/mismatched identity—is committed only after its bounded poison budget with fixed telemetry; any associated Redis job is recovered by the wall-clock scheduler. This plan does not create a DLT.
- Each legacy repair snapshot and wave is bounded by `recovery-index-repair-max-members` and `recovery-index-repair-batch-size`, but no wall-clock completion deadline is claimed. Above the snapshot ceiling is an explicit alerted unavailable state; current-version jobs remain atomically indexed independently of legacy repair.
- Redis public-cache stale exposure, rate-limit fail-open, notification SMTP at-least-once, replay-target retention, and Phase 2 architecture decomposition remain separate approved boundaries.
