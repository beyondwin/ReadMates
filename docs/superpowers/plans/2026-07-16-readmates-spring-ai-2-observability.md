# ReadMates Spring AI 2.0 And Distributed Tracing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unused direct OpenAI, Anthropic, and Google GenAI integrations with one grounded-only Spring AI 2.0 outbound path while preserving ReadMates domain safety, bounding every physical provider request and cost, and connecting API -> Kafka -> worker -> Spring AI -> provider traces to Grafana Tempo without recording AI content.

**Architecture:** Keep Spring AI behind the existing `WholeTranscriptGroundedGenerator` application port. A new application-owned call coordinator obtains an AI-specific circuit/concurrency permit, atomically reserves one physical call and worst-case cost in Redis, performs exactly one non-streaming Spring AI request, and reconciles the attempt to actual or unknown-estimated cost. Generation and regeneration share a maximum-three-call state machine. Micrometer observations propagate W3C context through Kafka and export OTLP traces to an internal-only single-binary Tempo service; logs, metrics, spans, baggage, and provider metadata remain content-free.

**Tech Stack:** Kotlin 2.4, Java 25, Spring Boot 4.0.6, Spring AI BOM 2.0.0, Spring AI OpenAI/Anthropic/Google GenAI starters, Spring Kafka 4.0.6, Redis Lua, MySQL/Flyway, Resilience4j 2.2.0, Micrometer Observation/Tracing, Spring Boot OpenTelemetry OTLP, Prometheus, Grafana 11.5.1, Grafana Tempo 2.10.5, Docker Compose.

## Global Constraints

- Implement the approved design in `docs/superpowers/specs/2026-07-16-readmates-spring-ai-2-observability-design.md`; do not reopen provider, retry, privacy, or tracing choices unless current code makes a stated invariant impossible.
- Keep Spring AI and provider SDK types inside `com.readmates.aigen.adapter.out.llm..` and `com.readmates.aigen.config..`. Application/domain packages must depend only on ReadMates models and ports.
- Keep `DefaultGroundedRequestRenderer`, `GroundedGenerationSchemaResource`, `GroundedDraftJsonCodec`, `GroundedGenerationValidator`, evidence projection, Redis payload TTL, commit recovery, kill switch, provider allowlist, and metadata-only Kafka payload.
- Remove the legacy pipeline and direct provider adapters completely. Do not keep dual execution, a direct-SDK fallback, `AiGenerationPipelineMode`, or a runtime pipeline selector.
- A provider gate rejection, expired admission, Redis reservation denial, or pre-transport failure proven before bytes can be accepted must consume zero physical-call slots and zero cost.
- Every possible provider HTTP request must first reserve a slot and worst-case cost. Timeout, connection reset, response loss, worker crash, or incomplete cache usage retains `ESTIMATED_UNKNOWN`; never auto-release uncertain cost.
- Enforce at most three physical requests per job across primary, fallback, schema correction, grounding repair, and user-triggered regeneration. Spring AI retry is one attempt, provider SDK retry is zero, and `validateSchema()` is forbidden.
- Retain existing relational audit identity columns because they are the established business-audit boundary. Never copy session, club, host, transcript, evidence, prompt, completion, or raw provider data into logs, metrics, spans, baggage, Kafka headers, or new audit fields.
- Prompt/completion observation and error-body logging stay disabled in every environment. Synthetic test fixtures are the only place where content may be asserted.
- Keep the public REST token contract at `input`, `cachedInput`, and `output`. Internally account for non-cached input, cache-write input, cache-read input, and output separately.
- Tempo and OTLP ports are loopback-only locally and unpublished on OCI. Tempo is not an authentication boundary. Retention is seven days and sampling starts at 100%.
- The Redis implementation assumes the repository's current single-node Redis deployment because the atomic reservation spans job, admission, and club-monthly keys. Record this explicitly in the active architecture and rollback documentation; do not claim Redis Cluster compatibility.
- Do not add real API keys, member data, private hosts, OCIDs, deployment state, or token-shaped examples. Live provider calls and production deployment remain opt-in operations outside this plan's automatic gates.
- Before every task, run `git status --short --branch --untracked-files=all`; preserve unrelated user changes and stage only files listed for that task.

---

## Target File Structure

### Application and provider boundary

- `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
  - Changes `TokenUsage` and `ModelPricing` to four internal billing channels and removes `AiGenerationPipelineMode`.
- `server/src/main/kotlin/com/readmates/aigen/application/model/ProviderCallModels.kt`
  - Owns call mode, attempt state, cost basis, failure class, reservation, reconciliation, and gate-neutral models.
- `server/src/main/kotlin/com/readmates/aigen/application/port/out/ProviderCallGate.kt`
  - Acquires a provider permit without exposing Resilience4j types.
- `server/src/main/kotlin/com/readmates/aigen/application/port/out/ProviderCallReservationPort.kt`
  - Atomically reserves and reconciles physical calls and worst-case cost.
- `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedProviderCallCoordinator.kt`
  - Implements the one-permit/one-reservation/one-HTTP-request contract.
- `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedProviderCallPolicy.kt`
  - Pure maximum-three-call state machine for fallback, correction, and repair.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGate.kt`
  - Resilience4j circuit permission and fail-fast provider semaphore adapter.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapter.kt`
  - Single-node Redis Lua adapter for attempt ledger and cost reservation.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/ProviderCallReservationRedisScripts.kt`
  - Atomic reservation, reconciliation, and stale-in-flight recovery scripts.

### Spring AI adapter

- `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationSpringAiConfig.kt`
  - Conditionally constructs three explicit `ChatModel`/`ChatClient` beans and disables single-model auto-selection.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiWholeTranscriptGroundedGenerator.kt`
  - Single implementation of `WholeTranscriptGroundedGenerator` using a provider-keyed `ChatClient` map.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/GroundedStructuredOutputConverter.kt`
  - Reuses the versioned schema and `GroundedDraftJsonCodec`; does not invoke advisor retries.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiProviderOptionsFactory.kt`
  - Creates allowlisted provider options for primary, correction, repair, and regeneration calls.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiUsageMapper.kt`
  - Maps generic/native usage to the four internal channels and reports completeness.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiErrorMapper.kt`
  - Drops raw provider content and returns typed safe failure classification.

### Audit, tracing, and operations

- `server/src/main/resources/db/mysql/migration/V38__ai_generation_provider_attempt_audit.sql`
  - Adds trace/attempt/mode/cost-basis/cache-write fields without changing existing columns.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/observability/MicrometerAiTraceContextAdapter.kt`
  - Supplies the current trace ID and content-free provider-call observations.
- `ops/tempo/tempo.yml`
  - Single-binary local-storage Tempo configuration with seven-day retention.
- `ops/observability/local/compose.yml`, `deploy/oci/compose.infra.yml`
  - Add internal Tempo and persistent storage.
- `ops/observability/local/grafana/provisioning/datasources/tempo.yml`, `deploy/oci/grafana/provisioning/datasources/tempo.yml`
  - Provision Tempo and Prometheus exemplar links.
- `scripts/validate-tempo-config.sh`, `scripts/observability-local-smoke.sh`
  - Validate configuration and prove a synthetic trace can be queried.
- `docs/development/spring-ai-2-provider-architecture.md`
  - Living code-level before/after comparison requested by the user.

---

### Task 1: Pin Spring AI And OpenTelemetry Dependencies With Safe Disabled Defaults

**Files:**
- Modify: `server/build.gradle.kts`
- Modify: `server/src/main/resources/application.yml`
- Create: `server/src/test/kotlin/com/readmates/aigen/config/SpringAiDependencyContractTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationDisabledContextTest.kt`

**Interfaces:**
- Imports Spring AI modules only through BOM `2.0.0`.
- Sets `spring.ai.model.chat=none` and all Spring AI content-observation flags to false.
- Keeps the default `readmates.aigen.enabled=false` context bootable with no provider keys and an unreachable OTLP endpoint.

- [ ] **Step 1: Establish the dependency/config RED tests**

Create `SpringAiDependencyContractTest.kt` that reads `server/build.gradle.kts` and asserts:

```kotlin
assertThat(buildFile).contains("mavenBom(\"org.springframework.ai:spring-ai-bom:2.0.0\")")
assertThat(buildFile).contains("spring-ai-starter-model-openai")
assertThat(buildFile).contains("spring-ai-starter-model-anthropic")
assertThat(buildFile).contains("spring-ai-starter-model-google-genai")
assertThat(buildFile).contains("spring-boot-starter-opentelemetry")
assertThat(buildFile).doesNotContain("implementation(\"com.openai:openai-java")
assertThat(buildFile).doesNotContain("implementation(\"com.anthropic:anthropic-java")
assertThat(buildFile).doesNotContain("implementation(\"com.google.genai:google-genai")
```

Create `AiGenerationDisabledContextTest.kt` with `ApplicationContextRunner` and properties `readmates.aigen.enabled=false`, `spring.ai.model.chat=none`, and an unreachable loopback OTLP endpoint. Assert context startup succeeds and no provider `ChatClient` map exists.

- [ ] **Step 2: Run the focused RED tests**

Run:

```bash
./server/gradlew -p server unitTest --tests '*SpringAiDependencyContractTest' --tests '*AiGenerationDisabledContextTest'
```

Expected: FAIL because the BOM/starters/privacy defaults are absent and direct dependency declarations still exist.

- [ ] **Step 3: Replace direct dependency declarations**

Add to `server/build.gradle.kts`:

```kotlin
dependencyManagement {
    imports {
        mavenBom("org.springframework.ai:spring-ai-bom:2.0.0")
    }
}
```

Replace the three direct provider dependency declarations with:

```kotlin
implementation("org.springframework.ai:spring-ai-starter-model-openai")
implementation("org.springframework.ai:spring-ai-starter-model-anthropic")
implementation("org.springframework.ai:spring-ai-starter-model-google-genai")
implementation("org.springframework.boot:spring-boot-starter-opentelemetry")
```

Do not add an explicit Spring AI module version and do not pin transitive OpenTelemetry, OkHttp, Jackson, or Netty versions beyond the repository's existing security constraints.

- [ ] **Step 4: Add fail-safe Spring AI and tracing defaults**

Add this exact shape under `spring:` in `application.yml`:

```yaml
  ai:
    model:
      chat: none
    retry:
      max-attempts: 1
    chat:
      client:
        observations:
          log-prompt: false
          log-completion: false
      observations:
        log-prompt: false
        log-completion: false
        include-error-logging: false
    tools:
      observations:
        include-content: false
```

Add under `management:`:

```yaml
  tracing:
    sampling:
      probability: ${READMATES_TRACING_SAMPLING_PROBABILITY:1.0}
  opentelemetry:
    tracing:
      export:
        otlp:
          endpoint: ${READMATES_OTLP_TRACES_ENDPOINT:http://localhost:4318/v1/traces}
```

Exporter failure must remain asynchronous/non-fatal; do not add application code that awaits or retries export on the request thread.

- [ ] **Step 5: Run the focused GREEN tests and compile**

Run:

```bash
./server/gradlew -p server unitTest --tests '*SpringAiDependencyContractTest' --tests '*AiGenerationDisabledContextTest'
./server/gradlew -p server compileKotlin compileTestKotlin
```

Expected: PASS. If compile exposes a Spring AI/Spring Boot managed-dependency conflict, stop and inspect it rather than forcing a version.

- [ ] **Step 6: Inspect dependency convergence**

Run:

```bash
./server/gradlew -p server dependencies --configuration runtimeClasspath > /tmp/readmates-spring-ai-runtime.txt
./server/gradlew -p server dependencyInsight --configuration runtimeClasspath --dependency spring-ai
./server/gradlew -p server dependencyInsight --configuration runtimeClasspath --dependency jackson-databind
./server/gradlew -p server dependencyInsight --configuration runtimeClasspath --dependency okhttp
./server/gradlew -p server dependencyInsight --configuration runtimeClasspath --dependency opentelemetry
```

Expected: Spring AI modules resolve at `2.0.0`; no duplicate Jackson 2/3 artifact families beyond the already documented bridge; no second unmanaged Spring AI version. Save only conclusions in the later architecture document, not `/tmp` output.

- [ ] **Step 7: Commit the dependency foundation**

```bash
git add server/build.gradle.kts server/src/main/resources/application.yml \
  server/src/test/kotlin/com/readmates/aigen/config/SpringAiDependencyContractTest.kt \
  server/src/test/kotlin/com/readmates/aigen/config/AiGenerationDisabledContextTest.kt
git commit -m "build: add Spring AI 2 and tracing foundation"
```

---

### Task 2: Introduce Four-Channel Usage And Pricing Without Breaking The REST Contract

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/CostCalculator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationWebDtos.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/CostCalculatorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationMetricsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`
- Modify: all focused aigen tests that construct `TokenUsage` or `ModelPricing`

**Interfaces:**

```kotlin
data class TokenUsage(
    val nonCachedInputTokens: Long,
    val cacheWriteInputTokens: Long,
    val cacheReadInputTokens: Long,
    val outputTokens: Long,
) {
    val publicInputTokens: Long get() = nonCachedInputTokens + cacheWriteInputTokens
    val publicCachedInputTokens: Long get() = cacheReadInputTokens
}

data class ModelPricing(
    val inputPerMTokenUsd: BigDecimal,
    val cacheWriteInputPerMTokenUsd: BigDecimal,
    val cachedInputPerMTokenUsd: BigDecimal,
    val outputPerMTokenUsd: BigDecimal,
)
```

- [ ] **Step 1: Write RED tests for cost math and API compatibility**

Add cases proving:

```kotlin
val usage = TokenUsage(
    nonCachedInputTokens = 1_000_000,
    cacheWriteInputTokens = 1_000_000,
    cacheReadInputTokens = 1_000_000,
    outputTokens = 1_000_000,
)
val pricing = ModelPricing(
    inputPerMTokenUsd = BigDecimal("3.00"),
    cacheWriteInputPerMTokenUsd = BigDecimal("3.75"),
    cachedInputPerMTokenUsd = BigDecimal("0.30"),
    outputPerMTokenUsd = BigDecimal("15.00"),
)
assertThat(CostCalculator.actual(usage, pricing)).isEqualByComparingTo("22.05")
assertThat(usage.publicInputTokens).isEqualTo(2_000_000)
assertThat(usage.publicCachedInputTokens).isEqualTo(1_000_000)
```

Also assert the serialized `TokenUsageJson` field set stays exactly `input`, `cachedInput`, `output` and maps input to non-cached plus cache-write.

- [ ] **Step 2: Run the focused RED tests**

```bash
./server/gradlew -p server unitTest --tests '*CostCalculatorTest' --tests '*AiGenerationMetricsTest' --tests '*FrontendZodSchemaContractTest'
```

Expected: FAIL because four-channel models and cache-write pricing do not exist.

- [ ] **Step 3: Change the domain models and addition semantics**

Implement the four fields, reject negative token counts in `init`, add `TokenUsage.ZERO`, and implement `operator fun plus` channel-by-channel. Keep the public aggregation properties shown above; do not overload `nonCachedInputTokens` with provider-gross prompt tokens.

- [ ] **Step 4: Separate actual and worst-case cost calculations**

Change `CostCalculator` to expose:

```kotlin
fun actual(usage: TokenUsage, pricing: ModelPricing): BigDecimal

fun worstCase(
    estimatedInputTokens: Long,
    maxOutputTokens: Long,
    pricing: ModelPricing,
    cacheWritePossible: Boolean,
): BigDecimal
```

`actual` prices all four channels independently. `worstCase` prices every estimated input token at `max(inputPerMTokenUsd, cacheWriteInputPerMTokenUsd)` when cache writing is possible, ignores cache-read discounts, and prices the full configured output maximum. Round only at the existing persisted precision boundary; do not round each channel before summing.

- [ ] **Step 5: Extend configuration and metrics**

Add `cacheWriteInputPerMTokenUsd` to `AiGenerationProperties.Pricing`, defaulting to `inputPerMTokenUsd` through explicit mapping in the catalog rather than a zero value. Add `cache-write-input-per-m-token-usd` to every configured model. Set Claude Sonnet 4.6 to `3.75` and Claude Opus 4.7 to `18.75`; for OpenAI and Google models without a configured write premium set it equal to normal input.

Add `CACHE_WRITE_INPUT("cache_write_input")` and rename the internal cached direction to `CACHE_READ_INPUT("cache_read_input")`. The metric label key remains `direction`, so cardinality stays bounded.

- [ ] **Step 6: Update public DTO conversion and construction sites**

Use:

```kotlin
TokenUsageJson(
    input = usage.publicInputTokens,
    cachedInput = usage.publicCachedInputTokens,
    output = usage.outputTokens,
)
```

Mechanically update all `TokenUsage(...)` and `ModelPricing(...)` call sites with named arguments. For legacy fixtures with no cache write, set `cacheWriteInputTokens=0`; never infer cache write from old `inputTokens` test values.

- [ ] **Step 7: Run focused and module-wide tests**

```bash
./server/gradlew -p server unitTest --tests '*CostCalculatorTest' --tests '*AiGenerationMetricsTest' --tests '*FrontendZodSchemaContractTest'
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.*'
```

Expected: PASS with unchanged REST fixtures and four metric directions.

- [ ] **Step 8: Commit the usage model**

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/main/resources/application.yml \
  server/src/test/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt
git commit -m "refactor: separate AI cache billing channels"
```

---

### Task 3: Add Attempt-Level Audit And Trace Correlation

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/model/ProviderCallModels.kt`
- Create: `server/src/main/resources/db/mysql/migration/V38__ai_generation_provider_attempt_audit.sql`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationAuditPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationAuditRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiTraceContextPort.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/observability/MicrometerAiTraceContextAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationAuditRepositoryTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/observability/MicrometerAiTraceContextAdapterTest.kt`

**Interfaces:**

```kotlin
enum class ProviderCallMode { PRIMARY, FALLBACK, SCHEMA_CORRECTION, SECTION_REPAIR, REGENERATE_SECTION }
enum class CostBasis { NONE, ACTUAL, ESTIMATED_UNKNOWN }

fun interface AiTraceContextPort {
    fun currentTraceId(): String?
}
```

Create `ProviderCallModels.kt` in this task with these two enums so the audit model compiles. Task 4 extends the same file with attempt/reservation models.

- [ ] **Step 1: Add RED migration and repository assertions**

Assert `ai_generation_audit_log` has nullable `trace_id`, `provider_attempt`, `provider_call_mode`, non-null `cost_basis` defaulting to `NONE`, and non-null `cache_write_input_tokens` defaulting to `0`. Add a repository insert test that persists and reads all five values and confirms an error message is already safe before repository truncation.

- [ ] **Step 2: Run the focused RED tests**

```bash
./server/gradlew -p server integrationTest --tests '*MySqlFlywayMigrationTest' --tests '*JdbcAiGenerationAuditRepositoryTest'
./server/gradlew -p server unitTest --tests '*MicrometerAiTraceContextAdapterTest'
```

Expected: FAIL because V38 and the new fields do not exist.

- [ ] **Step 3: Add the additive Flyway migration**

Create V38 with:

```sql
ALTER TABLE ai_generation_audit_log
  ADD COLUMN trace_id CHAR(32) NULL,
  ADD COLUMN provider_attempt TINYINT UNSIGNED NULL,
  ADD COLUMN provider_call_mode VARCHAR(32) NULL,
  ADD COLUMN cost_basis VARCHAR(32) NOT NULL DEFAULT 'NONE',
  ADD COLUMN cache_write_input_tokens INT NOT NULL DEFAULT 0;
```

Do not add foreign keys or indexes on `trace_id`; trace lookup is operational correlation, not a relational join path. Do not alter or drop V30/V37 columns.

- [ ] **Step 4: Extend `AuditLogEntry` and JDBC insert**

Add optional `traceId`, `providerAttempt`, `providerCallMode`, `costBasis`, and persist `usage.cacheWriteInputTokens`. Validate `traceId` against lowercase/uppercase 32-hex or null before insertion; never store `traceparent`, span ID, baggage, or provider request ID in this table.

- [ ] **Step 5: Implement current-trace lookup**

Implement `MicrometerAiTraceContextAdapter` using the injected Micrometer `Tracer.currentSpan()?.context()?.traceId()`. Return null outside a trace. The adapter must not start a span and must not log.

- [ ] **Step 6: Run GREEN tests and the complete migration suite**

```bash
./server/gradlew -p server unitTest --tests '*MicrometerAiTraceContextAdapterTest'
./server/gradlew -p server integrationTest --tests '*JdbcAiGenerationAuditRepositoryTest' --tests '*MySqlFlywayMigrationTest'
```

Expected: PASS, including migration from an empty schema and existing migration history.

- [ ] **Step 7: Commit the additive audit boundary**

```bash
git add server/src/main/resources/db/mysql/migration/V38__ai_generation_provider_attempt_audit.sql \
  server/src/main/kotlin/com/readmates/aigen/application/model/ProviderCallModels.kt \
  server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationAuditPort.kt \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationAuditRepository.kt \
  server/src/main/kotlin/com/readmates/aigen/application/port/out/AiTraceContextPort.kt \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/observability/MicrometerAiTraceContextAdapter.kt \
  server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationAuditRepositoryTest.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/observability/MicrometerAiTraceContextAdapterTest.kt
git commit -m "feat: add AI provider attempt audit correlation"
```

---

### Task 4: Make Physical Call And Worst-Case Cost Reservation Atomic

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/ProviderCallModels.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/ProviderCallReservationPort.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/ProviderCallReservationRedisScripts.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/GenerationCostGuard.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCounters.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisIndexes.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisScripts.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCountersTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt`

**Interfaces:**

```kotlin
data class ProviderCallReservationCommand(
    val attemptId: UUID,
    val jobId: UUID,
    val clubId: UUID,
    val admissionId: UUID,
    val expectedStatus: JobStatus,
    val model: ModelId,
    val mode: ProviderCallMode,
    val maximumCostUsd: BigDecimal,
    val maxCalls: Int,
    val now: Instant,
)

sealed interface ProviderCallReservationResult {
    data class Reserved(val attempt: ProviderAttempt) : ProviderCallReservationResult
    data object StateChanged : ProviderCallReservationResult
    data object AdmissionExpired : ProviderCallReservationResult
    data object CallCapExceeded : ProviderCallReservationResult
    data object MonthlyCostCapExceeded : ProviderCallReservationResult
}

interface ProviderCallReservationPort {
    fun reserve(command: ProviderCallReservationCommand): ProviderCallReservationResult
    fun reconcile(command: ProviderCallReconciliationCommand): ProviderCallReconciliationResult
    fun markUnresolvedInFlightUnknown(jobId: UUID, now: Instant): List<ProviderAttempt>
    fun clubMonthlyCost(clubId: UUID): BigDecimal
}
```

- [ ] **Step 1: Write Redis RED tests for reservation invariants**

Cover all of these independently:

- one successful reservation increments `llmCallCount`, increments monthly cost by maximum cost, and writes attempt ordinal `1` with state `IN_FLIGHT` and the job TTL;
- concurrent reservations never exceed `maxCalls=3` or the monthly cap;
- wrong job status, missing/foreign admission lease, call cap, and monthly cap write nothing;
- actual reconciliation replaces the reserved amount by applying `actual - maximum` exactly once and marks `SUCCEEDED`/`FAILED` with `ACTUAL`;
- timeout/unknown reconciliation leaves the maximum amount unchanged and marks `UNKNOWN` with `ESTIMATED_UNKNOWN`;
- repeated reconciliation with the same attempt ID is idempotent;
- stale `IN_FLIGHT` recovery marks unknown, consumes its existing slot, and never creates a second attempt;
- Redis failure is returned as a fail-closed exception before any provider-call code can run.

- [ ] **Step 2: Run the RED container test**

```bash
./server/gradlew -p server integrationTest --tests '*RedisProviderCallReservationAdapterTest'
```

Expected: FAIL because the port, adapter, and scripts do not exist.

- [ ] **Step 3: Add provider attempt models**

Define `ProviderAttemptState { IN_FLIGHT, SUCCEEDED, FAILED, UNKNOWN }`, `ProviderCallMode`, `CostBasis`, and a `ProviderAttempt` containing only random attempt ID, ordinal, job ID, provider, allowlisted model, mode, state, reserved cost, basis, safe error code, and timestamps. Do not include prompt, schema, transcript, completion, evidence, provider raw error, session ID, club ID, or user ID in the ledger payload.

- [ ] **Step 4: Implement one atomic reserve script**

The Lua operation must, in order, verify:

1. job hash exists and status equals the command's expected status;
2. admission key value equals `admissionId` and its TTL is positive;
3. `llmCallCount < maxCalls`;
4. `currentMonthlyCost + maximumCost <= clubMonthlyCostCap`;
5. attempt ID has not already been recorded.

Only after all checks pass may it increment the call count, increment monthly cost by maximum cost, assign the next ordinal, and write `IN_FLIGHT` metadata. Refresh job/ledger TTL to the configured six-hour job TTL and the monthly counter TTL only when it lacks a positive TTL.

- [ ] **Step 5: Implement idempotent reconciliation and crash recovery scripts**

For complete usage, atomically apply the delta between reserved and actual cost and persist `ACTUAL`. For uncertain outcomes, retain reserved cost and persist `ESTIMATED_UNKNOWN`. A terminal attempt cannot transition again. `markUnresolvedInFlightUnknown` changes every current `IN_FLIGHT` entry to `UNKNOWN` without changing call count or cost.

Do not add an automatic “transport probably failed” release path. A future explicit `NONE` reconciliation may exist only when a contract test proves the HTTP transport was never entered.

- [ ] **Step 6: Narrow the old cost guard**

Keep `GenerationCostGuard.checkBeforeCall`, `releaseAdmission`, and warning lookup for host daily/per-minute admission. Move lease renewal, monthly pre-reservation, and usage recording to `ProviderCallReservationPort`. Remove `recordUsage` after all callers migrate in Task 6; until then, deprecate it and make tests prevent double accounting.

- [ ] **Step 7: Run Redis GREEN and race tests**

```bash
./server/gradlew -p server integrationTest --tests '*RedisProviderCallReservationAdapterTest' \
  --tests '*RedisGenerationCostCountersTest' --tests '*RedisAiGenerationJobStoreTest'
```

Expected: PASS with 50+ concurrent reservation attempts never producing more than three reservations and never crossing the configured cost cap.

- [ ] **Step 8: Commit the reservation ledger**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/model/ProviderCallModels.kt \
  server/src/main/kotlin/com/readmates/aigen/application/port/out/ProviderCallReservationPort.kt \
  server/src/main/kotlin/com/readmates/aigen/application/port/out/GenerationCostGuard.kt \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/redis \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/redis
git commit -m "feat: reserve AI calls and cost atomically"
```

---

### Task 5: Add AI-Specific Circuit And Bounded Concurrency Permits

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/ProviderCallGate.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGate.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGateTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationMetricsTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

**Interfaces:**

```kotlin
enum class ProviderCircuitOutcome { SUCCESS, TRANSIENT_FAILURE, IGNORED_FAILURE }
enum class ProviderGateRejection { CIRCUIT_OPEN, CONCURRENCY_LIMIT }

sealed interface ProviderPermitDecision {
    data class Acquired(val permit: ProviderCallPermit) : ProviderPermitDecision
    data class Rejected(val reason: ProviderGateRejection) : ProviderPermitDecision
}

interface ProviderCallPermit : AutoCloseable {
    fun record(outcome: ProviderCircuitOutcome, elapsed: Duration)
}

fun interface ProviderCallGate {
    fun tryAcquire(provider: Provider): ProviderPermitDecision
}
```

- [ ] **Step 1: Write gate RED tests**

Test that the adapter:

- gives at most two concurrent permits per provider/instance by default and rejects the third without blocking;
- keeps OpenAI/Claude/Gemini semaphores independent;
- rejects without invoking downstream code when the provider circuit is open;
- records timeout/network/5xx as circuit failures;
- records 429, auth, permission, safety, invalid request, context limit, schema, parse, and grounding failures as ignored failures;
- releases permits in `close()` even when reconciliation throws;
- never exposes a Resilience4j type through the application port.

- [ ] **Step 2: Run the RED tests**

```bash
./server/gradlew -p server unitTest --tests '*ResilientProviderCallGateTest' --tests '*ServerArchitectureBoundaryTest'
```

Expected: FAIL because the AI-specific gate does not exist.

- [ ] **Step 3: Add bounded configuration**

Add to `AiGenerationProperties`:

```kotlin
data class ProviderCalls(
    val requestTimeout: Duration = Duration.ofMinutes(4),
    val maxConcurrentPerProvider: Int = 2,
    val transientBackoffBase: Duration = Duration.ofSeconds(1),
    val transientBackoffMax: Duration = Duration.ofSeconds(30),
)
```

Validate `maxConcurrentPerProvider in 1..16`, timeout positive and at most four minutes, and backoff base not greater than max. Add matching environment-backed YAML properties.

- [ ] **Step 4: Implement manual Resilience4j permission handling**

Use a dedicated circuit name `aigen-provider-${provider.name.lowercase()}` and one fair `Semaphore(maxConcurrentPerProvider)` per provider. Acquire circuit permission first, then `tryAcquire()` the semaphore without waiting. Return a boundary-safe rejection enum on failure.

The acquired permit records exactly one of:

```text
SUCCESS            -> circuitBreaker.onSuccess(...)
TRANSIENT_FAILURE  -> circuitBreaker.onError(...)
IGNORED_FAILURE    -> circuitBreaker.onSuccess(...)
```

`close()` releases the semaphore exactly once. The coordinator, not this adapter, decides fallback and application errors.

- [ ] **Step 5: Add bounded gate metrics**

Add counters/timers with only `provider`, `status`, and `reason` allowlisted values:

- `readmates.aigen.provider.calls`
- `readmates.aigen.provider.call.latency`
- `readmates.aigen.provider.gate.rejections`
- `readmates.aigen.provider.circuit.state.transitions`

Do not tag attempt ID, job ID, trace ID, model string outside the catalog, exception class, HTTP URL, or status text.

- [ ] **Step 6: Run GREEN tests and architecture checks**

```bash
./server/gradlew -p server unitTest --tests '*ResilientProviderCallGateTest' --tests '*AiGenerationMetricsTest'
./server/gradlew -p server architectureTest
```

Expected: PASS. Application code has no `io.github.resilience4j` dependency.

- [ ] **Step 7: Commit the provider gate**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/port/out/ProviderCallGate.kt \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGate.kt \
  server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt \
  server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationMetrics.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/resilience/ResilientProviderCallGateTest.kt \
  server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationMetricsTest.kt \
  server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "feat: gate AI providers with circuit and concurrency limits"
```

---

### Task 6: Centralize The Three-Call Policy And One-Call Coordination

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedProviderCallPolicy.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedProviderCallCoordinator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedGenerationExecutor.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedRegenerationExecutor.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/ProviderFallbackChain.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/GenerationCostGuard.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCounters.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/GroundedProviderCallPolicyTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/GroundedProviderCallCoordinatorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/GroundedGenerationExecutorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/GroundedRegenerationExecutorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerFailoverTest.kt`

**Interfaces:**

```kotlin
data class GroundedProviderCallCommand(
    val record: JobRecord,
    val admissionId: UUID,
    val expectedStatus: JobStatus,
    val model: ModelId,
    val mode: ProviderCallMode,
    val request: RenderedGroundedRequest,
    val section: GenerationItem? = null,
)

sealed interface GroundedProviderCallResult {
    data class Generated(val output: GroundedGenerationOutput, val attempt: ProviderAttempt) : GroundedProviderCallResult
    data class Repaired(val output: GroundedSectionRepairOutput, val attempt: ProviderAttempt) : GroundedProviderCallResult
    data class Failed(val error: GenerationError, val failureClass: ProviderFailureClass, val attempt: ProviderAttempt?) : GroundedProviderCallResult
    data object StateChanged : GroundedProviderCallResult
}
```

- [ ] **Step 1: Write property-style RED tests for the policy**

Table-drive every transition:

```text
slot 1 PRIMARY + valid                         -> COMPLETE
slot 1 PRIMARY + parse/schema                  -> slot 2 SCHEMA_CORRECTION, same provider
slot 1 PRIMARY + repairable grounding          -> slot 2 SECTION_REPAIR, same provider
slot 1 PRIMARY + timeout/network/5xx/429       -> slot 2 FALLBACK or capped same-provider retry
slot 2 successful parsed + repairable grounding -> slot 3 SECTION_REPAIR
slot 2 any other failure                       -> FAIL
slot 3 any failure                             -> FAIL
```

Generate all sequences up to length six and assert no decision ever returns ordinal greater than three, schema correction occurs at most once, repair occurs at most once, and fallback occurs at most once.

- [ ] **Step 2: Write coordinator RED tests for ordering**

Use recording fakes and assert exact event order:

```text
gate.acquire
reservation.reserve
generator.generate-or-repair
reservation.reconcile
permit.record
permit.close
```

Also prove gate rejection and reservation rejection never invoke the generator, uncertain exceptions reconcile to `ESTIMATED_UNKNOWN`, complete usage reconciles to `ACTUAL`, and an audit row receives the attempt ordinal/mode/trace ID.

- [ ] **Step 3: Run RED tests**

```bash
./server/gradlew -p server unitTest --tests '*GroundedProviderCallPolicyTest' --tests '*GroundedProviderCallCoordinatorTest'
```

Expected: FAIL because policy/coordinator do not exist.

- [ ] **Step 4: Implement the pure decision policy**

Represent inputs as typed call outcome classes, not exception-message matching. Use the approved matrix:

- timeout/network/5xx: transient failure, jittered backoff, eligible fallback;
- 429: rate-limited, capped `Retry-After`, does not fail circuit;
- schema/parse: one same-provider strengthened correction;
- parsed grounding violation: one section repair;
- auth/permission/safety/invalid/context: terminal failure;
- gate rejection: no slot/cost; policy may select fallback only if no other fallback was used.

Inject `Sleeper` and a seeded/testable jitter source. Cap all sleeps at `transientBackoffMax`; never sleep while holding a provider permit.

- [ ] **Step 5: Implement the one-call coordinator**

For each call:

1. compute worst-case cost from rendered input estimate, exact max output, model pricing, and whether this provider mode can create a cache;
2. obtain `ProviderCallGate.tryAcquire`;
3. while the permit is held, call `ProviderCallReservationPort.reserve`;
4. perform exactly one `WholeTranscriptGroundedGenerator.generate` or `.repair` call;
5. map usage completeness and failure class;
6. reconcile to `ACTUAL` or `ESTIMATED_UNKNOWN` in a `finally`-safe path;
7. record circuit outcome and close the permit;
8. emit attempt audit/metric/observation metadata.

If Redis reconciliation itself fails after a physical request, propagate a retryable worker failure but never issue another provider call in the same invocation. The next redelivery first marks the attempt unknown.

- [ ] **Step 6: Route generation and regeneration through the coordinator**

Remove duplicate `callGenerate`, `callRepair`, direct `reserveLlmCall`, post-success `recordUsage`, and separate retry loops from both executors. Both must ask `GroundedProviderCallPolicy` for the next mode. Simplify `ProviderFallbackChain` to choose only persisted grounded-capable candidates from the catalog and available generator map.

At worker entry, before any new provider call, invoke `markUnresolvedInFlightUnknown(jobId, clock.instant())`. This recovery is idempotent and occurs only for a RUNNING/SUCCEEDED job eligible for the requested operation.

- [ ] **Step 7: Remove double-accounting APIs**

After all call sites use the coordinator, remove `AiGenerationJobStore.incrementLlmCallCount`, `reserveLlmCall`, `LlmCallReservation`, `GenerationCostGuard.recordUsage`, and `GenerationCostGuard.renewAdmission`. Keep initial host admission and safe release when queue publication fails before any provider request.

- [ ] **Step 8: Run GREEN executor and worker tests**

```bash
./server/gradlew -p server unitTest --tests '*GroundedProviderCallPolicyTest' \
  --tests '*GroundedProviderCallCoordinatorTest' \
  --tests '*GroundedGenerationExecutorTest' \
  --tests '*GroundedRegenerationExecutorTest' \
  --tests '*AiGenerationWorkerTest' \
  --tests '*AiGenerationWorkerFailoverTest'
```

Expected: PASS. Counter fakes show no path above three physical calls.

- [ ] **Step 9: Run Redis-backed redelivery integration tests**

Add/extend an integration test that crashes after the fake provider response but before reconciliation, redelivers the Kafka job, verifies the first attempt becomes `UNKNOWN`, and proves total reservations remain at most three.

```bash
./server/gradlew -p server integrationTest --tests '*AiGenerationJobConsumerIntegrationTest' \
  --tests '*RedisProviderCallReservationAdapterTest'
```

- [ ] **Step 10: Commit the application-owned call state machine**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/redis \
  server/src/test/kotlin/com/readmates/aigen/application \
  server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/redis
git commit -m "refactor: centralize bounded AI provider calls"
```

---

### Task 7: Build The Common Spring AI Structured-Output Adapter

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationSpringAiConfig.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiWholeTranscriptGroundedGenerator.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/GroundedStructuredOutputConverter.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiProviderOptionsFactory.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiUsageMapper.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiErrorMapper.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/WholeTranscriptGroundedGenerator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationBeansConfig.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationSpringAiConfigTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/GroundedStructuredOutputConverterTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiWholeTranscriptGroundedGeneratorTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiUsageMapperTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiErrorMapperTest.kt`

**Interfaces:**

```kotlin
class GroundedStructuredOutputConverter(
    private val schemaJson: String,
    private val objectMapper: ObjectMapper,
) : StructuredOutputConverter<ObjectNode> {
    override fun getFormat(): String = ""
    override fun getJsonSchema(): String = schemaJson
    override fun convert(source: String): ObjectNode =
        StructuredOutputJson.requireObject(objectMapper.readTree(source))
}
```

- [ ] **Step 1: Write common adapter RED tests**

Prove:

- converter returns the exact schema text and parses only a JSON object;
- the adapter invokes `ChatClient` once per method call and never calls `validateSchema()`;
- generated and repaired nodes are decoded through `GroundedDraftJsonCodec`;
- no prompt, completion, schema body, evidence, raw exception message, or provider response object appears in thrown safe errors;
- complete generic usage and provider-native cache fields map to four channels; incomplete cache breakdown returns `usageComplete=false`;
- enabled provider without key/capability fails with an actionable startup error only when AI is enabled and non-mock;
- disabled AI context has no key requirement.

- [ ] **Step 2: Run common adapter RED tests**

```bash
./server/gradlew -p server unitTest --tests '*GroundedStructuredOutputConverterTest' \
  --tests '*SpringAiWholeTranscriptGroundedGeneratorTest' \
  --tests '*SpringAiUsageMapperTest' --tests '*SpringAiErrorMapperTest' \
  --tests '*AiGenerationSpringAiConfigTest'
```

Expected: FAIL because the Spring AI adapter/configuration does not exist.

- [ ] **Step 3: Implement a converter with no advisor retry**

Use `StructuredOutputConverter<ObjectNode>`. Keep `getFormat()` empty so the deterministic renderer remains the only prompt source, and return `schemaJson` from `getJsonSchema()`. Invoke:

```kotlin
val entity =
    chatClient
        .prompt()
        .system(request.systemText)
        .user(request.userText)
        .options(optionsFactory.options(provider, model, request, mode))
        .call()
        .responseEntity(converter) { it.useProviderStructuredOutput() }
```

Do not add `.validateSchema()` or any retry advisor. Decode `entity.entity()` with the retained domain codec and read usage from `entity.response().metadata.usage` plus allowlisted native usage fields.

- [ ] **Step 4: Build explicit provider-keyed ChatClients**

Set `spring.ai.model.chat=none`. Construct only allowlisted enabled provider models under `@ConditionalOnProperty(readmates.aigen.enabled=true)`. Build each client through `ChatClientBuilderConfigurer` and the available observation conventions/tool-advisor builder so Spring AI observations are retained without enabling tool calls:

```kotlin
val builder = ChatClient.builder(
    chatModel,
    observationRegistry.getIfUnique { ObservationRegistry.NOOP },
    chatClientObservationConvention.getIfUnique(),
    advisorObservationConvention.getIfUnique(),
    toolCallingAdvisorBuilder.getIfAvailable(),
)
configurer.configure(builder).build()
```

Expose `Map<Provider, ChatClient>` and one `SpringAiWholeTranscriptGroundedGenerator` per enabled provider. Provider SDK client construction is allowed only inside this configuration as a Spring AI `ChatModel` dependency; no ReadMates adapter may invoke the SDK directly.

- [ ] **Step 5: Implement safe error and usage mapping**

Map status/exception types to a fixed `ProviderFailureClass` and fixed safe message. Parse capped `Retry-After` metadata without storing headers. Treat unknown exceptions after the call starts as uncertain/transient. Discard response bodies and native exception text before creating `GenerationError` or audit data.

Map Spring AI `Usage.getPromptTokens`, `getCompletionTokens`, `getCacheReadInputTokens`, and `getCacheWriteInputTokens`. Compute non-cached input as `max(prompt - cacheRead - cacheWrite, 0)` only when the provider contract defines prompt as gross; provider strategies may override from native usage. Mark completeness false when cache use is enabled but write/read breakdown is absent.

- [ ] **Step 6: Run common adapter GREEN tests and architecture checks**

```bash
./server/gradlew -p server unitTest --tests '*GroundedStructuredOutputConverterTest' \
  --tests '*SpringAiWholeTranscriptGroundedGeneratorTest' \
  --tests '*SpringAiUsageMapperTest' --tests '*SpringAiErrorMapperTest' \
  --tests '*AiGenerationSpringAiConfigTest'
./server/gradlew -p server architectureTest
```

Expected: PASS and Spring AI imports remain absent from application packages.

- [ ] **Step 7: Commit the common Spring AI boundary**

```bash
git add server/src/main/kotlin/com/readmates/aigen/config \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai \
  server/src/main/kotlin/com/readmates/aigen/application/port/out/WholeTranscriptGroundedGenerator.kt \
  server/src/test/kotlin/com/readmates/aigen/config \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai
git commit -m "feat: add common Spring AI grounded adapter"
```

---

### Task 8: Lock Down OpenAI Request And No-Retry Contracts

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationSpringAiConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiProviderOptionsFactory.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiUsageMapper.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/OpenAiSpringAiContractTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/ProviderMockHttpServer.kt`

- [ ] **Step 1: Add OpenAI RED option and wire-count tests**

Assert the built `OpenAiChatOptions` has allowlisted model, exact maximum completion tokens, `store=false`, strict provider structured output, and the versioned output schema. Start a local JDK `HttpServer`, return 429 and 500 responses, and assert a single adapter invocation produces exactly one HTTP request in each case.

- [ ] **Step 2: Run the OpenAI RED test**

```bash
./server/gradlew -p server unitTest --tests '*OpenAiSpringAiContractTest'
```

Expected: FAIL until OpenAI model/options are wired.

- [ ] **Step 3: Configure the OpenAI Spring AI model**

Build the underlying OpenAI client/model with the existing `READMATES_AIGEN_OPENAI_API_KEY`, four-minute timeout, and SDK max retries `0`. Set Spring AI retry max attempts to `1`. Keep the API key lookup lazy/conditional so disabled and mock contexts need no key.

Build each call's options with:

```kotlin
OpenAiChatOptions.builder()
    .model(model.name)
    .maxCompletionTokens(request.maxOutputTokens.toLong())
    .store(false)
    .outputSchema(request.schemaJson)
    .build()
```

Use provider structured output and do not use tools, web search, streaming, or stored responses.

- [ ] **Step 4: Map OpenAI usage without double counting cache reads**

Treat `promptTokens` as gross input. Set `cacheReadInputTokens` from the cache-read detail, `cacheWriteInputTokens=0`, and `nonCachedInputTokens=prompt-cacheRead`. Reject negative/inconsistent breakdown as incomplete and retain worst-case reservation.

- [ ] **Step 5: Run OpenAI GREEN and hidden-retry tests**

```bash
./server/gradlew -p server unitTest --tests '*OpenAiSpringAiContractTest' --tests '*SpringAiUsageMapperTest'
```

Expected: PASS; 429, 500, timeout, and malformed JSON each show one request for one reserved attempt.

- [ ] **Step 6: Commit OpenAI Spring AI support**

```bash
git add server/src/main/kotlin/com/readmates/aigen/config/AiGenerationSpringAiConfig.kt \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/OpenAiSpringAiContractTest.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/ProviderMockHttpServer.kt
git commit -m "feat: route OpenAI through Spring AI"
```

---

### Task 9: Lock Down Anthropic Structured Output, Caching, And Usage

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationSpringAiConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiProviderOptionsFactory.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiUsageMapper.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationConfigValidator.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/AnthropicSpringAiContractTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationConfigValidatorTest.kt`

- [ ] **Step 1: Add Anthropic RED contract tests**

Assert the initial native-structured-output allowlist contains `claude-sonnet-4-6` only, `SYSTEM_ONLY` prompt caching is used, max retries is zero, and one reserved attempt produces one HTTP request for 429/500/timeout/schema conversion failure. A model addition must change the capability map, pricing, verification date, and this contract test together. Assert cache creation, cache read, non-cached input, and output remain distinct.

- [ ] **Step 2: Run the Anthropic RED tests**

```bash
./server/gradlew -p server unitTest --tests '*AnthropicSpringAiContractTest' --tests '*AiGenerationConfigValidatorTest'
```

Expected: FAIL until Anthropic model/options and capability validation are wired.

- [ ] **Step 3: Configure Anthropic with native structured output**

Build the Anthropic model with `READMATES_AIGEN_ANTHROPIC_API_KEY`, four-minute timeout, and `maxRetries=0`. Build options with allowlisted model, exact max tokens, output schema, and `AnthropicCacheStrategy.SYSTEM_ONLY`. Do not cache user/transcript messages and do not fall back to tool-use emulation for unsupported models.

- [ ] **Step 4: Fail closed on incomplete cache metadata**

Map native `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, and `output_tokens` directly to four channels. If cache strategy is active and either cache field cannot be read from generic or native usage, set `usageComplete=false`; the coordinator must leave the full reservation at `ESTIMATED_UNKNOWN` rather than applying a cache discount.

- [ ] **Step 5: Validate the capability allowlist**

Make startup fail with a content-free message when an enabled Anthropic model lacks verified native structured output or pricing/cache-write rate. Keep this validation data-driven from the grounded capability/pricing maps, not a prefix-only guess.

- [ ] **Step 6: Run Anthropic GREEN tests**

```bash
./server/gradlew -p server unitTest --tests '*AnthropicSpringAiContractTest' \
  --tests '*SpringAiUsageMapperTest' --tests '*AiGenerationConfigValidatorTest'
```

Expected: PASS with a single wire request and exact cache-write/read cost mapping.

- [ ] **Step 7: Commit Anthropic Spring AI support**

```bash
git add server/src/main/kotlin/com/readmates/aigen/config \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/AnthropicSpringAiContractTest.kt \
  server/src/test/kotlin/com/readmates/aigen/config/AiGenerationConfigValidatorTest.kt
git commit -m "feat: route Anthropic through Spring AI"
```

---

### Task 10: Lock Down Google GenAI Schema, Thinking, Search, And Retention

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationSpringAiConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiProviderOptionsFactory.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/springai/SpringAiUsageMapper.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiSchemaCompatAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationConfigValidator.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/GoogleGenAiSpringAiContractTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiSchemaCompatAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationConfigValidatorTest.kt`

- [ ] **Step 1: Add Google GenAI RED contract tests**

Assert response MIME is `application/json`, adapted schema is present, exact max output tokens are used, thinking budget is zero, thought output/search/tools are disabled, paid-tier retention confirmation is mandatory, and a best-effort `x-goog-data-policy: no-retention` header is sent. Count exactly one HTTP request for 429/500/timeout/malformed JSON.

- [ ] **Step 2: Run Google RED tests**

```bash
./server/gradlew -p server unitTest --tests '*GoogleGenAiSpringAiContractTest' \
  --tests '*GeminiSchemaCompatAdapterTest' --tests '*AiGenerationConfigValidatorTest'
```

Expected: FAIL until the Google model/options and retention invariant are implemented.

- [ ] **Step 3: Configure the Google GenAI model with one-attempt retry**

Construct `com.google.genai.Client` only as the required dependency of Spring AI's `GoogleGenAiChatModel`; no ReadMates adapter may call it. Use `READMATES_AIGEN_GEMINI_API_KEY`, four-minute `HttpOptions` timeout, best-effort no-retention header, and a `RetryTemplate` with `maxAttempts(1)`.

Build options with Spring AI 2.0's `GoogleGenAiChatOptions` builder:

```kotlin
GoogleGenAiChatOptions.builder()
    .model(model.name)
    .maxOutputTokens(request.maxOutputTokens)
    .responseMimeType("application/json")
    .outputSchema(geminiSchemaCompatAdapter.adapt(request.schemaJson))
    .thinkingBudget(0)
    .includeThoughts(false)
    .googleSearchRetrieval(false)
    .includeServerSideToolInvocations(false)
    .build()
```

For the current `gemini-3-flash-preview` allowlist entry, the mock-wire contract and an opt-in live contract must prove the provider accepts the no-thinking setting. If Spring AI/provider validation rejects `thinkingBudget(0)` for that model, fail startup for the model and require a separately reviewed allowlist change; do not silently fall back to provider-managed thinking. Do not enable function tools, code execution, URL context, cached-content creation, grounding/search, or streaming.

- [ ] **Step 4: Enforce retention as an operational invariant**

Add `readmates.aigen.providers.google.paid-tier-retention-confirmed`, default `false`. When Gemini is enabled with `mock=false`, require it to be true and fail startup with a message naming the setting but never the key/project. Document the request header as best-effort only; it does not replace paid-tier confirmation.

- [ ] **Step 5: Map Google usage conservatively**

Treat prompt count as gross, subtract supported cached-read tokens for non-cached input, set cache-write zero because this plan does not create Google cached content, and map candidate/output tokens. If the provider reports a cache field inconsistent with gross input, mark usage incomplete and retain worst-case reservation.

- [ ] **Step 6: Run Google GREEN tests**

```bash
./server/gradlew -p server unitTest --tests '*GoogleGenAiSpringAiContractTest' \
  --tests '*GeminiSchemaCompatAdapterTest' --tests '*SpringAiUsageMapperTest' \
  --tests '*AiGenerationConfigValidatorTest'
```

Expected: PASS with one request per reserved attempt and no thinking/search/tool fields enabled.

- [ ] **Step 7: Commit Google GenAI Spring AI support**

```bash
git add server/src/main/kotlin/com/readmates/aigen/config \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/llm \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/llm \
  server/src/test/kotlin/com/readmates/aigen/config/AiGenerationConfigValidatorTest.kt
git commit -m "feat: route Google GenAI through Spring AI"
```

---

### Task 11: Switch To Grounded-Only Wiring And Delete Legacy/Direct SDK Code

**Files:**
- Delete: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/{openai,claude,gemini}/*ApiClient.kt`
- Delete: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/{openai,claude,gemini}/*ApiPort.kt`
- Delete: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/{openai,claude,gemini}/*ContentGenerator.kt`
- Delete: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/{openai,claude,gemini}/*ContentRegenerator.kt`
- Delete: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/{openai,claude,gemini}/*WholeTranscriptGroundedGenerator.kt`
- Delete: `server/src/main/kotlin/com/readmates/aigen/application/port/out/SessionContentGenerator.kt`
- Delete: `server/src/main/kotlin/com/readmates/aigen/application/port/out/SessionContentRegenerator.kt`
- Delete: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/LlmPromptBuilder.kt`
- Delete: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/SessionImportSchemaResource.kt`
- Delete: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/LlmErrorMapper.kt`
- Delete: `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/common/LlmGenerationException.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationRegenerationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationBeansConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationConfigValidator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisRecordCodec.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationWebDtos.kt`
- Modify: all aigen tests and mocks that reference legacy types or pipeline mode
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: Add architecture RED tests for complete removal**

Add bytecode/source assertions that:

- `AiGenerationPipelineMode`, `SessionContentGenerator`, `SessionContentRegenerator`, provider `ApiPort`/`ApiClient`, and provider-specific grounded generator simple names do not exist;
- application packages do not import `org.springframework.ai..`, `com.openai..`, `com.anthropic..`, `com.google.genai..`, or `io.github.resilience4j..`;
- production source and config contain no `pipelineMode`, `pipeline-mode`, `READMATES_AIGEN_PIPELINE_MODE`, or `LEGACY` aigen branch;
- `server/build.gradle.kts` contains no direct provider SDK declaration;
- exactly one production implementation class of `WholeTranscriptGroundedGenerator` remains.

- [ ] **Step 2: Run the architecture RED tests**

```bash
./server/gradlew -p server architectureTest
```

Expected: FAIL while legacy/direct classes remain.

- [ ] **Step 3: Make worker/orchestrator/regeneration grounded-only**

Remove every `pipelineMode` branch. `AiGenerationWorker` always calls the grounded executor. Regeneration always uses `GroundedRegenerationExecutor`. `JobView.toStatusResponse()` always enforces complete grounded result/evidence on success. Keep `pipelineVersion="grounded-session-generation-v2"` as static audit metadata; do not use it as a runtime selector.

- [ ] **Step 4: Make Redis rolling reads tolerant but writes grounded-only**

Remove `pipelineMode` from `JobRecord`, `JobView`, new hash writes, and execution decisions. `AiGenerationRedisRecordCodec.fromHash` must ignore an old unknown `pipelineMode` field naturally and reconstruct grounded records from source-context/result/evidence payloads. Add a test loading a hash that still contains `pipelineMode=LEGACY` and prove the field is ignored, not used to route execution.

New writes must not persist `sessionMeta` or `instructions` in the job hash; those remain only in the existing short-lived grounded source-context payload.

- [ ] **Step 5: Delete direct and legacy code/tests**

Delete the listed production classes and their dedicated `*ApiClientLiveContractTest`, `*ContentGeneratorTest`, `*ContentRegeneratorTest`, fake API, old provider grounded generator tests, and `ProviderSdkRetryContractTest`. Preserve and migrate schema/renderer/codec/compat tests to the new Spring AI tests.

Use `rg` to verify that every remaining reference belongs to the deletion set before deleting the common classes:

```bash
rg -n 'LlmPromptBuilder|SessionImportSchemaResource|StructuredOutputJson|LlmErrorMapper|LlmGenerationException' server/src
```

Retain `StructuredOutputJson`: `GroundedStructuredOutputConverter` uses its strict object check and the migrated converter tests cover that behavior.

- [ ] **Step 6: Update mocks and integration fixtures**

Replace mock legacy generators with deterministic `WholeTranscriptGroundedGenerator` fakes that emit four-channel usage. Remove pipeline-mode properties from every test. Keep the feature-disabled default and existing metadata-only Kafka fixture.

- [ ] **Step 7: Prove removal and grounded flow**

```bash
rg -n 'AiGenerationPipelineMode|pipelineMode|pipeline-mode|SessionContentGenerator|SessionContentRegenerator' server/src && exit 1 || true
rg -n 'com\.openai|com\.anthropic|com\.google\.genai' server/src/main/kotlin/com/readmates/aigen/application && exit 1 || true
./server/gradlew -p server architectureTest
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.*'
./server/gradlew -p server integrationTest --tests '*AiGenerateGroundedCommitIntegrationTest' \
  --tests '*AiGenerationJobConsumerIntegrationTest' --tests '*RedisGroundedAiGenerationJobStoreTest'
```

Expected: searches produce no forbidden runtime references and all grounded tests pass.

- [ ] **Step 8: Commit the clean replacement**

```bash
git add -A server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen \
  server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "refactor: remove legacy AI provider pipelines"
```

---

### Task 12: Add Content-Free AI Observations, Trace IDs, And MDC

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiProviderObservationPort.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/observability/MicrometerAiProviderObservationAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/GroundedProviderCallCoordinator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumer.kt`
- Modify: `server/src/main/resources/logback-spring.xml`
- Modify: `server/src/test/kotlin/com/readmates/shared/observability/LogbackJsonEncoderTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/observability/MicrometerAiProviderObservationAdapterTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumerLoggingTest.kt`
- Modify: `scripts/aigen-pii-check.sh`

**Interfaces:**

```kotlin
interface AiProviderObservationPort {
    fun <T> observe(context: AiProviderObservationContext, block: () -> T): T
}

data class AiProviderObservationContext(
    val provider: Provider,
    val model: ModelId,
    val mode: ProviderCallMode,
    val attemptOrdinal: Int,
    val jobId: UUID,
)
```

- [ ] **Step 1: Add RED privacy and observation tests**

Capture observations/log output and assert allowed fields are limited to:

```text
traceId, spanId, requestId, jobId, provider, model, stage, attempt, callMode, outcome, errorCode
```

Assert prompt, completion, transcript, schema, evidence, instructions, raw exception, API key, provider request/response objects, session ID, club ID, host/user ID, email, and baggage are absent. `jobId` is the random internal job identifier and is allowed only in spans/MDC, never as a metric tag.

- [ ] **Step 2: Run privacy RED tests**

```bash
./server/gradlew -p server unitTest --tests '*MicrometerAiProviderObservationAdapterTest' \
  --tests '*AiGenerationJobConsumerLoggingTest' --tests '*LogbackJsonEncoderTest'
bash scripts/aigen-pii-check.sh
```

Expected: FAIL because AI observation/MDC allowlists and scanner rules are incomplete.

- [ ] **Step 3: Implement the custom observation**

Create observation name `readmates.aigen.provider.call`. Low-cardinality keys are provider, allowlisted model, call mode, outcome, and safe error code. High-cardinality span-only keys are random job ID and attempt ordinal. Do not add events containing prompt stages or provider bodies. Nest this observation around the Spring AI call so Spring AI chat and HTTP client spans remain children.

- [ ] **Step 4: Add safe MDC lifecycle**

Add `traceId`, `spanId`, `jobId`, `provider`, `stage`, and `attempt` includes to `logback-spring.xml`. Use scoped MDC closeables around worker/call handling and always clear them. Keep existing global application MDC fields for other features, but AI code must never set or interpolate `sessionId`, `clubSlug`, `actorId`, or user/club values.

Replace the consumer failure log with a fixed safe shape:

```kotlin
log.error(
    "AI generation worker failed errorCode={} failureClass={}",
    safeErrorCode,
    failureClass,
)
```

Do not pass the exception object or `ex.message` for provider/AI failures. Infrastructure-only errors may log a fixed exception class allowlist after a scanner test proves no provider body can reach it.

- [ ] **Step 5: Extend the PII scanner**

Add self-tested checks that fail on:

- Spring AI prompt/completion observation flags not explicitly false;
- `include-error-logging` or tool content enabled;
- any logging/advisor call that receives prompt/request/response/content objects;
- `baggage`, `BaggageField`, or session/user/club IDs in aigen tracing code;
- raw exception interpolation or throwable logging under `aigen`;
- forbidden span/metric key names;
- Kafka payload/header additions containing content or identity fields.

- [ ] **Step 6: Run GREEN privacy and observability tests**

```bash
./server/gradlew -p server unitTest --tests '*MicrometerAiProviderObservationAdapterTest' \
  --tests '*AiGenerationJobConsumerLoggingTest' --tests '*LogbackJsonEncoderTest'
bash scripts/aigen-pii-check.sh
```

Expected: PASS with synthetic content absent from captured logs/spans.

- [ ] **Step 7: Commit content-free tracing instrumentation**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/port/out/AiProviderObservationPort.kt \
  server/src/main/kotlin/com/readmates/aigen/adapter/out/observability \
  server/src/main/kotlin/com/readmates/aigen/application/service/GroundedProviderCallCoordinator.kt \
  server/src/main/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumer.kt \
  server/src/main/resources/logback-spring.xml \
  server/src/test/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/shared/observability/LogbackJsonEncoderTest.kt \
  scripts/aigen-pii-check.sh
git commit -m "feat: trace AI calls without recording content"
```

---

### Task 13: Propagate Traces Through Kafka And Bound Consumer Processing Time

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationKafkaProperties.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationKafkaConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationConfigValidator.kt`
- Modify: `server/src/main/resources/application.yml`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationPropertiesTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/config/AiGenerationConfigValidatorTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumerIntegrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobProducerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobMessageSerializationTest.kt`

- [ ] **Step 1: Add Kafka observation/time-budget RED tests**

Assert `KafkaTemplate.observationEnabled=true`, listener `containerProperties.observationEnabled=true`, manual ack remains enabled, `traceparent` exists as a Kafka header rather than a payload field, producer and consumer observations share a trace, and the job payload fields remain unchanged.

Assert the default max poll interval is at least:

```text
(3 * 4-minute provider timeout)
+ (2 * 30-second maximum backoff)
+ 3-minute processing/reconciliation safety margin
= 16 minutes
```

- [ ] **Step 2: Run Kafka RED tests**

```bash
./server/gradlew -p server unitTest --tests '*AiGenerationJobProducerTest' \
  --tests '*AiGenerationJobMessageSerializationTest' --tests '*AiGenerationConfigValidatorTest'
./server/gradlew -p server integrationTest --tests '*AiGenerationJobConsumerIntegrationTest'
```

Expected: FAIL because observation is disabled and max poll interval is implicit.

- [ ] **Step 3: Enable native Spring Kafka observations**

Configure:

```kotlin
KafkaTemplate(aiGenerationJobProducerFactory).also { it.setObservationEnabled(true) }
```

and:

```kotlin
containerProperties.ackMode = ContainerProperties.AckMode.MANUAL
containerProperties.isObservationEnabled = true
```

Rely on Spring Kafka W3C propagation. Do not hand-build `traceparent`, copy baggage, or add trace fields to `AiGenerationJobMessage`.

- [ ] **Step 4: Set and validate the 16-minute poll interval**

Add `maxPollInterval: Duration = Duration.ofMinutes(16)` to Kafka properties and write `ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG`. `AiGenerationConfigValidator` calculates the formula from provider timeout, max calls, max backoff, and fixed three-minute margin and fails startup when configured poll interval is smaller.

- [ ] **Step 5: Prove trace continuation and redelivery**

In the Kafka Testcontainer integration test, start an observation around publish, capture producer and listener spans with an in-memory exporter/handler, and assert same trace ID with distinct span IDs. Force one listener exception, redeliver, and assert the payload remains metadata-only and manual acknowledgement happens only after success.

- [ ] **Step 6: Run Kafka GREEN tests**

```bash
./server/gradlew -p server unitTest --tests '*AiGenerationJobProducerTest' \
  --tests '*AiGenerationJobMessageSerializationTest' --tests '*AiGenerationConfigValidatorTest' \
  --tests '*AiGenerationPropertiesTest'
./server/gradlew -p server integrationTest --tests '*AiGenerationJobConsumerIntegrationTest'
```

- [ ] **Step 7: Commit Kafka tracing and timing**

```bash
git add server/src/main/kotlin/com/readmates/aigen/config \
  server/src/main/resources/application.yml \
  server/src/test/kotlin/com/readmates/aigen/config \
  server/src/test/kotlin/com/readmates/aigen/adapter/in/messaging/AiGenerationJobConsumerIntegrationTest.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/messaging
git commit -m "feat: propagate AI traces through Kafka"
```

---

### Task 14: Deploy Internal Tempo And Link Grafana Exemplars

**Files:**
- Create: `ops/tempo/tempo.yml`
- Modify: `ops/observability/local/compose.yml`
- Modify: `ops/observability/local/prometheus.yml`
- Create: `ops/observability/local/grafana/provisioning/datasources/tempo.yml`
- Modify: `ops/observability/local/grafana/provisioning/datasources/prometheus.yml`
- Modify: `deploy/oci/compose.infra.yml`
- Modify: `deploy/oci/prometheus/prometheus.yml`
- Create: `deploy/oci/grafana/provisioning/datasources/tempo.yml`
- Modify: `deploy/oci/grafana/provisioning/datasources/prometheus.yml`
- Modify: `deploy/oci/06-deploy-observability-stack.sh`
- Modify: `ops/prometheus/alerts/aigen-rules.yml`
- Modify: `ops/grafana/dashboards/aigen.json`
- Create: `scripts/validate-tempo-config.sh`
- Modify: `scripts/validate-prometheus-config.sh`
- Modify: `scripts/validate-prometheus-rules.sh`
- Modify: `scripts/lint-grafana-dashboards.sh`
- Modify: `scripts/observability-local-smoke.sh`
- Modify: `scripts/public-release-check.sh`

- [ ] **Step 1: Add RED config/static checks before compose changes**

Create `validate-tempo-config.sh` that runs:

```bash
docker run --rm \
  -v "$PWD/ops/tempo/tempo.yml:/etc/tempo/tempo.yml:ro" \
  grafana/tempo:2.10.5 \
  --config.file=/etc/tempo/tempo.yml \
  --config.verify
```

The script also asserts seven-day retention, local storage paths, OTLP receivers, and rejects public Tempo/OTLP published-port patterns in OCI compose. Extend dashboard/datasource lint to require a Tempo datasource UID and exemplar mapping. The pinned version comes from the official [Tempo 2.10.5 release](https://github.com/grafana/tempo/releases/tag/v2.10.5), and config verification/health flags follow the official [Tempo command-line reference](https://grafana.com/docs/tempo/latest/set-up-for-tracing/setup-tempo/command-line-flags/).

- [ ] **Step 2: Run RED observability validation**

```bash
bash scripts/validate-tempo-config.sh
./scripts/validate-prometheus-config.sh
./scripts/validate-prometheus-rules.sh
./scripts/lint-grafana-dashboards.sh
```

Expected: FAIL because Tempo assets and links are absent.

- [ ] **Step 3: Add the pinned single-binary Tempo config**

Create `ops/tempo/tempo.yml` with this effective shape:

```yaml
server:
  http_listen_port: 3200
distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318
ingester:
  max_block_duration: 5m
compactor:
  compaction:
    block_retention: 168h
storage:
  trace:
    backend: local
    wal:
      path: /var/tempo/wal
    local:
      path: /var/tempo/blocks
```

Run the image's actual config validation and adjust only keys rejected by Tempo `2.10.5`; preserve the same receivers, local storage, and `168h` invariant.

- [ ] **Step 4: Add local Tempo with loopback-only ports**

Add `grafana/tempo:2.10.5`, a persistent volume, the native distroless-image healthcheck, and only these host bindings:

```yaml
healthcheck:
  test: ["CMD", "/tempo", "--health", "--health.url=http://localhost:3200/ready"]
```

Host bindings:

```yaml
ports:
  - "127.0.0.1:${READMATES_LOCAL_TEMPO_PORT:-3200}:3200"
  - "127.0.0.1:${READMATES_LOCAL_OTLP_HTTP_PORT:-4318}:4318"
```

Grafana and Prometheus use Docker DNS `tempo:3200`; the host API exports to `http://localhost:4318/v1/traces`.

- [ ] **Step 5: Add OCI Tempo without published ports**

Add the same image/config/volume to `deploy/oci/compose.infra.yml` with no `ports:` block. Join only the existing internal compose network. Mount the config read-only and storage read-write. Extend the deploy script to copy config/create storage/start Tempo/readiness-check it without printing environment secrets.

- [ ] **Step 6: Provision Tempo and exemplar navigation**

Provision Tempo with stable UID `readmates-tempo` and URL `http://tempo:3200`. In both Prometheus datasource files, add:

```yaml
jsonData:
  exemplarTraceIdDestinations:
    - name: trace_id
      datasourceUid: readmates-tempo
```

Add Tempo readiness/ingestion scrape targets. Do not enable Tempo anonymous public access or a public query port.

- [ ] **Step 7: Add bounded alerts and dashboard panels**

Add AI panels for call outcome/latency, cost basis, gate rejection, circuit state, and exporter/Tempo health. Add alerts for sustained circuit open, `ESTIMATED_UNKNOWN` growth, physical-call-cap exhaustion, OTLP exporter drops, and Tempo target/readiness failure. Use only existing bounded labels; no job/trace ID dashboard variables.

- [ ] **Step 8: Extend local smoke with a synthetic trace**

The smoke script must:

1. start Prometheus, Grafana, and Tempo;
2. wait for all readiness endpoints;
3. POST a synthetic OTLP/HTTP JSON trace containing no user/content data;
4. query Tempo by the same deterministic test trace ID;
5. verify Grafana has Prometheus and Tempo datasources and dashboard provisioning;
6. verify Prometheus sees Tempo and the ReadMates server targets;
7. stop/fail Tempo temporarily and prove a server health request still succeeds while exporter errors remain bounded.

- [ ] **Step 9: Run observability GREEN validation**

```bash
bash scripts/validate-tempo-config.sh
./scripts/validate-prometheus-config.sh
./scripts/validate-prometheus-rules.sh
./scripts/lint-grafana-dashboards.sh
bash scripts/observability-local-smoke.sh
```

Expected: PASS with the synthetic trace queryable and no public OCI Tempo port.

- [ ] **Step 10: Commit Tempo/Grafana/Prometheus assets**

```bash
git add ops/tempo ops/observability ops/prometheus/alerts/aigen-rules.yml \
  ops/grafana/dashboards/aigen.json deploy/oci scripts
git commit -m "feat: add internal Tempo tracing stack"
```

---

### Task 15: Finish Living Documentation, Release Evidence, And Full Verification

**Files:**
- Create: `docs/development/spring-ai-2-provider-architecture.md`
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/session-import-generator.md`
- Modify: `docs/operations/runbooks/ai-session-generation.md`
- Modify: `docs/operations/observability/README.md`
- Modify: `docs/operations/observability/operator-guide.md`
- Modify: `docs/operations/observability/metrics-catalog.md`
- Modify: `docs/operations/observability/dashboards.md`
- Modify: `docs/operations/observability/alerts.md`
- Modify: `scripts/README.md`
- Modify: `CHANGELOG.md`
- Modify: `.github/workflows/ci.yml` if the new validators are not reached by existing script gates
- Create or modify: provider live-contract tests under `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/springai/`

- [ ] **Step 1: Generate the code inventory from the finished diff**

Run:

```bash
git diff --name-status origin/main..HEAD -- server ops deploy scripts docs .github
rg -n 'class |interface |data class |enum class ' server/src/main/kotlin/com/readmates/aigen
./server/gradlew -p server dependencies --configuration runtimeClasspath > /tmp/readmates-spring-ai-final-runtime.txt
```

Use actual results, not this plan's expected names, for the living document. Do not paste absolute local paths or full dependency output.

- [ ] **Step 2: Write the requested before/after living document**

`docs/development/spring-ai-2-provider-architecture.md` must contain:

- before and after sequence diagrams from API through Kafka, Redis, coordinator, Spring AI, provider, validation, and audit;
- a table mapping every removed direct client/port/generator and legacy type to its replacement or deletion reason;
- package boundary and bean construction with actual class names;
- dependency/BOM/auto-configuration changes and no-key startup behavior;
- provider option, schema, cache usage, retention, and verified-date matrix;
- exact physical-call, retry, fallback, correction, repair, gate, and three-call rules;
- Redis reservation/ledger key shapes, single-node atomicity assumption, cost bases, TTL, crash/redelivery behavior;
- public three-field token DTO versus internal four-channel accounting;
- MySQL V38 audit fields and the distinction between business audit identity and observability privacy;
- trace/log/metric/span/baggage allowlists, sampling, retention, and OTLP failure isolation;
- local and OCI Tempo/Grafana/Prometheus topology and non-public ports;
- configuration/environment variable additions/removals;
- actual created/modified/deleted file inventory;
- exact commands run, PASS/FAIL/SKIPPED evidence, and live provider smoke status;
- residual risks and ordered rollback procedure: kill switch/consumer off, wait six-hour AI TTL or approved scoped namespace cleanup, then previous image; never full Redis flush.

- [ ] **Step 3: Update active architecture, runbooks, catalog, and changelog**

Make active docs point to the living document and match actual configuration. Remove legacy pipeline/direct SDK instructions. Add provider retention verification dates, Tempo disk/retention operations, unknown-cost review, exporter failure triage, circuit/concurrency triage, and 16-minute Kafka poll rationale. Add an `Unreleased` CHANGELOG entry for server behavior, migration V38, configuration, and observability stack.

- [ ] **Step 4: Add final content/privacy/static scans**

Run:

```bash
bash scripts/aigen-pii-check.sh
rg -n 'log-(prompt|completion): true|include-error-logging: true|include-content: true' server ops deploy && exit 1 || true
rg -n 'AiGenerationPipelineMode|READMATES_AIGEN_PIPELINE_MODE|pipeline-mode' server docs/development docs/operations scripts && exit 1 || true
rg -n 'implementation\("(com\.openai|com\.anthropic|com\.google\.genai)' server/build.gradle.kts && exit 1 || true
git diff --check
```

Expected: all searches return no forbidden current-runtime/current-doc references. Historical `docs/superpowers` records are intentionally excluded from the legacy-term scan.

- [ ] **Step 5: Run server PR and full integration gates**

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

Expected: PASS. If a Testcontainer prerequisite is unavailable, record the exact command/error and do not claim it passed.

- [ ] **Step 6: Run frontend E2E regression because API/Kafka behavior changed**

Use the repository-pinned package manager:

```bash
corepack pnpm --dir front test:e2e
```

If `corepack` is unavailable, use and report:

```bash
npx --yes corepack@0.35.0 pnpm --dir front test:e2e
```

Expected: PASS with unchanged public AI API fixtures.

- [ ] **Step 7: Run observability and privacy gates**

```bash
bash scripts/aigen-pii-check.sh
./scripts/validate-prometheus-rules.sh
./scripts/validate-prometheus-config.sh
bash scripts/validate-tempo-config.sh
./scripts/lint-grafana-dashboards.sh
bash scripts/observability-local-smoke.sh
```

Expected: PASS, including trace query and Tempo-down product isolation.

- [ ] **Step 8: Build and scan the public release candidate**

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Then run the repository's image/dependency vulnerability scan path referenced by `scripts/server-ci-check.sh`. Confirm Spring AI starters bring no direct source secrets and no high/critical unaccepted vulnerability. Record exact skipped scanners if local tooling is unavailable.

- [ ] **Step 9: Keep live provider smoke explicitly opt-in**

Only when the user separately authorizes provider cost/key use, run one synthetic request per enabled provider and record request count, schema result, four usage channels, actual cost reconciliation, trace lookup, and no-content scan. Without that authorization, mark all three live smokes `SKIPPED — requires provider key and billable external call`; mock-wire contracts remain the CI proof.

- [ ] **Step 10: Perform release-readiness review across the full branch**

Read `docs/development/release-readiness-review.md`, compare `origin/main..HEAD`, and verify CHANGELOG, migration expand safety, config defaults, deploy scripts, rollback, operator docs, architecture boundaries, CI inclusion, and public-repo safety. Tests passing is evidence, not the entire review.

- [ ] **Step 11: Update living-document evidence with actual results**

Replace planned commands with the real PASS/FAIL/SKIPPED table, current commit hash, actual file inventory, and residual risks. Do not include timestamps that imply a live provider check occurred when it was skipped.

- [ ] **Step 12: Commit documentation and verification integration**

```bash
git add docs/development docs/operations scripts/README.md CHANGELOG.md .github/workflows/ci.yml
git commit -m "docs: document Spring AI provider architecture"
```

Omit `.github/workflows/ci.yml` from `git add` when no workflow change was necessary.

- [ ] **Step 13: Verify the final commit range is clean and scoped**

```bash
git status --short --branch --untracked-files=all
git diff --check origin/main..HEAD
git log --oneline --decorate origin/main..HEAD
git diff --stat origin/main..HEAD
```

Expected: no uncommitted implementation files; only the intended Spring AI, AI safety, tracing, observability, docs, and verification changes are present. Do not push, deploy, run paid live calls, or merge without a separate user request.

---

## Final Acceptance Matrix

| Invariant | Primary proof |
|---|---|
| Spring AI 2.0.0 owns provider model calls | dependency contract + architecture test + common adapter tests |
| No legacy/direct provider execution remains | source/bytecode absence tests + dependency scan |
| One reservation equals at most one HTTP request | three provider mock HTTP contract tests |
| All branches remain at most three physical calls | policy property tests + Redis concurrency/redelivery tests |
| Cost cannot be bypassed by timeout/crash | atomic reservation + `ESTIMATED_UNKNOWN` tests |
| Cache write/read are priced separately | four-channel calculator + provider usage tests + V38 audit test |
| Gate rejection consumes no slot/cost | coordinator order test + Redis integration test |
| Redis failure prevents provider call | fail-closed coordinator/adapter test |
| API -> Kafka -> worker -> Spring AI -> HTTP is one trace | Kafka integration + local Tempo query smoke |
| Prompt/completion and forbidden identity are absent | observation/log capture + `aigen-pii-check.sh` |
| Tempo/exporter failure cannot fail product work | exporter/Tempo-down failure-injection smoke |
| Tempo is internal and retained seven days | compose static scan + config validator + readiness smoke |
| Public API remains compatible | Zod contract + frontend E2E |
| Requested before/after documentation is code-accurate | living-doc inventory/evidence review |

## Residual Risks To Carry Into Release Evidence

- A provider without idempotency can bill a request whose response is lost; the attempt remains unknown and the three-call cap bounds, but cannot eliminate, duplicate billing.
- Conservative `ESTIMATED_UNKNOWN` can close a club monthly budget earlier than actual spend; adjustment remains an audited operator action.
- Anthropic/native provider usage metadata can change in a Spring AI patch; incomplete cache breakdown must fail closed to worst-case cost and may disable caching until revalidated.
- Provider model capability, retention, and pricing can drift after the recorded verification date; allowlists and runbook checks remain operational controls.
- 100% sampling and seven-day local Tempo storage can pressure the OCI VM; watch disk/exporter metrics and change sampling/retention only through a reviewed config change.
- Atomic reservation is correct for the current single-node Redis deployment, not Redis Cluster; a cluster migration requires a new key-slot/transaction design before rollout.
- Previous images may not understand grounded-only Redis state. Rollback requires disabling AI/consumer first and respecting the six-hour AI payload TTL or an approved namespace-scoped cleanup.
