# ReadMates Backend Quality Phase 2 — Application Port Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the approved non-auth, non-session-record concrete-service, cross-adapter, and adapter-owned-contract debt while making the three Redis AI job-list reads distinguish unavailability from an authoritative empty result.

**Architecture:** Inbound Kafka and scheduling adapters call application input ports and exchange application-owned routing models. Outbound adapters depend on output ports and application-owned failure/metric models; sibling adapters share only technical registry beans, never each other's concrete classes. Notification producer and consumer configuration are separated by direction. Redis list reads return a typed availability result, while application services explicitly preserve existing API projections and make commit-recovery unavailability fail visibly.

**Tech Stack:** Kotlin 2.4, Spring Boot 4, Spring Kafka 4, Redis, Resilience4j, Micrometer/Prometheus, JUnit 5, AssertJ, Mockito, Testcontainers, ArchUnit.

## Global Constraints

- Execute from branch `codex/backend-quality-hardening-phase-0-2` at exact plan base `519eb62deec4cbdcc5c8a4f81933faccabee1257` or a descendant containing this plan commit. Record the actual execution base before Task 1.
- Scope is strictly: admin outbound-resilience health port; AI job ingress/envelope/commit-recovery input ports; AI queue/provider failure models; AI adapter metrics/models; notification Kafka producer/consumer ownership; and typed availability for `loadRecentForSession`, `loadActiveJobs`, and `loadCommitRecoveryJobs`.
- Exclude actor migration, auth/club context, sessionclosing, sessionimport, sessionrecord, feature-cycle removal, unrelated large-class splits, and final Phase 2 program closeout.
- Preserve every REST/BFF/frontend response shape, status, safe error code, authorization decision, Kafka topic/group/header/key, JSON field name, retry/DLQ policy, Redis key/schema/TTL/index, metric name/tag value, and database record meaning.
- Do not add or modify Flyway migrations. Do not add a shared runtime module or new infrastructure service.
- Do not move policy into schedulers or Kafka configuration. Schedulers decide cadence/batch size and invoke an input port; Kafka adapters own transport wiring and map transport failure to application-owned classifications.
- Do not weaken architecture inventory detection, increase an approved seed, delete a retired identity, add a replacement debt identity, or change feature-dependency ledgers unless a source import in this exact scope actually retires an approved feature edge.
- For each source boundary removal: first prove a RED boundary/behavior test; remove the source debt; remove the exact row from `server/config/architecture/boundary-import-baseline.txt`; append the identical row to `server/config/architecture/phase-0-retired-boundary-imports.txt`; run exact-inventory tests; then commit all four facts together.
- The initial boundary partition is approved `39 = 35 current + 4 retired`. This plan retires exactly `12` rows and must finish at `23 current + 16 retired = 39`. The approved seed remains byte-for-byte unchanged.
- Keep application-owned failure text bounded and content-free. No transcript, prompt, result, evidence, email, member data, club/session/job ID, provider response/body, exception message, hostname, private domain, secret, or token may enter HTTP details, metric tags, new docs, or reports.
- Use fake providers, fake mail, local Kafka/Redis/Testcontainers, and deterministic test doubles only. Do not call live AI providers, send real email, use production data, deploy, push, open a PR, tag, or mutate remote state.
- Run focused RED before GREEN. Do not accept a compile-only move: each task must prove behavior and boundary inventory. Use `--rerun-tasks --no-build-cache --no-configuration-cache` for the decisive focused and final Gradle evidence.
- Stage only the exact task file allowlist, compare `git diff --cached --name-only` to it, request a fresh task review, resolve all material findings, rerun focused evidence, and then create the task's exact commit subject.
- Keep execution reports public-safe. Do not commit `.tmp`, Gradle output, Testcontainers state, coverage output, generated public candidates, or agent/orchestrator state.

---

## Current Boundary Ledger And Target

| Task | Exact identities retired | Current after task | Retired after task |
| --- | ---: | ---: | ---: |
| Start | none | 35 | 4 |
| Task 1 | 1 admin resilience identity | 34 | 5 |
| Task 2 | 3 AI ingress identities | 31 | 8 |
| Task 3 | 2 AI failure-model identities | 29 | 10 |
| Task 4 | 4 AI metric/model identities | 25 | 14 |
| Task 5 | 2 notification Kafka identities | 23 | 16 |
| Task 6 | no baseline identity; typed failure boundary | 23 | 16 |

`server/config/architecture/phase-0-approved-boundary-imports.txt` stays unchanged. Task reviewers must compare the current and retired files against this table and run the partition test after every task.

## File Structure

### New production files

- `server/src/main/kotlin/com/readmates/admin/health/application/port/out/OutboundResilienceHealthPort.kt` — health-owned plain-`Int` output contract.
- `server/src/main/kotlin/com/readmates/admin/health/adapter/out/resilience/Resilience4jOutboundResilienceHealthAdapter.kt` — translates the shared technical registry to the health port.
- `server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakerRegistryConfiguration.kt` — constructs the one registry used by outbound execution and health observation.
- `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationJobIngressUseCases.kt` — worker and commit-recovery inbound contracts.
- `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationJobMessage.kt` — transport-neutral, transcript-free routing envelope retaining the current JSON shape.
- `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationFailureModels.kt` — queue failure and provider failure classification.
- `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationMetricModels.kt` — fixed circuit-state and cap-denial enums.
- `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationAdapterMetricsPort.kt` — metrics operations required by outbound Redis/resilience adapters.
- `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationJobListResult.kt` — `Available` versus `Unavailable` list result and bounded operation/reason enums.
- `server/src/main/kotlin/com/readmates/notification/application/model/NotificationDeliveryFailures.kt` — application-owned retryable dispatch failure.
- `server/src/main/kotlin/com/readmates/notification/adapter/in/kafka/NotificationKafkaConsumerConfiguration.kt` — consumer factory, error handler, DLT recoverer, and listener container.

### New tests and report

- `server/src/test/kotlin/com/readmates/admin/health/adapter/out/resilience/Resilience4jOutboundResilienceHealthAdapterTest.kt`
- `server/src/test/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationCommitRecoverySchedulerTest.kt`
- `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCountersFailureTest.kt`
- `server/src/test/kotlin/com/readmates/notification/adapter/in/kafka/NotificationKafkaConsumerConfigurationTest.kt`
- `docs/superpowers/reports/2026-08-10-readmates-backend-quality-phase-2-application-port-boundaries-report.md`

Existing classes are modified in place only where named by a task. The plan does not authorize opportunistic file splitting.

---

### Task 1: Port Outbound Resilience Health Without Adapter Coupling

**Files:**

- Create: `server/src/main/kotlin/com/readmates/admin/health/application/port/out/OutboundResilienceHealthPort.kt`
- Create: `server/src/main/kotlin/com/readmates/admin/health/adapter/out/resilience/Resilience4jOutboundResilienceHealthAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakerRegistryConfiguration.kt`
- Modify: `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/OutboundResilienceHealthCardProvider.kt:10-29`
- Modify: `server/src/main/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakers.kt:21-25,67-93`
- Create: `server/src/test/kotlin/com/readmates/admin/health/adapter/out/resilience/Resilience4jOutboundResilienceHealthAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/admin/health/application/service/providers/OutboundResilienceHealthCardProviderTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/shared/adapter/out/resilience/OutboundCircuitBreakersTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`

**Interfaces:**

```kotlin
fun interface OutboundResilienceHealthPort {
    fun openCircuitCount(): Int
}

@Configuration(proxyBeanMethods = false)
class OutboundCircuitBreakerRegistryConfiguration {
    @Bean
    fun outboundCircuitBreakerRegistry(properties: OutboundResilienceProperties): CircuitBreakerRegistry
}

class OutboundCircuitBreakers @Autowired internal constructor(
    properties: OutboundResilienceProperties,
    meterRegistryProvider: ObjectProvider<MeterRegistry>,
    private val registry: CircuitBreakerRegistry,
) {
    constructor(
        properties: OutboundResilienceProperties,
        meterRegistryProvider: ObjectProvider<MeterRegistry>,
    ) : this(properties, meterRegistryProvider, buildOutboundCircuitBreakerRegistry(properties))
}
```

`OutboundCircuitBreakers` consumes the injected `CircuitBreakerRegistry`; `Resilience4jOutboundResilienceHealthAdapter` consumes that same registry and implements `OutboundResilienceHealthPort`. The production registry bean uses one `internal` builder shared with the direct-construction test default, so existing outbound-adapter tests do not need auth/club/note/publication edits. The health application never imports Resilience4j or a shared adapter. Neither adapter imports the other adapter.

**Exact retired identity:**

```text
com/readmates/admin/health/application/service/providers/OutboundResilienceHealthCardProvider.kt|com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
```

- [ ] **Step 1: Write RED boundary and behavior tests.**

  Add a source/ArchUnit rule proving `admin.health.application` cannot import `shared.adapter`. Add adapter tests that place breakers in `CLOSED`, `OPEN`, `FORCED_OPEN`, and `HALF_OPEN` and assert counts `0`, `1`, `1`, and `0`. Update the provider test to use a fake `OutboundResilienceHealthPort` and pin `0 -> OK`, `1 -> CRIT`, the unchanged threshold/unit/source, and the injected Clock timestamp.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server unitTest \
    --tests com.readmates.admin.health.application.service.providers.OutboundResilienceHealthCardProviderTest \
    --tests com.readmates.admin.health.adapter.out.resilience.Resilience4jOutboundResilienceHealthAdapterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  Expected: architecture still finds the exact baseline debt and the new adapter/port types do not compile.

- [ ] **Step 3: Implement one registry and sibling adapters.**

  Move registry construction into an `internal buildOutboundCircuitBreakerRegistry(properties)` function used by the configuration bean and the execution facade's direct-construction default. Production injects the bean; direct unit fixtures remain source-compatible. Do not change breaker thresholds, sliding window, minimum calls, half-open permits, wait duration, automatic transition, event meters, `execute` fallback, circuit names, or the test-facing `states()` view. Delete only `openCircuitCount()` after the health adapter owns the count.

- [ ] **Step 4: Retire the exact identity and run GREEN.**

  Move the row verbatim from current to retired. Run the Step 2 commands plus:

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakersTest \
    --tests com.readmates.admin.health.application.service.providers.OutboundResilienceHealthCardProviderTest \
    --tests com.readmates.admin.health.adapter.out.resilience.Resilience4jOutboundResilienceHealthAdapterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 5: Task review and commit.**

  Require a fresh reviewer to check one-registry identity, exact state counting, no adapter-to-adapter import, unchanged fallback semantics, and the `34/5` ledger partition. Stage only Task 1 files and commit:

  ```bash
  git commit -m "refactor(server): port outbound resilience health"
  ```

---

### Task 2: Own AI Job Ingress Contracts In Application

**Files:**

- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationJobIngressUseCases.kt`
- Create by moving: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationJobMessage.kt`
- Delete after move: `server/src/main/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobMessage.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt:23-40`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryService.kt:12-20,65-81`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumer.kt:3-4,29-73`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationCommitRecoveryScheduler.kt:5-18`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobProducer.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationKafkaConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationConsumerRecordRecoverer.kt` only for the moved envelope import.
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/in/scheduling/AiGenerationCommitRecoverySchedulerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumerIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationKafkaRecordRoutingTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/messaging/AiGenerationJobConsumerLoggingTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/messaging/GroundedAiGenerationJobConsumerIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobMessageSerializationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobProducerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`

**Interfaces:**

```kotlin
fun interface ProcessAiGenerationJobUseCase {
    fun process(jobId: UUID)
}

interface RecoverAiGenerationCommitsUseCase {
    fun recoverBatch(limit: Int): List<AiGenerationCommitRecoveryResult>
}

data class AiGenerationCommitRecoveryResult(
    val jobId: UUID,
    val status: JobStatus,
    val recovered: Boolean,
)

data class AiGenerationJobMessage(
    override val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val provider: Provider,
    val model: String,
    val kind: JobKind,
) : AiGenerationKafkaRoutingValue
```

`AiGenerationWorker` implements `ProcessAiGenerationJobUseCase`; `AiGenerationCommitRecoveryService` implements `RecoverAiGenerationCommitsUseCase`. Move `AiGenerationCommitRecoveryResult` from the concrete service into the same input-port file so the scheduler never imports a service-owned return type. The envelope retains the exact current class name and seven JSON properties so existing records remain deserializable. It contains no Kafka/Spring type and no transcript/result/prompt/evidence field.

**Exact retired identities:**

```text
com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumer.kt|com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessage
com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumer.kt|com.readmates.aigen.application.service.AiGenerationWorker
com/readmates/aigen/adapter/in/scheduling/AiGenerationCommitRecoveryScheduler.kt|com.readmates.aigen.application.service.AiGenerationCommitRecoveryService
```

- [ ] **Step 1: Write RED ingress tests and architecture mutations.**

  Make consumer tests inject only `ProcessAiGenerationJobUseCase`. Prove success calls `process(jobId)` once then acknowledges; routing mismatch, null value, and thrown worker failure never acknowledge; failure is rethrown; MDC contains only bounded job/provider/stage values and is restored. Add scheduler tests proving one invocation calls `recoverBatch(50)` once and the scheduler imports no service/output port. Add source rules scoped to `aigen.adapter.in.messaging` and `aigen.adapter.in.scheduling` that reject imports of `application.service` or `adapter.out`; do not create a global zero-exception rule while the 23 excluded current identities still exist.

- [ ] **Step 2: Pin envelope compatibility before moving it.**

  Extend the serialization test to assert exact property names `jobId,sessionId,clubId,hostUserId,provider,model,kind`, round-trip equality through the configured mapper, absence of transcript/result/prompt/evidence properties, and producer key/header/topic parity.

- [ ] **Step 3: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.adapter.in.scheduling.AiGenerationCommitRecoverySchedulerTest \
    --tests com.readmates.aigen.adapter.in.messaging.AiGenerationKafkaRecordRoutingTest \
    --tests com.readmates.aigen.adapter.messaging.AiGenerationJobConsumerLoggingTest \
    --tests com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessageSerializationTest \
    --tests com.readmates.aigen.adapter.out.messaging.AiGenerationJobProducerTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 4: Move the model and implement ports.**

  Update Kafka producer/consumer factories, serializers, deserializers, producer, recoverer, and tests to the application model package. Do not rename JSON properties or enable type headers. The scheduler retains its current fixed-delay property and batch `50`; all policy stays in the service.

- [ ] **Step 5: Run focused GREEN and Kafka regression.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.adapter.in.scheduling.AiGenerationCommitRecoverySchedulerTest \
    --tests com.readmates.aigen.adapter.in.messaging.AiGenerationKafkaRecordRoutingTest \
    --tests com.readmates.aigen.adapter.messaging.AiGenerationJobConsumerLoggingTest \
    --tests com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessageSerializationTest \
    --tests com.readmates.aigen.adapter.out.messaging.AiGenerationJobProducerTest \
    --tests com.readmates.aigen.application.service.AiGenerationWorkerTest \
    --tests com.readmates.aigen.application.service.AiGenerationCommitRecoveryServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.aigen.adapter.in.messaging.AiGenerationJobConsumerIntegrationTest \
    --tests com.readmates.aigen.adapter.messaging.GroundedAiGenerationJobConsumerIntegrationTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 6: Retire identities, review, and commit.**

  Run both architecture inventory classes. Require the reviewer to verify exact wire compatibility, ack ordering, failure propagation, scheduler thinness, no same-size baseline substitution, and the `31/8` partition. Commit:

  ```bash
  git commit -m "refactor(server): port AI job ingress"
  ```

---

### Task 3: Move AI Queue And Provider Failures To Application Models

**Files:**

- Create: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationFailureModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobProducer.kt:58-84`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt:3,92-96`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiErrorMapper.kt:12,25-133`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedProviderCallCoordinator.kt:47-63`
- Modify imports in `GroundedGenerationExecutor.kt` and all tests that consume `ProviderFailureClass`.
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobProducerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationErrorHandlerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiErrorMapperTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/GroundedProviderCallCoordinatorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`

**Interfaces:**

```kotlin
class AiGenerationQueueUnavailableException(
    cause: Throwable,
) : RuntimeException("AI generation queue unavailable", cause)

enum class ProviderFailureClass {
    PRE_TRANSPORT,
    TRANSIENT,
    RATE_LIMITED,
    SCHEMA_OR_PARSE,
    TERMINAL,
}
```

The Kafka adapter maps `InterruptedException`, `TimeoutException`, `ExecutionException`, and other runtime publication failures to `AiGenerationQueueUnavailableException`; interruption restores the thread flag. The web adapter handles only the application-owned exception. Provider SDK/Spring exceptions remain confined to the LLM adapter and map to `ProviderFailureClass` plus safe `GenerationError`.

**Exact retired identities:**

```text
com/readmates/aigen/adapter/in/web/AiGenerationErrorHandler.kt|com.readmates.aigen.adapter.out.messaging.AiGenerationJobPublishException
com/readmates/aigen/adapter/out/llm/springai/SpringAiErrorMapper.kt|com.readmates.aigen.application.service.ProviderFailureClass
```

- [ ] **Step 1: Write RED failure-contract tests.**

  Mutate each producer failure path and prove all map to the new type; assert interrupt restoration and original cause retention for server-side diagnostics. Assert the exception message is fixed and contains no job ID. Pin HTTP `503`, code `QUEUE_UNAVAILABLE`, and detail `Generation queue unavailable` for all causes. Pin provider status/timeout/rate-limit/schema/non-transient classifications and prove raw provider bodies/messages are absent.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.adapter.out.messaging.AiGenerationJobProducerTest \
    --tests com.readmates.aigen.adapter.in.web.AiGenerationErrorHandlerTest \
    --tests com.readmates.aigen.adapter.out.llm.springai.SpringAiErrorMapperTest \
    --tests com.readmates.aigen.application.service.GroundedProviderCallCoordinatorTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Implement minimal moves and mapping.**

  Delete `AiGenerationJobPublishException` from the messaging adapter and the service-local enum. Keep `parseRetryAfterDate(...).getOrNull()` unchanged: invalid optional HTTP date means no retry hint and is not a collapsed infrastructure failure.

- [ ] **Step 4: Retire identities and run GREEN.**

  Run Step 2 and both architecture inventory tests. Prove no `adapter.in` imports `AiGenerationJobProducer`/messaging failure and no outbound adapter imports `application.service.ProviderFailureClass`.

- [ ] **Step 5: Review and commit.**

  Require review of safe output, cause containment, interrupt behavior, classification parity, and `29/10` partition. Commit:

  ```bash
  git commit -m "refactor(server): own AI failure models"
  ```

---

### Task 4: Port AI Adapter Metrics And Fixed Models

**Files:**

- Create: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationMetricModels.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationAdapterMetricsPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt:48,259-323,409-416,465-469`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCounters.kt:3-115`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGate.kt:3-116`
- Modify service/test imports of `CapDenialReason` and `ProviderCircuitState` mechanically.
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCountersFailureTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCountersTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGateTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationMetricsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/MetricLabelsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`

**Interfaces:**

```kotlin
interface AiGenerationAdapterMetricsPort {
    fun recordProviderCall(provider: Provider, outcome: ProviderCircuitOutcome, duration: Duration)
    fun recordProviderGateRejection(provider: Provider, reason: ProviderGateRejection)
    fun recordProviderCircuitTransition(provider: Provider, state: ProviderCircuitState)
    fun recordCapDenial(reason: CapDenialReason)
}

enum class ProviderCircuitState { CLOSED, OPEN, HALF_OPEN, DISABLED, FORCED_OPEN, METRICS_ONLY }
enum class CapDenialReason { HOST_DAILY, CLUB_MONTHLY, HOST_PER_MINUTE }
```

`AiGenerationMetrics` implements this port. Existing application services may continue injecting `AiGenerationMetrics`; this task changes only outbound adapter dependencies and does not split the large metrics class.

**Exact retired identities:**

```text
com/readmates/aigen/adapter/out/redis/RedisGenerationCostCounters.kt|com.readmates.aigen.application.service.AiGenerationMetrics
com/readmates/aigen/adapter/out/redis/RedisGenerationCostCounters.kt|com.readmates.aigen.application.service.CapDenialReason
com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGate.kt|com.readmates.aigen.application.service.AiGenerationMetrics
com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGate.kt|com.readmates.aigen.application.service.ProviderCircuitState
```

- [ ] **Step 1: Write RED port and mutation tests.**

  Change adapter tests to fake `AiGenerationAdapterMetricsPort`. Prove host-daily denial records `HOST_DAILY` once; Redis unavailable remains fail-closed `RATE_LIMITED`; release/complete failure remains non-throwing after recording Redis failure metrics; monthly-cost unavailable retains the current zero fallback. For the provider gate, prove circuit-open and concurrency-limit rejection labels, exact transition-state mapping, success/transient/ignored call outcome, duration forwarding, permit release, and no duplicate metric after close/record races.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisGenerationCostCountersFailureTest \
    --tests com.readmates.aigen.adapter.out.resilience.ResilientProviderCallGateTest \
    --tests com.readmates.aigen.application.service.AiGenerationMetricsTest \
    --tests com.readmates.aigen.application.service.MetricLabelsTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Implement the narrow port and enum moves.**

  Preserve all meter names and tags. Do not move Micrometer into models/ports. Do not change `GenerationCostGuard` return types in this task; typed Redis list availability is Task 6.

- [ ] **Step 4: Retire identities and run GREEN.**

  Run Step 2 and both architecture inventory tests, then run the real Redis lane:

  ```bash
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisGenerationCostCountersTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationConditionalLoadingTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

  The current/retired partition must be `25/14`.

- [ ] **Step 5: Review and commit.**

  Require review of metric cardinality, names/tags, fail-closed admission, post-call cleanup semantics, permit lifecycle, and exact ledger movement. Commit:

  ```bash
  git commit -m "refactor(server): port AI adapter metrics"
  ```

---

### Task 5: Split Notification Kafka Ownership By Direction

**Files:**

- Create: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationDeliveryFailures.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/adapter/in/kafka/NotificationKafkaConsumerConfiguration.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt:1-94`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/NotificationKafkaConfiguration.kt:1-152`
- Create: `server/src/test/kotlin/com/readmates/notification/adapter/in/kafka/NotificationKafkaConsumerConfigurationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListenerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Modify: `server/config/architecture/boundary-import-baseline.txt`
- Modify: `server/config/architecture/phase-0-retired-boundary-imports.txt`

**Interfaces:**

```kotlin
class NotificationDeliveryRetryableException(
    message: String,
) : RuntimeException(message)
```

`NotificationKafkaConfiguration` retains only the properties alias/bean used by the producer adapter, producer configs/factory, serializer, and `notificationEventKafkaTemplate`. `NotificationKafkaConsumerConfiguration` owns consumer configs/factory, deserializer, DLT recoverer, `DefaultErrorHandler`, and listener container. Consumer bean methods inject `NotificationRuntimeProperties` and read `.kafka` directly; they must not import the outbound-owned `NotificationKafkaProperties` alias or depend on the producer configuration to expose that nested value. The DLT recoverer may consume `KafkaOperations<String, NotificationEventMessage>` by qualifier without importing the producer adapter class. The inbound configuration imports the same-package `NotificationUnsupportedSchemaVersionException` and application-owned retryable failure.

**Exact retired identities:**

```text
com/readmates/notification/adapter/out/kafka/NotificationKafkaConfiguration.kt|com.readmates.notification.adapter.in.kafka.NotificationUnsupportedSchemaVersionException
com/readmates/notification/adapter/out/kafka/NotificationKafkaConfiguration.kt|com.readmates.notification.application.service.NotificationDeliveryRetryableException
```

- [ ] **Step 1: Write RED configuration/behavior tests.**

  Move consumer assertions into the new consumer-configuration test. Prove `enable.auto.commit=false`, `isolation.level=read_committed`, `auto.offset.reset=earliest`, the current group, fixed retry interval/max attempts, current DLT topic/partition, retryable delivery classification, terminal unsupported-schema classification, and listener-container error-handler identity. Prove unsupported schema never dispatches; retryable dispatch exhaustion reaches DLT; successful dispatch does not retry.

- [ ] **Step 2: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.notification.adapter.in.kafka.NotificationKafkaConsumerConfigurationTest \
    --tests com.readmates.notification.adapter.in.kafka.NotificationEventKafkaListenerTest \
    --tests com.readmates.notification.adapter.out.kafka.KafkaNotificationEventPublisherAdapterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 3: Split configuration and move the failure model.**

  Duplicate only the small Jackson mapper construction needed by each transport direction; do not create a cross-adapter serialization helper. Keep bean names unchanged so listener/publisher wiring and tests remain compatible.

- [ ] **Step 4: Run GREEN and real Kafka regression.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.notification.adapter.in.kafka.NotificationKafkaConsumerConfigurationTest \
    --tests com.readmates.notification.adapter.in.kafka.NotificationEventKafkaListenerTest \
    --tests com.readmates.notification.adapter.out.kafka.KafkaNotificationEventPublisherAdapterTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 5: Retire identities, review, and commit.**

  Run both architecture inventory tests. Require review of producer/consumer bean ownership, retry/terminal classification, manual-commit/read-committed behavior, exact DLT routing, no adapter cross-import, and `23/16` partition. Commit:

  ```bash
  git commit -m "refactor(server): own notification Kafka ingress"
  ```

---

### Task 6: Make Redis AI Job Lists Explicitly Available Or Unavailable

**Files:**

- Create: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationJobListResult.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt:27-47`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt:466-530`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt:192-196`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt:49-126`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryService.kt:65-81`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreFailureTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationFailureRecoveryTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGroundedAiGenerationJobStoreTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt`

**Interfaces:**

```kotlin
enum class AiGenerationJobListOperation {
    RECENT_FOR_SESSION,
    ACTIVE,
    COMMIT_RECOVERY,
}

enum class AiGenerationJobListUnavailableReason {
    STORE_READ_FAILED,
}

sealed interface AiGenerationJobListResult {
    data class Available(val records: List<JobRecord>) : AiGenerationJobListResult
    data class Unavailable(
        val operation: AiGenerationJobListOperation,
        val reason: AiGenerationJobListUnavailableReason,
    ) : AiGenerationJobListResult
}

class AiGenerationJobListUnavailableException(
    val operation: AiGenerationJobListOperation,
) : RuntimeException("AI generation job list unavailable")
```

The three store methods return `AiGenerationJobListResult`. An authoritative empty index is `Available(emptyList())`; Redis/index/decode failure is `Unavailable(operation, STORE_READ_FAILED)` after the existing fixed Redis error/fallback metrics. No technical exception or exception message crosses the port.

Application policy is explicit and externally compatible:

- `AiGenerationOrchestrator.recent`: `Unavailable -> null`, preserving the current API response while Redis metrics expose the failure.
- `AiGenerationOpsService.summary`: `Unavailable -> emptyList()`, preserving current zero live-count projection and audit-based fields.
- `AiGenerationOpsService.list`: `Unavailable -> historical items only`, preserving current response shape and source behavior.
- `AiGenerationCommitRecoveryService.recoverBatch`: record one commit-recovery failure and throw `AiGenerationJobListUnavailableException(COMMIT_RECOVERY)` so a failed recovery scan is not reported as successful empty work.

- [ ] **Step 1: Write adapter RED tests for empty versus unavailable.**

  In `RedisAiGenerationJobStoreFailureTest`, mock each index/read dependency to throw `RedisConnectionFailureException("test-unavailable")` and assert the matching `Unavailable` operation/reason. Separately assert valid empty indexes return `Available(emptyList())`. Assert no raw exception text enters the result.

- [ ] **Step 2: Write application RED tests for all four policies.**

  Add `Available` and `Unavailable` cases to recent, ops summary, ops list, and commit-recovery tests. Mutation checks must fail if an unavailable commit scan becomes empty success, if an authoritative empty scan throws, or if unavailable ops/recent changes response shape/status.

- [ ] **Step 3: Run RED.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStoreFailureTest \
    --tests com.readmates.aigen.application.service.AiGenerationOrchestratorTest \
    --tests com.readmates.aigen.application.service.AiGenerationOpsServiceTest \
    --tests com.readmates.aigen.application.service.AiGenerationCommitRecoveryServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 4: Implement typed results and explicit policies.**

  Remove `.getOrDefault(emptyList())` from all three Redis methods. Keep stale/mismatched index pruning and limits unchanged. Catch the adapter read/decode failure at exactly one boundary, record the existing fixed operation metric, and return `Unavailable`. Do not change `load`, `loadMetadata`, recovery Lua, Redis keys, or TTLs.

- [ ] **Step 5: Run GREEN and Redis regression.**

  ```bash
  ./server/gradlew -p server unitTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStoreFailureTest \
    --tests com.readmates.aigen.application.service.AiGenerationOrchestratorTest \
    --tests com.readmates.aigen.application.service.AiGenerationOpsServiceTest \
    --tests com.readmates.aigen.application.service.AiGenerationCommitRecoveryServiceTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server integrationTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisAiGenerationFailureRecoveryTest \
    --tests com.readmates.aigen.adapter.out.redis.RedisGroundedAiGenerationJobStoreTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  ```

- [ ] **Step 6: Review and commit.**

  Require review of empty/unavailable distinction, explicit service policy, unchanged API/data/Redis contracts, recovery failure visibility, fixed safe failure, and absence of unrelated `runCatching` edits. Commit:

  ```bash
  git commit -m "fix(server): expose Redis job-list availability"
  ```

---

### Task 7: Active Documentation, Report, Canonical Gates, And Whole-Plan Review

**Files:**

- Create: `docs/superpowers/reports/2026-08-10-readmates-backend-quality-phase-2-application-port-boundaries-report.md`
- Modify: `docs/development/architecture.md:168-189`
- Modify: `docs/development/adr/0002-server-clean-architecture-with-archunit.md:161-167,193-201`
- Modify: `CHANGELOG.md:7-17`
- Do not modify the approved design or this implementation plan during execution unless a factual path/signature defect is found and reviewed.

**Report contract:**

The report records exact plan commit/base, Task 1–6 commit SHAs and subjects, changed-file inventory, the 12 exact retired identities grouped by task, final `23 current / 16 retired / 39 approved` arithmetic, focused commands and test counts, final gate commands/exit codes/durations/XML totals, public-candidate and gitleaks result, task-review verdicts/correction waves, whole-plan verdicts, skipped evidence, and residual risks. It must distinguish repository/local-Testcontainers evidence from live production evidence.

- [ ] **Step 1: Update active architecture truth.**

  Document that inbound messaging/scheduling adapters use input ports, application owns safe failure models, outbound adapters use output ports/models rather than services, notification consumer configuration is inbound-owned, and Redis job-list availability is explicit internally. State that actor/auth/session*/feature-cycle debt remains for later Phase 2 plans; do not claim Phase 2 complete or boundary baseline zero.

- [ ] **Step 2: Audit ledger and source mechanically.**

  ```bash
  ./server/gradlew -p server architectureTest \
    --tests com.readmates.architecture.ServerArchitectureInventoryTest \
    --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
    --rerun-tasks --no-build-cache --no-configuration-cache
  rg -n 'AiGenerationJobPublishException|application\.service\.(AiGenerationWorker|AiGenerationCommitRecoveryService|AiGenerationMetrics|ProviderFailureClass|CapDenialReason|ProviderCircuitState)|adapter\.out\.messaging\.AiGenerationJobMessage' server/src/main/kotlin
  rg -n 'getOrDefault\(emptyList\(\)\)' server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt
  ```

  Expected: architecture tests PASS; both scans return no match. Count non-comment ledger lines and record `23`, `16`, and `39`.

- [ ] **Step 3: Run canonical server gates sequentially at final HEAD.**

  ```bash
  ./server/gradlew -p server compileKotlin --rerun-tasks --no-build-cache --no-configuration-cache
  ./server/gradlew -p server architectureTest --rerun-tasks --no-build-cache --no-configuration-cache
  ./scripts/server-ci-check.sh
  ./server/gradlew -p server integrationTest --rerun-tasks --no-build-cache --no-configuration-cache
  git diff --check
  ```

  Record fresh XML suite/test/failure/error/skip totals and name the Kafka, Redis, admin-health, metrics, and notification suites. Frontend E2E is excluded because this plan preserves API/auth/BFF/frontend contracts and must contain no frontend/auth diff; if the final diff contains one, stop and remove it rather than widening scope.

- [ ] **Step 4: Run public-release safety gates.**

  ```bash
  ./scripts/build-public-release-candidate.sh
  ./scripts/public-release-check.sh .tmp/public-release-candidate
  ```

  Record candidate success, no `.git`/symlink result, changed-file inclusion, and gitleaks result. Do not commit `.tmp/public-release-candidate`.

- [ ] **Step 5: Run documentation and targeted safety checks.**

  ```bash
  git diff --check -- \
    docs/development/architecture.md \
    docs/development/adr/0002-server-clean-architecture-with-archunit.md \
    docs/superpowers/reports/2026-08-10-readmates-backend-quality-phase-2-application-port-boundaries-report.md \
    CHANGELOG.md
  rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
    docs/development/architecture.md \
    docs/development/adr/0002-server-clean-architecture-with-archunit.md \
    docs/superpowers/reports/2026-08-10-readmates-backend-quality-phase-2-application-port-boundaries-report.md \
    CHANGELOG.md
  ```

  Expected: diff check passes and the safety scan returns no match introduced by this plan.

- [ ] **Step 6: Task review, report commit, and clean status.**

  Require a fresh reviewer to reconcile the report against command logs, Git history, source, current/retired/approved ledgers, and exclusions. Resolve material findings and rerun affected focused plus canonical evidence. Commit only the active docs/report files:

  ```bash
  git commit -m "docs: report Phase 2 application boundaries"
  ```

- [ ] **Step 7: Whole-plan review.**

  Build one review package covering the plan commit through final HEAD. A fresh strongest reviewer must issue separate verdicts for: plan compliance and exact scope; architecture/type ownership; behavior/failure-model preservation; test/mutation adequacy; release/public safety; and readiness for the later actor/auth/session*/feature-cycle Phase 2 plans. Bundle material findings into one correction wave, rerun the smallest affected tests followed by the canonical gates, update the report, and repeat whole-plan review until all verdicts are clean.

---

## Acceptance-Matrix Mapping

- **Async, cache, or provider — selected:** Kafka ack/retry/DLT behavior, application-owned queue/provider failure classes, Redis unavailable versus empty, circuit/metric contracts, and recovery failure visibility require focused failure-path and Testcontainers evidence.
- **Architecture boundary — selected through repository guidance:** exact current/retired identity partition, inbound input-port use, outbound output-port/model use, no adapter cross-import, and scheduler thinness require both architecture test classes.
- **Persistence or migration — excluded:** Redis behavior is exercised, but there is no SQL, Flyway, database-record, or persistence ownership change.
- **Actor or authorization, club context, BFF/OAuth — excluded:** this plan modifies no actor, auth, role, permission, trusted header, session, or browser flow.
- **API/frontend — excluded:** internal failures and ports preserve response/status/schema. Frontend tests/E2E become mandatory only if scope review finds an accidental frontend/API/auth diff, which must otherwise be removed.
- **UI/runtime state — excluded:** no UI component, route, browser, responsive, or copy behavior changes.

## Mutation Checklist

Every task reviewer must confirm the corresponding detector fails when the following one-line mutation is temporarily applied and passes after restoration:

1. Health: count only `OPEN`, omitting `FORCED_OPEN`.
2. AI consumer: acknowledge before the input port returns.
3. AI scheduler: inject the concrete commit-recovery service.
4. AI envelope: add a `transcript` property or rename one of the seven wire properties.
5. Queue failure: omit interrupt restoration or expose the adapter exception.
6. Provider mapping: classify HTTP 429 as terminal rather than rate-limited.
7. Metrics: inject `AiGenerationMetrics` concrete type into either outbound adapter or change a metric tag enum.
8. Notification: retry unsupported schema or treat retryable delivery as terminal.
9. Redis: return `Available(emptyList())` after a Redis exception.
10. Commit recovery: treat `Unavailable(COMMIT_RECOVERY)` as a successful empty batch.

Mutation patches are temporary evidence only and must not be committed. Record detector command and failing assertion in the execution report.

## Explicit Residuals And Excluded Scope

- `CurrentMember`, `CurrentPlatformAdmin`, auth/club web helpers, auth concrete-service imports, sessionclosing/import/record debts, and all feature cycles remain for later Phase 2 plans.
- After this plan, boundary debt is intentionally `23`, not zero. The final Phase 2 acceptance criterion is not satisfied by this plan alone.
- The admin health registry remains in-process and observes only this application instance; it does not claim cluster-wide circuit state.
- AI recent and admin-ops APIs intentionally preserve their existing fallback projection during Redis unavailability. The adapter/application boundary becomes explicit and Redis fallback/error metrics remain the operator evidence; changing those APIs to expose availability requires separate response/status design approval.
- Commit-recovery Redis-list unavailability becomes an application-owned failure so scheduling logs/metrics do not represent it as successful empty work. Recovery retries on the next scheduled invocation.
- Notification delivery remains at-least-once and keeps the existing bounded retry/DLT behavior. This plan changes ownership, not delivery guarantees.
- Invalid optional UUID/date/cursor/provider-header parsing may continue to use nullable parsing. This plan removes only the three list-method `getOrDefault(emptyList())` ambiguity and does not perform a repository-wide `runCatching` rewrite.
- No live provider, real email, deploy, remote push, PR, tag, production-data, or production-runtime verification is authorized.
