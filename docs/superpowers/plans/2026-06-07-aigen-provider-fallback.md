# AI 생성 Multi-LLM Provider Failover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가용성 실패(`PROVIDER_UNAVAILABLE`/`PROVIDER_RATE_LIMITED`) 시 기존 단일 재시도를 같은 provider 대신 전역 고정 체인의 다음 provider로 전환하고, 실제 생성 모델 기준으로 비용/audit/metrics를 기록한다.

**Architecture:** 순수 로직 `ProviderFallbackChain`이 "다음 후보 모델"을 결정하고, `AiGenerationWorker`가 호출 카운트·audit·cost 소유권을 유지한 채 재시도 타깃만 위임받는다. failover로 바뀐 실제 모델(`actualModel`)을 `GenerationAttempt`로 워커 내부에서 스레딩해 성공 경로의 회계에 반영하며, `JobRecord`에 `actualModel`을 영속화한다. 호출 예산(job당 ≤3회)은 불변(failover 깊이 1).

**Tech Stack:** Kotlin, Spring Boot, Redis(StringRedisTemplate + Lua), JUnit5/Kotest-style assertions(기존 테스트 관례), Gradle.

**Spec:** `docs/superpowers/specs/2026-06-07-aigen-provider-fallback-design.md`

---

## File Structure

- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/ProviderFallbackChain.kt` — 체인 우선순위 순수 로직 + 기동 경고.
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/ProviderFallbackChainTest.kt` — 체인 단위 테스트.
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt` — `fallbackChain` 추가.
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt` — `JobView.actualModel` 추가.
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt` — `JobRecord.actualModel` + `saveResultIfStatus` 시그니처.
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt` — 직렬화 + Lua.
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt` — `toJobView`에 actualModel 매핑.
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt` — 제어 흐름 + 회계.
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationBeansConfig.kt` — `ProviderFallbackChain` @Bean.
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt` — `FakeJobStore.saveResultIfStatus` 시그니처.
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerTest.kt` — 워커 생성자 + failover 테스트.
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/...JobStore...Test.kt` — actualModel 왕복(있으면 해당 파일, 없으면 신규).
- Modify: `CHANGELOG.md` — Unreleased 항목.

---

## Task 1: `fallbackChain` 설정 + `ProviderFallbackChain` 컴포넌트

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/ProviderFallbackChain.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/ProviderFallbackChainTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/config/AiGenerationBeansConfig.kt`

- [ ] **Step 1: 설정 프로퍼티 추가**

`AiGenerationProperties.kt`의 데이터 클래스 본문 파라미터에 `fallbackChain`을 추가한다. `pricing` 줄 바로 앞에 삽입:

```kotlin
@ConfigurationProperties("readmates.aigen")
data class AiGenerationProperties(
    val enabled: Boolean = false,
    val mock: Boolean = false,
    val enabledProviders: Set<String> = emptySet(), // "CLAUDE","OPENAI","GEMINI"
    val fallbackDefaultModel: String = "gpt-5.4-mini",
    // Ordered model aliases tried for cross-provider failover on availability
    // failures. Empty = feature off (same-provider retry only).
    val fallbackChain: List<String> = emptyList(),
    val caps: Caps = Caps(),
    val job: Job = Job(),
    val pricing: Map<String, Pricing> = emptyMap(),
) {
```

- [ ] **Step 2: 체인 단위 테스트 작성 (실패하는 테스트)**

`ProviderFallbackChainTest.kt` 생성. `AiGenerationFakes.kt`의 `FakeModelCatalog`와 `AiGenerationTestFixtures`를 재사용한다. 테스트용으로 OPENAI/GEMINI 모델을 로컬 정의한다.

```kotlin
package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.ModelPricing
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.SessionContentGenerator
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class ProviderFallbackChainTest {
    private val claude = ModelId(Provider.CLAUDE, "claude-sonnet-4-6")
    private val openai = ModelId(Provider.OPENAI, "gpt-5.4-mini")
    private val gemini = ModelId(Provider.GEMINI, "gemini-2.5-flash")
    private val pricing = ModelPricing(BigDecimal("3"), BigDecimal("0.3"), BigDecimal("15"))

    private fun gen(p: Provider): SessionContentGenerator = FakeContentGenerator(provider = p)

    private fun chain(
        order: List<String>,
        enabled: Set<ModelId> = setOf(claude, openai, gemini),
        generators: Map<Provider, SessionContentGenerator> =
            mapOf(Provider.CLAUDE to gen(Provider.CLAUDE), Provider.OPENAI to gen(Provider.OPENAI), Provider.GEMINI to gen(Provider.GEMINI)),
    ): ProviderFallbackChain =
        ProviderFallbackChain(
            generators = generators,
            modelCatalog = FakeModelCatalog(pricing = enabled.associateWith { pricing }, enabled = enabled),
            properties = AiGenerationTestFixtures.defaultProperties().copy(fallbackChain = order),
        )

    @Test
    fun `returns first chain entry of a different provider`() {
        val result = chain(order = listOf("claude-sonnet-4-6", "gpt-5.4-mini", "gemini-2.5-flash")).nextAfter(claude)
        assertThat(result).isEqualTo(openai)
    }

    @Test
    fun `skips entries with the same provider as the failed model`() {
        val result = chain(order = listOf("claude-sonnet-4-6", "gemini-2.5-flash")).nextAfter(claude)
        assertThat(result).isEqualTo(gemini)
    }

    @Test
    fun `skips entries that are not enabled in the catalog`() {
        val result =
            chain(order = listOf("gpt-5.4-mini", "gemini-2.5-flash"), enabled = setOf(claude, gemini)).nextAfter(claude)
        assertThat(result).isEqualTo(gemini)
    }

    @Test
    fun `skips entries whose provider has no generator`() {
        val result =
            chain(
                order = listOf("gpt-5.4-mini", "gemini-2.5-flash"),
                generators = mapOf(Provider.CLAUDE to gen(Provider.CLAUDE), Provider.GEMINI to gen(Provider.GEMINI)),
            ).nextAfter(claude)
        assertThat(result).isEqualTo(gemini)
    }

    @Test
    fun `returns null when chain is exhausted`() {
        val result = chain(order = listOf("claude-sonnet-4-6")).nextAfter(claude)
        assertThat(result).isNull()
    }

    @Test
    fun `returns null for an empty chain`() {
        val result = chain(order = emptyList()).nextAfter(claude)
        assertThat(result).isNull()
    }
}
```

> 참고: `FakeModelCatalog.resolveAlias`는 enabled 집합에서 이름으로 찾으므로, 위 테스트에서 enabled에 없는 alias는 자연히 스킵된다.

- [ ] **Step 3: 테스트 실패 확인**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.application.service.ProviderFallbackChainTest"`
Expected: 컴파일 실패 — `ProviderFallbackChain` 미정의.

- [ ] **Step 4: `ProviderFallbackChain` 구현**

`ProviderFallbackChain.kt` 생성:

```kotlin
package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.SessionContentGenerator
import com.readmates.aigen.config.AiGenerationProperties
import org.slf4j.LoggerFactory

/**
 * Resolves the next provider's model to try when an availability failure occurs.
 * Pure over [properties.fallbackChain] + [modelCatalog] + available [generators].
 * Empty chain = feature off (caller keeps same-provider retry).
 */
class ProviderFallbackChain(
    private val generators: Map<Provider, SessionContentGenerator>,
    private val modelCatalog: ModelCatalog,
    private val properties: AiGenerationProperties,
) {
    private val logger = LoggerFactory.getLogger(ProviderFallbackChain::class.java)

    init {
        // Best-effort startup warning: unresolved chain entries are skipped at
        // runtime, but a typo or env-specific allowlist gap is worth surfacing.
        properties.fallbackChain
            .filter { alias -> modelCatalog.resolveAlias(alias) == null }
            .forEach { alias ->
                logger.warn("readmates.aigen.fallbackChain entry '{}' does not resolve to an allowlisted model; it will be skipped.", alias)
            }
    }

    fun nextAfter(failed: ModelId): ModelId? =
        properties.fallbackChain
            .asSequence()
            .mapNotNull { alias -> modelCatalog.resolveAlias(alias) }
            .firstOrNull { candidate ->
                candidate.provider != failed.provider &&
                    modelCatalog.isEnabled(candidate) &&
                    generators.containsKey(candidate.provider)
            }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.application.service.ProviderFallbackChainTest"`
Expected: PASS (6 tests).

- [ ] **Step 6: `ProviderFallbackChain` 빈 등록**

`AiGenerationBeansConfig.kt`에 import와 @Bean 추가. import 블록에 `ModelCatalog`, `AiGenerationProperties`, `ProviderFallbackChain` 추가 후, `aiGenerationSleeper` 빈 위에 삽입:

```kotlin
    @Bean
    fun providerFallbackChain(
        sessionContentGeneratorsByProvider: Map<Provider, SessionContentGenerator>,
        modelCatalog: com.readmates.aigen.application.port.out.ModelCatalog,
        properties: com.readmates.aigen.config.AiGenerationProperties,
    ): com.readmates.aigen.application.service.ProviderFallbackChain =
        com.readmates.aigen.application.service.ProviderFallbackChain(
            generators = sessionContentGeneratorsByProvider,
            modelCatalog = modelCatalog,
            properties = properties,
        )
```

> `Map<Provider, SessionContentGenerator>`와 `Map<Provider, SessionContentRegenerator>`는 서로 다른 제네릭 타입이라 주입이 모호하지 않다.

- [ ] **Step 7: 컴파일 확인 + 커밋**

Run: `./server/gradlew -p server compileKotlin compileTestKotlin`
Expected: BUILD SUCCESSFUL

```bash
git add server/src/main/kotlin/com/readmates/aigen/config/AiGenerationProperties.kt \
        server/src/main/kotlin/com/readmates/aigen/application/service/ProviderFallbackChain.kt \
        server/src/test/kotlin/com/readmates/aigen/application/service/ProviderFallbackChainTest.kt \
        server/src/main/kotlin/com/readmates/aigen/config/AiGenerationBeansConfig.kt
git commit -m "feat(aigen): add ProviderFallbackChain and fallbackChain config"
```

---

## Task 2: `actualModel` 데이터 모델 + 영속화

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt`

- [ ] **Step 1: `JobRecord`에 `actualModel` 추가**

`AiGenerationJobStore.kt`의 `JobRecord` 데이터 클래스에서 `llmCallCount` 줄 바로 앞에 추가:

```kotlin
    /**
     * The model that actually produced the result when cross-provider failover
     * occurred. Null means no failover (actual == [model]). Used so cost/audit/
     * metrics reflect the provider that really ran.
     */
    val actualModel: ModelId? = null,
    val llmCallCount: Int = 0,
```

- [ ] **Step 2: `saveResultIfStatus` 시그니처에 actualModel 추가**

같은 파일 인터페이스의 `saveResultIfStatus`에 nullable 파라미터를 추가(기본값 null로 다른 호출자 무영향):

```kotlin
    fun saveResultIfStatus(
        jobId: UUID,
        expected: JobStatus,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
        actualModel: ModelId? = null,
    ): Boolean
```

- [ ] **Step 3: `JobView`에 `actualModel` 추가**

`AiGenerationModels.kt`의 `JobView`에서 `model: ModelId` 줄 바로 뒤에 추가:

```kotlin
    val model: ModelId,
    val actualModel: ModelId? = null,
```

- [ ] **Step 4: orchestrator `toJobView` 매핑**

`AiGenerationOrchestrator.kt`의 `toJobView`에서 `model = record.model,` 줄 바로 뒤에 추가:

```kotlin
            model = record.model,
            actualModel = record.actualModel,
```

- [ ] **Step 5: `FakeJobStore.saveResultIfStatus` 갱신**

`AiGenerationFakes.kt`의 `FakeJobStore.saveResultIfStatus`를 시그니처/본문 함께 갱신해 actualModel을 보존:

```kotlin
    override fun saveResultIfStatus(
        jobId: UUID,
        expected: JobStatus,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
        actualModel: ModelId?,
    ): Boolean {
        val current =
            when {
                failNextConditionalSave -> {
                    failNextConditionalSave = false
                    null
                }
                else -> records[jobId]?.takeIf { it.status == expected }
            } ?: return false
        records[jobId] =
            current.copy(
                result = result,
                actualModel = actualModel ?: current.actualModel,
                tokens =
                    TokenUsage(
                        current.tokens.inputTokens + usage.inputTokens,
                        current.tokens.cachedInputTokens + usage.cachedInputTokens,
                        current.tokens.outputTokens + usage.outputTokens,
                    ),
                costAccumulatedUsd = current.costAccumulatedUsd.add(cost),
            )
        return true
    }
```

- [ ] **Step 6: Redis 직렬화 — `toHash`/`fromHash`**

`RedisAiGenerationJobStore.kt`의 `toHash`에서 `"llmCallCount"` 줄 뒤(map 빌더 이후 `job.stage?.let` 블록 근처)에 actualModel 조건부 기록 추가. `map` 선언 뒤의 `job.stage?.let {` 블록 바로 앞에 삽입:

```kotlin
        job.actualModel?.let {
            map["actualModelProvider"] = it.provider.name
            map["actualModelName"] = it.name
        }
        job.stage?.let { map["stage"] = it.name }
```

`fromHash`의 `JobRecord(...)` 생성에서 `llmCallCount = ...` 줄 바로 앞에 추가:

```kotlin
            actualModel =
                hash["actualModelName"]?.let { name ->
                    ModelId(
                        provider = Provider.valueOf(hash.getValue("actualModelProvider")),
                        name = name,
                    )
                },
            llmCallCount = hash["llmCallCount"]?.toIntOrNull() ?: 0,
```

- [ ] **Step 7: Redis `saveResultIfStatus` — Lua에 actualModel 기록**

같은 파일에서 `saveResultIfStatus` override 시그니처에 `actualModel: ModelId?` 추가하고, `redisTemplate.execute(...)` 인자 끝에 두 값을 덧붙인다(빈 문자열이면 스크립트가 HSET 생략):

```kotlin
    override fun saveResultIfStatus(
        jobId: UUID,
        expected: JobStatus,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
        actualModel: ModelId?,
    ): Boolean =
        runCatching {
            val ttlSeconds = properties.job.redisTtl.seconds
            val lastUpdatedAt = Instant.now()
            val resultJson = objectMapper.writeValueAsString(result)
            val saved =
                redisTemplate.execute(
                    SAVE_RESULT_IF_STATUS_SCRIPT,
                    listOf(hashKey(jobId), resultKey(jobId), transcriptKey(jobId)),
                    expected.name,
                    resultJson,
                    usage.inputTokens.toString(),
                    usage.cachedInputTokens.toString(),
                    usage.outputTokens.toString(),
                    cost.toPlainString(),
                    lastUpdatedAt.toString(),
                    ttlSeconds.toString(),
                    actualModel?.provider?.name.orEmpty(),
                    actualModel?.name.orEmpty(),
                )
            val changed = saved == 1L
            if (changed) {
                refreshIndexes(jobId)
            }
            changed
        }.onFailure { recordFailure("saveResultIfStatus") }.getOrThrow()
```

그리고 `SAVE_RESULT_IF_STATUS_SCRIPT`의 Lua 본문에서 `return 1` 바로 앞에 actualModel 기록을 추가하고, 주석의 ARGV 설명도 갱신한다:

```kotlin
        /**
         * KEYS[1]=hashKey, KEYS[2]=resultKey, KEYS[3]=transcriptKey
         * ARGV[1]=expected status, ARGV[2]=resultJson, ARGV[3..5]=token deltas,
         * ARGV[6]=cost delta, ARGV[7]=lastUpdatedAt, ARGV[8]=ttlSeconds,
         * ARGV[9]=actualModelProvider or "", ARGV[10]=actualModelName or "".
         */
        val SAVE_RESULT_IF_STATUS_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                if redis.call('EXISTS', KEYS[1]) == 0 then
                  return 0
                end
                if redis.call('HGET', KEYS[1], 'status') ~= ARGV[1] then
                  return 0
                end
                redis.call('SET', KEYS[2], ARGV[2])
                redis.call('EXPIRE', KEYS[2], ARGV[8])
                redis.call('HINCRBY', KEYS[1], 'tokensInput', ARGV[3])
                redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[4])
                redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[5])
                redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[6])
                redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[7])
                redis.call('EXPIRE', KEYS[1], ARGV[8])
                if redis.call('EXISTS', KEYS[3]) == 1 then
                  redis.call('EXPIRE', KEYS[3], ARGV[8])
                end
                if ARGV[9] ~= '' then
                  redis.call('HSET', KEYS[1], 'actualModelProvider', ARGV[9])
                  redis.call('HSET', KEYS[1], 'actualModelName', ARGV[10])
                end
                return 1
                """.trimIndent(),
                Long::class.java,
            )
```

- [ ] **Step 8: 컴파일 확인**

Run: `./server/gradlew -p server compileKotlin compileTestKotlin`
Expected: BUILD SUCCESSFUL (워커는 아직 새 파라미터를 안 넘기지만 기본값 null로 컴파일됨).

- [ ] **Step 9: 커밋**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt \
        server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt \
        server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt \
        server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt \
        server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt
git commit -m "feat(aigen): persist actualModel for cross-provider failover"
```

---

## Task 3: 워커 제어 흐름 + 회계 (failover)

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerTest.kt`

- [ ] **Step 1: 워커 failover 테스트 작성 (실패하는 테스트) — 멀티 provider 하네스**

`AiGenerationWorkerTest.kt` 맨 아래(마지막 `}` 직전, 기존 `TestSetup`/fixture 클래스와 동일 스코프)에 멀티 provider 하네스와 테스트를 추가한다. OPENAI 모델/생성자를 포함한다.

```kotlin
    @org.junit.jupiter.api.Nested
    inner class Failover {
        private val claudeModel = AiGenerationTestFixtures.CLAUDE_MODEL
        private val openaiModel = ModelId(Provider.OPENAI, "gpt-5.4-mini")
        private val enabled = setOf(claudeModel, openaiModel)

        private fun harness(
            fallbackChainOrder: List<String> = listOf(openaiModel.name),
        ): FailoverHarness = FailoverHarness(enabled, fallbackChainOrder, claudeModel, openaiModel)

        @Test
        fun `availability failure fails over to next provider and accounts under actual model`() {
            val h = harness()
            h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
            h.openai.enqueueSuccess(AiGenerationTestFixtures.snapshotOutput())
            val record = h.savedRecord(model = claudeModel)

            h.worker.process(record.jobId)

            val saved = h.jobStore.records.getValue(record.jobId)
            assertThat(saved.status).isEqualTo(JobStatus.SUCCEEDED)
            assertThat(saved.actualModel).isEqualTo(openaiModel)
            // success audit row records the OPENAI provider/model
            val success = h.auditPort.entries.last { it.status == AuditStatus.SUCCESS }
            assertThat(success.provider).isEqualTo(Provider.OPENAI)
            assertThat(success.model).isEqualTo(openaiModel.name)
            // the OPENAI generator received the failover model in its input
            assertThat(h.openai.calls.single().model).isEqualTo(openaiModel)
        }

        @Test
        fun `failover target also failing yields FAILED with two failure audit rows`() {
            val h = harness()
            h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
            h.openai.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
            val record = h.savedRecord(model = claudeModel)

            h.worker.process(record.jobId)

            assertThat(h.jobStore.records.getValue(record.jobId).status).isEqualTo(JobStatus.FAILED)
            assertThat(h.auditPort.entries.count { it.status == AuditStatus.FAILED }).isEqualTo(2)
        }

        @Test
        fun `empty chain keeps same-provider retry`() {
            val h = harness(fallbackChainOrder = emptyList())
            h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
            h.claude.enqueueSuccess(AiGenerationTestFixtures.snapshotOutput())
            val record = h.savedRecord(model = claudeModel)

            h.worker.process(record.jobId)

            val saved = h.jobStore.records.getValue(record.jobId)
            assertThat(saved.status).isEqualTo(JobStatus.SUCCEEDED)
            assertThat(saved.actualModel).isNull()
            assertThat(h.claude.calls).hasSize(2)
            assertThat(h.openai.calls).isEmpty()
        }

        @Test
        fun `content failure does not fail over even with chain configured`() {
            val h = harness()
            h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.SCHEMA_INVALID))
            h.claude.enqueueSuccess(AiGenerationTestFixtures.snapshotOutput())
            val record = h.savedRecord(model = claudeModel)

            h.worker.process(record.jobId)

            val saved = h.jobStore.records.getValue(record.jobId)
            assertThat(saved.status).isEqualTo(JobStatus.SUCCEEDED)
            assertThat(saved.actualModel).isNull()
            assertThat(h.openai.calls).isEmpty()
            // second CLAUDE call used strengthened instructions
            assertThat(h.claude.calls[1].instructions).contains("Strict: SCHEMA_INVALID")
        }

        @Test
        fun `validation violation after failover retries on the failover provider`() {
            val h = harness()
            h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
            h.openai.enqueueSuccess(AiGenerationTestFixtures.snapshotOutput())
            h.openai.enqueueSuccess(AiGenerationTestFixtures.snapshotOutput())
            var first = true
            h.validator.resultProvider = { _, _ ->
                if (first) { first = false; ValidationResult.Violation(ErrorCode.SCHEMA_INVALID, "bad") } else ValidationResult.Ok
            }
            val record = h.savedRecord(model = claudeModel)

            h.worker.process(record.jobId)

            assertThat(h.jobStore.records.getValue(record.jobId).status).isEqualTo(JobStatus.SUCCEEDED)
            // strengthen retry stayed on OPENAI (2 OPENAI calls, 1 CLAUDE call)
            assertThat(h.openai.calls).hasSize(2)
            assertThat(h.openai.calls[1].model).isEqualTo(openaiModel)
        }

        @Test
        fun `call cap exhausted prevents failover call`() {
            val h = harness(fallbackChainOrder = listOf(openaiModel.name))
            h.properties = h.properties.copy(job = h.properties.job.copy(maxLlmCallsPerJob = 1))
            h.rebuildWorker()
            h.claude.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
            val record = h.savedRecord(model = claudeModel)

            h.worker.process(record.jobId)

            assertThat(h.jobStore.records.getValue(record.jobId).status).isEqualTo(JobStatus.FAILED)
            assertThat(h.openai.calls).isEmpty()
        }
    }
```

> 위 테스트는 두 가지 신규 테스트 헬퍼를 가정한다: `AiGenerationTestFixtures.snapshotOutput()`(아래 Step 2)과 `FailoverHarness`(Step 3). 또한 imports 필요: `ModelId`, `AuditStatus`, `ValidationResult`는 같은 패키지이거나 명시 import.

- [ ] **Step 2: 테스트 픽스처 헬퍼 추가**

`AiGenerationFakes.kt`의 `AiGenerationTestFixtures`에 `snapshotOutput` 추가(기존 `snapshot()`/`providerError` 옆):

```kotlin
    fun snapshotOutput(
        summary: String = "An interesting discussion.",
        usage: TokenUsage = TokenUsage(inputTokens = 100, cachedInputTokens = 0, outputTokens = 200),
    ): GenerationOutput = GenerationOutput(snapshot(summary), usage)
```

(`GenerationOutput`은 이미 import되어 있다.)

- [ ] **Step 3: `FailoverHarness` 추가**

`AiGenerationWorkerTest.kt`에 멀티 provider 하네스 클래스를 추가(파일 내 최상위 `class AiGenerationWorkerTest` 본문 안, `Failover` nested 클래스에서 접근 가능 위치). 기존 단일 generator 하네스를 모방하되 가변 `properties`와 `rebuildWorker()`를 제공:

```kotlin
    internal class FailoverHarness(
        enabled: Set<ModelId>,
        fallbackChainOrder: List<String>,
        private val primaryModel: ModelId,
        private val failoverModel: ModelId,
    ) {
        val sessionId: UUID = UUID.randomUUID()
        val clubId: UUID = UUID.randomUUID()
        val hostUserId: UUID = UUID.randomUUID()

        val jobStore = FakeJobStore()
        val claude = FakeContentGenerator(provider = Provider.CLAUDE)
        val openai = FakeContentGenerator(provider = Provider.OPENAI)
        val generators = mapOf(Provider.CLAUDE to claude, Provider.OPENAI to openai)
        val auditPort = FakeAuditPort()
        val costGuard = FakeCostGuard()
        val validator = FakeValidator()
        val latencyNotification = FakeLatencyNotification()
        val sleeper = FakeSleeper()
        val modelCatalog = AiGenerationTestFixtures.defaultModelCatalog(enabled = enabled)
        var properties =
            AiGenerationTestFixtures.defaultProperties().copy(fallbackChain = fallbackChainOrder)

        private fun newChain() = ProviderFallbackChain(generators, modelCatalog, properties)

        var worker = build()

        private fun build(): AiGenerationWorker =
            AiGenerationWorker(
                jobStore = jobStore,
                generators = generators,
                modelCatalog = modelCatalog,
                validator = validator,
                auditPort = auditPort,
                costGuard = costGuard,
                latencyNotification = latencyNotification,
                properties = properties,
                clock = FakeClock(AiGenerationTestFixtures.NOW),
                metrics = fakeMetrics(),
                sleeper = sleeper,
                fallbackChain = newChain(),
            )

        fun rebuildWorker() { worker = build() }

        fun savedRecord(model: ModelId): com.readmates.aigen.application.port.out.JobRecord {
            val record =
                AiGenerationTestFixtures.jobRecord(
                    sessionId = sessionId,
                    clubId = clubId,
                    hostUserId = hostUserId,
                    model = model,
                )
            jobStore.save(record)
            return record
        }
    }
```

> 이 클래스에 필요한 import가 파일 상단에 없으면 추가: `com.readmates.aigen.application.model.ModelId`, `com.readmates.aigen.application.model.Provider`, `com.readmates.aigen.application.port.out.AuditStatus`.

- [ ] **Step 4: 기존 단일 generator 하네스에 `fallbackChain` 인자 추가**

`AiGenerationWorkerTest.kt`의 기존 `worker = AiGenerationWorker(...)` 생성(약 402행)에 마지막 인자를 추가해 컴파일을 유지한다. 빈 체인이라 기존 동작 불변:

```kotlin
                sleeper = sleeper,
                fallbackChain =
                    ProviderFallbackChain(
                        generators = mapOf(Provider.CLAUDE to generator),
                        modelCatalog = modelCatalog,
                        properties = properties,
                    ),
            )
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.application.service.AiGenerationWorkerTest"`
Expected: 컴파일 실패 — `AiGenerationWorker` 생성자에 `fallbackChain` 파라미터 없음 / failover 미구현.

- [ ] **Step 6: 워커 — 생성자 + 제어 흐름 구현**

`AiGenerationWorker.kt`를 수정한다.

(a) 생성자에 의존성 추가(`sleeper` 줄 뒤):

```kotlin
    private val sleeper: Sleeper = Sleeper.Default,
    private val fallbackChain: ProviderFallbackChain,
```

> Kotlin은 기본값 파라미터 뒤에 비기본 파라미터를 둘 수 있다(named-args 호출이므로 문제 없음). 호출부는 모두 named-args다.

(b) `process`의 결과 분기에서 actualModel 전달:

```kotlin
        when (val outcome = runGenerationWithValidationRetry(runningRecord, generator)) {
            is Outcome.Success -> succeed(runningRecord, outcome.snapshot, outcome.usage, outcome.actualModel, start)
            is Outcome.Failure -> failJob(runningRecord, outcome.error.code, outcome.error.message, start)
        }
```

(c) `GenerationAttempt`/`AttemptResult` 홀더와 `Outcome.Success` 확장. `Outcome` 정의를 교체하고 새 타입을 추가:

```kotlin
    private data class GenerationAttempt(
        val output: GenerationOutput,
        val actualModel: ModelId,
        val generator: SessionContentGenerator,
    )

    private sealed class AttemptResult {
        data class Ok(val attempt: GenerationAttempt) : AttemptResult()

        data class Fail(val error: GenerationError) : AttemptResult()
    }

    private sealed class Outcome {
        data class Success(
            val snapshot: SessionImportV1Snapshot,
            val usage: TokenUsage,
            val actualModel: ModelId,
        ) : Outcome()

        data class Failure(
            val error: GenerationError,
        ) : Outcome()
    }
```

(d) `runGenerationWithValidationRetry` 교체:

```kotlin
    private fun runGenerationWithValidationRetry(
        record: JobRecord,
        generator: SessionContentGenerator,
    ): Outcome {
        val baseInput =
            GenerationInput(
                transcript = record.transcript,
                sessionMeta = record.toSessionMeta(),
                model = record.model,
                instructions = record.instructions,
            )
        val attempt =
            when (val first = callGeneratorWithRetry(record, generator, baseInput)) {
                is AttemptResult.Fail -> return Outcome.Failure(first.error)
                is AttemptResult.Ok -> first.attempt
            }
        return when (val validation = validator.validate(attempt.output.result, baseInput.sessionMeta)) {
            is ValidationResult.Ok -> Outcome.Success(attempt.output.result, attempt.output.usage, attempt.actualModel)
            is ValidationResult.Violation -> retryAfterValidationFailure(record, attempt, baseInput, validation)
        }
    }
```

(e) `retryAfterValidationFailure` 교체(attempt의 generator/model에 머무름):

```kotlin
    private fun retryAfterValidationFailure(
        record: JobRecord,
        attempt: GenerationAttempt,
        baseInput: GenerationInput,
        violation: ValidationResult.Violation,
    ): Outcome {
        auditRetryAttempt(record, attempt.actualModel, GenerationError(violation.code, violation.message))
        val strengthenedInput =
            baseInput.copy(
                model = attempt.actualModel,
                instructions = strengthenInstructions(baseInput.instructions, violation.code),
            )
        val retry =
            when (val callResult = callGeneratorRaw(record, attempt.generator, strengthenedInput)) {
                is CallResult.Success -> callResult.output
                is CallResult.Failure -> return Outcome.Failure(callResult.error)
            }
        return when (val validation = validator.validate(retry.result, baseInput.sessionMeta)) {
            is ValidationResult.Ok -> Outcome.Success(retry.result, retry.usage, attempt.actualModel)
            is ValidationResult.Violation -> Outcome.Failure(GenerationError(validation.code, validation.message))
        }
    }
```

(f) `callGeneratorWithRetry` 교체(코드별 분기 + failover):

```kotlin
    @Suppress("ReturnCount")
    private fun callGeneratorWithRetry(
        record: JobRecord,
        primaryGenerator: SessionContentGenerator,
        baseInput: GenerationInput,
    ): AttemptResult {
        val first = callGeneratorRaw(record, primaryGenerator, baseInput)
        if (first is CallResult.Success) {
            return AttemptResult.Ok(GenerationAttempt(first.output, record.model, primaryGenerator))
        }
        val firstFailure = (first as CallResult.Failure).error
        val strategy = retryStrategyFor(firstFailure.code) ?: return AttemptResult.Fail(firstFailure)
        auditRetryAttempt(record, record.model, firstFailure)
        sleeper.sleep(strategy.backoff)

        val failover =
            if (isAvailabilityFailure(firstFailure.code)) fallbackChain.nextAfter(record.model) else null
        if (failover != null) {
            val failoverGenerator = generators.getValue(failover.provider)
            val retry = callGeneratorRaw(record, failoverGenerator, baseInput.copy(model = failover))
            return when (retry) {
                is CallResult.Success -> AttemptResult.Ok(GenerationAttempt(retry.output, failover, failoverGenerator))
                is CallResult.Failure -> AttemptResult.Fail(retry.error)
            }
        }

        val retryInput =
            if (strategy.strengthen) {
                baseInput.copy(instructions = strengthenInstructions(baseInput.instructions, firstFailure.code))
            } else {
                baseInput
            }
        return when (val retry = callGeneratorRaw(record, primaryGenerator, retryInput)) {
            is CallResult.Success -> AttemptResult.Ok(GenerationAttempt(retry.output, record.model, primaryGenerator))
            is CallResult.Failure -> AttemptResult.Fail(retry.error)
        }
    }

    private fun isAvailabilityFailure(code: ErrorCode): Boolean =
        code == ErrorCode.PROVIDER_UNAVAILABLE || code == ErrorCode.PROVIDER_RATE_LIMITED
```

(g) `auditRetryAttempt`에 `model: ModelId` 파라미터 추가하고 provider/model을 그것으로 기록:

```kotlin
    private fun auditRetryAttempt(
        record: JobRecord,
        model: ModelId,
        previousError: GenerationError,
    ) {
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = model.provider,
                model = model.name,
                transcriptSha256 = null,
                usage = TokenUsage(0, 0, 0),
                costEstimateUsd = BigDecimal.ZERO,
                status = AuditStatus.FAILED,
                errorCode = previousError.code,
                errorMessage = "Retry triggered: ${previousError.message}",
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
    }
```

(h) `succeed`에 `actualModel: ModelId` 파라미터 추가, 회계를 actualModel 기준으로 변경:

```kotlin
    private fun succeed(
        record: JobRecord,
        snapshot: SessionImportV1Snapshot,
        usage: TokenUsage,
        actualModel: ModelId,
        start: Instant,
    ) {
        val cost = CostCalculator.estimate(usage, modelCatalog.pricing(actualModel))
        try {
            costGuard.recordUsage(record.hostUserId, record.clubId, cost)
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: RuntimeException,
        ) {
            logger.warn(
                "costGuard.recordUsage failed for jobId={}; status flip will proceed",
                record.jobId,
                failure,
            )
        }
        val saved =
            jobStore.saveResultIfStatus(
                record.jobId,
                JobStatus.RUNNING,
                snapshot,
                usage,
                cost,
                actualModel.takeIf { it != record.model },
            )
        if (!saved) {
            return
        }
        if (!jobStore.transitionStatus(
                jobId = record.jobId,
                expected = setOf(JobStatus.RUNNING),
                next = JobStatus.SUCCEEDED,
                stage = JobStage.READY,
                progressPct = PROGRESS_COMPLETE_PCT,
                error = null,
            )
        ) {
            return
        }
        emitJobMetrics(record, JobStatus.SUCCEEDED, usage, cost, start, actualModel)
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = actualModel.provider,
                model = actualModel.name,
                transcriptSha256 = null,
                usage = usage,
                costEstimateUsd = cost,
                status = AuditStatus.SUCCESS,
                errorCode = null,
                errorMessage = null,
                latencyMs = elapsedMillis(start),
                createdAt = clock.instant(),
            ),
        )
        maybeNotifyLong(record, start)
    }
```

(i) `emitJobMetrics`에 `model: ModelId` 파라미터 추가, 본문의 `record.model`을 `model`로 치환. `failJob`에서의 호출은 `record.model`을 명시 전달:

```kotlin
    private fun emitJobMetrics(
        record: JobRecord,
        status: JobStatus,
        usage: TokenUsage,
        cost: BigDecimal,
        start: Instant,
        model: ModelId,
    ) {
        val elapsed = Duration.between(start, clock.instant())
        metrics.recordJobCompleted(status, model.provider, model, JobKind.FULL)
        metrics.recordLatency(model.provider, model, JobKind.FULL, elapsed)
        if (usage.inputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.INPUT, usage.inputTokens)
        }
        if (usage.cachedInputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.CACHED_INPUT, usage.cachedInputTokens)
        }
        if (usage.outputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.OUTPUT, usage.outputTokens)
        }
        if (cost > BigDecimal.ZERO) {
            metrics.recordCost(model.provider, model, cost)
        }
    }
```

`failJob` 내부의 `emitJobMetrics(record, JobStatus.FAILED, TokenUsage(0, 0, 0), BigDecimal.ZERO, start)` 호출을 다음으로 변경:

```kotlin
        emitJobMetrics(record, JobStatus.FAILED, TokenUsage(0, 0, 0), BigDecimal.ZERO, start, record.model)
```

(j) import 추가: 파일 상단 import 블록에 `import com.readmates.aigen.application.model.ModelId` (이미 있으면 생략).

- [ ] **Step 7: 테스트 통과 확인**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.application.service.AiGenerationWorkerTest"`
Expected: PASS (기존 + 신규 Failover 6 테스트).

- [ ] **Step 8: 커밋**

```bash
git add server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationWorker.kt \
        server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationWorkerTest.kt \
        server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationFakes.kt
git commit -m "feat(aigen): fail over to next provider on availability failure"
```

---

## Task 4: Redis 왕복 테스트 + 전체 검증 + CHANGELOG

**Files:**
- Modify/Create: Redis job store 테스트 (`server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/`)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 기존 Redis job store 테스트 위치 확인**

Run: `ls server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/`
Expected: `RedisAiGenerationJobStore*Test.kt` 존재 여부 확인. 있으면 그 파일에 테스트를 추가, 없으면 동일 패키지에 `RedisAiGenerationJobStoreActualModelTest.kt`를 생성한다(기존 Redis 테스트의 셋업 패턴 — embedded/Testcontainers Redis 또는 `@SpringBootTest` — 을 그대로 따른다).

- [ ] **Step 2: actualModel 왕복 테스트 작성**

기존 Redis 테스트가 사용하는 동일한 store/redisTemplate 셋업을 재사용해 다음 시나리오를 추가한다(메서드 본문은 기존 테스트의 save→load 패턴을 따른다):

```kotlin
    @Test
    fun `saveResultIfStatus persists actualModel and load round-trips it`() {
        val record = /* 기존 테스트의 RUNNING 상태 JobRecord 빌더 */
        store.save(record)
        val failoverModel = ModelId(Provider.OPENAI, "gpt-5.4-mini")

        val saved =
            store.saveResultIfStatus(
                record.jobId,
                JobStatus.RUNNING,
                /* snapshot */,
                TokenUsage(10, 0, 20),
                java.math.BigDecimal("0.01"),
                failoverModel,
            )

        assertThat(saved).isTrue()
        assertThat(store.load(record.jobId)!!.actualModel).isEqualTo(failoverModel)
    }

    @Test
    fun `load returns null actualModel for a record saved without failover`() {
        val record = /* 기존 테스트의 RUNNING 상태 JobRecord 빌더 */
        store.save(record)

        store.saveResultIfStatus(record.jobId, JobStatus.RUNNING, /* snapshot */, TokenUsage(10, 0, 20), java.math.BigDecimal("0.01"), null)

        assertThat(store.load(record.jobId)!!.actualModel).isNull()
    }
```

> snapshot/JobRecord 빌더는 그 테스트 파일에 이미 있는 헬퍼를 사용한다. 없으면 `AiGenerationTestFixtures.snapshot()` / `jobRecord(status = JobStatus.RUNNING)`를 import해 사용.

- [ ] **Step 3: 해당 테스트 실행**

Run: `./server/gradlew -p server test --tests "com.readmates.aigen.adapter.out.redis.*JobStore*"`
Expected: PASS (Redis 환경이 기존 테스트와 동일하게 기동되어야 함; 셋업을 그대로 따랐다면 통과).

- [ ] **Step 4: 전체 서버 테스트**

Run: `./server/gradlew -p server clean test`
Expected: BUILD SUCCESSFUL. 실패 시 해당 테스트만 수정하고 재실행(새 파라미터 누락/네이밍 불일치가 주 원인).

- [ ] **Step 5: CHANGELOG 갱신**

`CHANGELOG.md`의 `## [Unreleased]` 아래 적절한 하위 섹션(예: `### Added` 또는 프로젝트 관례)에 추가:

```markdown
- AI 생성: provider 가용성 실패 시 전역 `readmates.aigen.fallbackChain`의 다음 provider로 자동 failover(호출 예산 불변, 깊이 1). 비용/audit/metrics는 실제 생성 모델 기준으로 기록.
```

- [ ] **Step 6: 커밋**

```bash
git add server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/ CHANGELOG.md
git commit -m "test(aigen): cover actualModel redis round-trip; changelog"
```

---

## Self-Review 결과

- **Spec coverage**: §3 컴포넌트/설정→Task 1; §4 데이터 모델/직렬화→Task 2; §5 제어 흐름/회계→Task 3; §6 엣지 케이스→Task 3 테스트(빈 체인/콘텐츠 코드/B 실패/캡 소진/검증 위반)+Task 2(구 레코드 null); §7 기동 경고→Task 1 Step 4(ProviderFallbackChain init, 스펙의 ConfigValidator 대신 의존성을 이미 가진 컴포넌트에 배치 — 합리적 정제); §8 테스트→Task 1/3/4; §9 체크/CHANGELOG→Task 4.
- **엣지 케이스 2(후보 disabled/generator 없음)**: `ProviderFallbackChainTest`의 "not enabled"/"no generator" 테스트로 커버.
- **엣지 케이스 3(체인에 A 자신 포함)**: "skips same provider" 테스트로 커버.
- **타입 일관성**: `saveResultIfStatus(..., actualModel: ModelId?)`가 인터페이스/Fake/Redis/워커 호출부에서 일치. `emitJobMetrics(..., model: ModelId)`/`auditRetryAttempt(..., model: ModelId, ...)`/`succeed(..., actualModel: ModelId, ...)` 신규 시그니처가 모든 호출부와 일치. `AttemptResult`/`GenerationAttempt`/`Outcome.Success(actualModel)` 일관.
- **Placeholder**: Redis 왕복 테스트(Task 4 Step 2)의 snapshot/record 빌더는 기존 파일 헬퍼에 의존하므로 `/* */`로 표기 — 실행자가 그 파일의 기존 패턴을 따르도록 명시. 그 외 코드 스텝은 전량 구체화.
