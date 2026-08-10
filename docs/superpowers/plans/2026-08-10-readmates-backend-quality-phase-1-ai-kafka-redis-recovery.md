# ReadMates Backend Quality Phase 1 — AI Kafka And Redis Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI-generation Kafka retry exhaustion terminate or defer Redis jobs truthfully, add a restart-safe bounded recovery path, and make Redis queue observability distinguish an unavailable probe from an empty queue.

**Architecture:** An application-owned recovery service decides PENDING versus RUNNING recovery. One Redis atomic recovery port performs the job-status/admission/index transition; a Kafka inbound recoverer returns only after that durable transition and otherwise throws so the offset is not committed. A typed scheduler reuses the same service for restart recovery, while probe models expose unavailable Redis reads as `NaN` plus explicit availability/last-success gauges instead of false zero.

**Tech Stack:** Kotlin 2.4, Spring Boot 4 / Spring Kafka 4, Redis + Lua, Kafka/Testcontainers, Micrometer/Prometheus, JUnit 5, AssertJ.

## Global Constraints

- Preserve existing provider request-timeout, reservation, stale-in-flight `UNKNOWN`, three-call cap, grounded validation/repair, commit receipt, API/BFF/frontend, authorization, and notification behavior.
- Do not add an AI DLT. A DLT cannot atomically repair Redis job/admission state and would create a second recovery authority.
- Generic Kafka failures use explicit total attempts `10` and fixed delay `5s`. `ProviderCallStillInFlightException` and recovery-deferred failures remain unlimited with a delay equal to the provider request timeout.
- Add `readmates.aigen.job.processing-deadline=20m`, `recovery-fixed-delay=1m`, `recovery-batch-size=50`, and `recovery-index-repair-batch-size=500`.
- `processing-deadline` must be greater than or equal to `max-poll-interval + consumer-retry-delay * (consumer-max-attempts - 1)`, strictly less than `redis-ttl`, and between `1m..2h`.
- `redis-ttl` is `1h..24h` with exact whole-second precision; `send-timeout` is exact milliseconds in `1ms..30s`; generic retry delay is exact milliseconds in `1ms..1m`; attempts are `1..100`; recovery delay is exact milliseconds in `1s..10m`; recovery batch is `1..500`; repair batch is `1..5000`; maximum LLM calls remains `1..3`.
- A PENDING recovery decrements this job's host daily/minute admission counters exactly once and deletes only a matching club admission lease. A RUNNING recovery retains consumed host/provider call/cost evidence and deletes only a matching admission lease.
- A RUNNING recovery first reconciles stale provider attempts to `UNKNOWN`. If any attempt is still live, recovery is deferred and Kafka must not commit.
- Use one injected UTC `Clock` instant per recovery wave. All JVM-owned Redis status timestamps use that Clock; missing or malformed persisted timestamps fail closed and are never synthesized from wall clock.
- Recovery logs, metrics, docs, fixtures, and public artifacts contain no transcript, prompt, result, evidence, member data, provider body, secret, private domain, or local absolute path.
- No live provider call, production Redis/Kafka mutation, email, remote push, PR, tag, or deploy during task execution.

---

## Failure Contract And Chosen Approach

Current `DefaultErrorHandler()` uses Spring Kafka's implicit zero-delay nine retries and a logging-only recoverer. When those retries exhaust, the handler treats the record as recovered and commits the offset even though Redis can remain PENDING or RUNNING. Restart also resets the in-memory attempt counter.

The approved recovery sequence is:

```text
Kafka generic exhaustion or scheduled deadline
  -> load Redis metadata
  -> PENDING:
       atomic CAS PENDING -> FAILED(ASYNC_PROCESSING_EXHAUSTED)
       + release this job's initial admission counters/lease
       + remove processing/active indexes
  -> RUNNING:
       reconcile stale provider calls to UNKNOWN
       if live IN_FLIGHT exists -> DEFER and throw
       atomic CAS RUNNING -> FAILED(ASYNC_PROCESSING_EXHAUSTED)
       + retain counters/cost/call slots
       + complete matching admission lease
       + remove processing/active indexes
  -> already terminal/missing -> bounded no-op result
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
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationPropertiesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationConfigValidatorTest.kt`
- Modify only positive configuration fixtures that enable AIGEN/Kafka.

**Interfaces:**

- Produces `AiGenerationKafkaProperties.consumerRetryDelay: Duration` and `consumerMaxAttempts: Int`.
- Produces `AiGenerationProperties.Job.processingDeadline`, `recoveryFixedDelay`, `recoveryBatchSize`, and `recoveryIndexRepairBatchSize`.
- Later tasks consume the exact values; no scheduler or handler may read raw environment properties.

- [ ] **Step 1: Write startup RED tests for every local bound.**

  Add table-driven binding tests for zero, negative, below-minimum, above-maximum, and precision truncation. Include `500us`/`PT0.0005S` for millisecond fields, `1500ms` for whole-second TTL, attempts `0/101`, batches `0/501`, repair batch `0/5001`, deadline `59s/121m`, and exact accepted boundaries.

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
  ```

  Keep application defaults, `.env.example`, and sync workflow byte-for-byte semantically aligned.

- [ ] **Step 6: Run focused GREEN and config agreement scans.**

  Re-run Step 2, then scan the six values across the three public configuration surfaces. Run actionlint/YAML parsing for the workflow.

- [ ] **Step 7: Commit.**

  ```bash
  git add server/src/main/kotlin/com/readmates/aigen/config \
    server/src/main/resources/application.yml \
    server/src/test/kotlin/com/readmates/aigen/config \
    .env.example .github/workflows/sync-config.yml
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
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCounters.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFailureRecoveryServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationFailureRecoveryTest.kt`
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
    RECOVERED_PENDING, RECOVERED_RUNNING, ALREADY_TERMINAL, MISSING, DEFERRED_IN_FLIGHT
}
```

The outbound port consumes one command containing job/host/club IDs, expected status, fixed safe error, normalized `now`, TTL, and admission disposition `RELEASE_PENDING` or `COMPLETE_RUNNING`. It returns `RECOVERED`, `STATE_CHANGED`, or `MISSING`.

- [ ] **Step 1: Write application RED tests.**

  Cover PENDING, RUNNING without provider attempt, RUNNING stale attempt, RUNNING live attempt, terminal, missing, CAS loss, Redis exception, and one-Clock behavior. Assert:

  - PENDING selects `RELEASE_PENDING`.
  - RUNNING reconciles stale provider attempts before selecting `COMPLETE_RUNNING`.
  - live provider attempts throw a typed deferred exception.
  - Redis/provider recovery failure propagates; it never becomes success.
  - safe error is `ASYNC_PROCESSING_EXHAUSTED` with a fixed content-free message.

- [ ] **Step 2: Run service RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.application.service.AiGenerationFailureRecoveryServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Expected: compile failure for missing use cases, result model, error code, and recovery port.

- [ ] **Step 3: Write real-Redis atomic RED tests.**

  Prove in one Redis-visible transition:

  - PENDING becomes FAILED, sets exact Clock timestamp/error, removes active/processing indexes, decrements daily/minute once, and deletes only its matching admission lease.
  - RUNNING becomes FAILED, removes indexes and matching admission lease, but retains daily/minute/provider attempt/cost evidence.
  - repeated recovery changes nothing and never decrements twice.
  - CAS loss, missing job, mismatched/newer admission, and Redis failure do not claim success.
  - a crash/fault injected between the conceptual status/admission/index steps cannot expose a partial state because Lua owns the transition.

- [ ] **Step 4: Implement the atomic recovery port in Redis.**

  Extend the cost-counter adapter or create one narrow Redis adapter that owns a Lua script over the job hash, active/processing sorted sets, daily/minute counters, and club admission key. The script must CAS the exact expected status before any companion mutation and use the job ID as the admission identity.

  Add `ErrorCode.ASYNC_PROCESSING_EXHAUSTED` and a fixed `GenerationError`; do not store exception text.

- [ ] **Step 5: Add a dedicated processing-recovery index with rolling repair.**

  Maintain `aigen:jobs:processing-recovery` only for PENDING/RUNNING, scored by `lastUpdatedAt`. All save/transition/result/terminal paths add or remove it with existing indexes.

  Add a bounded persisted-cursor repair of the legacy active index using `recoveryIndexRepairBatchSize`. Each scheduler wave repairs one page and persists the next cursor so pre-deploy PENDING/RUNNING jobs become visible across restarts; reaching cursor zero completes a pass. Corrupt/missing rows are removed or reported without fabricating timestamps.

  `loadProcessingRecoveryJobs(staleBefore, limit)` reads only scores `<= staleBefore`, oldest first, filters exact PENDING/RUNNING metadata, and throws on Redis failure.

- [ ] **Step 6: Make Redis time deterministic and persisted timestamps fail closed.**

  Inject the shared `Clock` into `RedisAiGenerationJobStore`; replace every JVM-owned `Instant.now()` in that store. Remove codec fallback `Instant.now() + ttl`; missing or malformed `createdAt`, `expiresAt`, or `lastUpdatedAt` throws `CorruptAiGenerationJobRecordException` and leaves evidence for operator recovery.

- [ ] **Step 7: Implement application recovery.**

  `recoverExhausted` reads one Clock instant and executes the state-specific policy. `recoverStalledBatch` reads one Clock instant, repairs one bounded index page, loads records with `lastUpdatedAt <= now - processingDeadline`, and reuses the same recovery method without re-reading Clock.

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

  Mutate expected status, admission disposition, timestamp cutoff equality, and index removal one at a time; each required assertion must fail.

- [ ] **Step 9: Commit.**

  ```bash
  git add server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen
  git commit -m "fix(server): recover stranded AI generation jobs"
  ```

---

### Task 3: Explicit Kafka Exhaustion Recoverer

**Files:**

- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationConsumerRecordRecoverer.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationKafkaConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumer.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationKafkaErrorHandlerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumerIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/messaging/GroundedAiGenerationJobConsumerIntegrationTest.kt`
- Modify logging tests only for truthful fixed-code wording.

**Interfaces:**

- The inbound recoverer implements Spring Kafka `ConsumerRecordRecoverer` and depends only on `RecoverExhaustedAiGenerationJobUseCase`.
- It returns for `RECOVERED_PENDING`, `RECOVERED_RUNNING`, `ALREADY_TERMINAL`, or `MISSING`.
- It throws `AiGenerationRecoveryDeferredException` for live provider calls and propagates persistence failures.

- [ ] **Step 1: Write error-handler contract RED tests.**

  Assert exact fixed backoff `5s`, total attempts `10` (`9` retries), explicit recoverer bean, `ackAfterHandle=true`, no DLT/dead-letter publisher, unlimited timeout-sized backoff for provider-live and recovery-deferred exceptions, and manual ack unchanged.

- [ ] **Step 2: Write real Kafka exhaustion RED.**

  Use Kafka + Redis Testcontainers to prove current code fails these scenarios:

  - generic worker failure exhausts but leaves PENDING/RUNNING and commits offset;
  - PENDING exhaustion must finish FAILED and then commit;
  - RUNNING with live provider attempt must stay RUNNING and must not commit;
  - after the attempt becomes stale, redelivery reconciles UNKNOWN, marks FAILED, and commits once;
  - restart of the listener/error-handler does not create a second provider reservation or physical call.

- [ ] **Step 3: Implement the adapter and explicit handler.**

  Construct:

  ```kotlin
  DefaultErrorHandler(
      aiGenerationConsumerRecordRecoverer,
      FixedBackOff(retryDelay.toMillis(), (maxAttempts - 1).toLong()),
  )
  ```

  Keep the backoff function for `ProviderCallStillInFlightException` and `AiGenerationRecoveryDeferredException` at request-timeout delay with `UNLIMITED_ATTEMPTS`. Do not swallow recoverer exceptions. Update the consumer comment: the recoverer, not the worker, owns generic exhaustion terminalization.

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

  Inspect committed offsets and Redis job/admission/provider-attempt rows; log output must contain fixed enums only.

- [ ] **Step 5: Commit.**

  ```bash
  git add server/src/main/kotlin/com/readmates/aigen/adapter/in/messaging \
    server/src/main/kotlin/com/readmates/aigen/config/AiGenerationKafkaConfig.kt \
    server/src/test/kotlin/com/readmates/aigen
  git commit -m "fix(server): terminalize exhausted AI Kafka jobs"
  ```

---

### Task 4: Restart Scheduler, Truthful Queue Probe, And Operations Evidence

**Files:**

- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationFailureRecoveryScheduler.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationFailureRecoverySchedulerTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinder.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationQueueDepthGaugeBinderTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationMetricsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/MetricLabelsTest.kt`
- Modify: `ops/prometheus/alerts/aigen-rules.yml`
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
readmates_aigen_consumer_recovery_total{result}
  result = recovered_pending|recovered_running|already_terminal|missing|deferred_in_flight|failed
readmates_aigen_queue_depth
  finite count on successful probe; NaN when Redis probe is unavailable
readmates_aigen_queue_probe_available
  1 on latest successful probe; 0 on failure
readmates_aigen_queue_probe_last_success_age_seconds
  nonnegative age; NaN before first success
```

Only fixed enum `result` is added to the metric-label allowlist. No job/session/club/model text is a tag.

- [ ] **Step 1: Write scheduler RED.**

  Prove the scheduled annotation uses typed `recoveryFixedDelay`, calls only the input use case with no join/wait, and a thrown recovery exception is logged with fixed class/result but does not stop future invocations. Use an ApplicationContextRunner/scheduled-task inspection, not wall-clock sleeps.

- [ ] **Step 2: Write probe/metric RED.**

  Add a typed `ActiveAiGenerationJobProbe.Available(records)` / `Unavailable` port result. Assert successful PENDING/RUNNING count, unavailable queue depth `NaN`, availability `0`, first-success age `NaN`, later success age from injected Clock, recovery counter fixed cardinality, and metric failures cannot change recovery state.

- [ ] **Step 3: Implement scheduler and probe composition.**

  The scheduler is a thin inbound adapter. The Redis store probe catches Redis failures into `Unavailable` only for observability; authoritative recovery loading still throws. The binder reads one probe per scrape and updates depth/availability/last-success consistently from one Clock instant.

- [ ] **Step 4: Add operational rules and docs.**

  Add alerts for queue probe unavailable and recovery `failed`; guard queue-lag evaluation with probe availability. Document:

  - ten generic attempts, no DLT, and offset commit only after durable terminal/no-op recovery;
  - live provider calls remain deferred;
  - scheduler deadline and bounded index repair;
  - PENDING versus RUNNING admission/cost semantics;
  - `NaN` versus actual zero;
  - operator action for repeated failed/deferred recovery;
  - no blind manual replay while a provider attempt is live.

- [ ] **Step 5: Validate observability and public safety.**

  Run focused units, Prometheus rule tests, Grafana lint/JSON parsing, actionlint/YAML parsing, candidate fixture omission checks, changed-line sensitive scans, and `git diff --check`.

- [ ] **Step 6: Commit.**

  ```bash
  git add server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen \
    ops docs CHANGELOG.md
  git commit -m "feat(ops): expose AI recovery availability"
  ```

---

### Task 5: Canonical Closeout And Whole-Plan Review

**Review before gates:**

- Re-read all reports and final source. Verify no logging-only generic recoverer, implicit handler defaults, false-zero gauge, `Instant.now()` in the touched Redis job path, timestamp synthesis, ignored CAS/result, DLT, raw error metric/log, or unbounded scheduler query remains.
- Verify provider reservation/UNKNOWN recovery, job call cap, grounded generation, commit recovery, auth/API/BFF/frontend, notification runtime, and outbox tests remain unchanged and green.
- Verify public configuration/docs/rules/dashboard agree on every new value and metric.

**Canonical gates, sequential final HEAD:**

```bash
./server/gradlew -p server compileKotlin --rerun-tasks --no-build-cache --no-configuration-cache
./server/gradlew -p server architectureTest --rerun-tasks --no-build-cache --no-configuration-cache
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest --rerun-tasks --no-build-cache --no-configuration-cache
git diff --check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Record foreground integration exit code/duration, fresh XML suite/test/failure/error/skip totals, named Kafka/Redis/provider/commit suites, changed-file candidate byte identity, no `.git`/symlink, and gitleaks output. Frontend E2E is excluded unless API/BFF/frontend/auth diffs appear.

After all task reviews approve, generate one full review package from this plan commit/base through final HEAD. A strongest independent reviewer must issue separate plan-compliance, code-quality/release-readiness, and Phase 2 readiness verdicts. Bundle any material findings into one correction wave and repeat scoped plus whole-plan review.

**Commit:** verification-only unless a factual correction is required.

---

## Acceptance Mapping

- **Async/cache/provider:** bounded generic exhaustion, live-call defer, atomic PENDING/RUNNING recovery, restart deadline, provider UNKNOWN/cost preservation.
- **Configuration/time:** typed local/cross bounds, exact units, one Clock per wave, no malformed timestamp synthesis.
- **Architecture:** Kafka and scheduler remain inbound adapters calling application ports; Redis/Lua remains outbound; application owns policy and safe failure model.
- **Operations/public:** fixed-cardinality recovery counter, truthful queue probe, alert/runbook evidence, public config parity and gitleaks.
- **API/frontend/auth:** unchanged; E2E excluded unless final diff proves contract drift.

## Explicit Residuals And Excluded Scope

- A provider may have accepted a request before a crash; stale recovery records `UNKNOWN` and retains reserved cost/call slot rather than pretending no call occurred.
- Redis itself is the authority for job/admission/provider state. During a Redis outage the recoverer throws and Kafka does not commit; the scheduler probe reports unavailable. Recovery resumes after Redis returns.
- Kafka broker unavailability and consumer lag remain Kafka operational concerns; this plan repairs application state after delivery failures but does not create a DLT.
- Redis public-cache stale exposure, rate-limit fail-open, notification SMTP at-least-once, replay-target retention, and Phase 2 architecture decomposition remain separate approved boundaries.
