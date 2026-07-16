package com.readmates.aigen.adapter.messaging

import com.readmates.aigen.adapter.`in`.messaging.AiGenerationJobConsumer
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.messaging.AiGenerationJobProducer
import com.readmates.aigen.adapter.out.redis.RedisProviderCallReservationAdapter
import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedAuthoredText
import com.readmates.aigen.application.model.GroundedFeedbackSection
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundedTextBlock
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.AiGenerationJobPublishCommand
import com.readmates.aigen.application.port.out.AiTraceContextPort
import com.readmates.aigen.application.port.out.GroundedGenerationOutput
import com.readmates.aigen.application.port.out.GroundedRequestRenderer
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.ProviderCallGate
import com.readmates.aigen.application.port.out.ProviderCallPermit
import com.readmates.aigen.application.port.out.ProviderCallReconciliationCommand
import com.readmates.aigen.application.port.out.ProviderCallReconciliationResult
import com.readmates.aigen.application.port.out.ProviderCallRecoveryResult
import com.readmates.aigen.application.port.out.ProviderCallReservationCommand
import com.readmates.aigen.application.port.out.ProviderCallReservationPort
import com.readmates.aigen.application.port.out.ProviderCallReservationResult
import com.readmates.aigen.application.port.out.ProviderCircuitOutcome
import com.readmates.aigen.application.port.out.ProviderPermitDecision
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import com.readmates.aigen.application.service.AiGenerationMetrics
import com.readmates.aigen.application.service.AiGenerationTestFixtures
import com.readmates.aigen.application.service.AiGenerationWorker
import com.readmates.aigen.application.service.DefaultGroundedGenerationExecutor
import com.readmates.aigen.application.service.FakeAuditPort
import com.readmates.aigen.application.service.FakeCostGuard
import com.readmates.aigen.application.service.FakeJobStore
import com.readmates.aigen.application.service.FakeLatencyNotification
import com.readmates.aigen.application.service.FakeValidator
import com.readmates.aigen.application.service.GroundedEvidenceProjector
import com.readmates.aigen.application.service.GroundedGenerationValidator
import com.readmates.aigen.application.service.GroundedInputBudgetGuard
import com.readmates.aigen.application.service.GroundedProviderCallCoordinator
import com.readmates.aigen.application.service.GroundedProviderCallPolicy
import com.readmates.aigen.application.service.ProviderFallbackChain
import com.readmates.aigen.application.service.Sleeper
import com.readmates.aigen.config.AiGenerationKafkaConfig
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.support.KafkaTestContainer
import com.readmates.support.RedisTestContainer
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.SpringBootConfiguration
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.kafka.annotation.EnableKafka
import org.springframework.kafka.config.KafkaListenerEndpointRegistry
import org.springframework.kafka.test.utils.ContainerTestUtils
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.math.BigDecimal
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.TimeUnit

@SpringBootTest(
    classes = [
        GroundedAiGenerationJobConsumerIntegrationTest.TestApplication::class,
        AiGenerationKafkaConfig::class,
        AiGenerationJobProducer::class,
        AiGenerationJobConsumer::class,
        GroundedAiGenerationJobConsumerIntegrationTest.RuntimeConfiguration::class,
    ],
    properties = [
        "readmates.aigen.enabled=true",
        "readmates.aigen.kafka.enabled=true",
        "readmates.redis.enabled=true",
    ],
)
@Tag("integration")
@Tag("container")
internal class GroundedAiGenerationJobConsumerIntegrationTest(
    @param:Autowired private val producer: AiGenerationJobProducer,
    @param:Autowired private val runtime: GroundedRuntime,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val listenerRegistry: KafkaListenerEndpointRegistry,
) {
    @Test
    fun `Kafka redelivery recovers stale crashed fallback and preserves the bounded retry ledger`() {
        waitForListenerAssignment()
        val now = Instant.now()
        val record = runtime.newRecord(now)
        runtime.jobStore.save(record)
        prepareRedis(record.jobId, record.clubId)

        producer.publish(
            AiGenerationJobPublishCommand(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                provider = record.model.provider,
                model = record.model.name,
                kind = JobKind.FULL,
            ),
        )

        await()
            .atMost(Duration.ofSeconds(30))
            .untilAsserted {
                assertThat(runtime.jobStore.load(record.jobId)?.status).isEqualTo(JobStatus.SUCCEEDED)
            }

        val ledger = redisTemplate.opsForHash<String, String>().entries("aigen:job:${record.jobId}:provider-attempts")
        val modes = ledger.filterKeys { it.endsWith(":mode") }.values.map(ProviderCallMode::valueOf)
        val states = ledger.filterKeys { it.endsWith(":state") }.values
        assertThat(runtime.crashingReservations.crashes).isEqualTo(1)
        assertThat(runtime.crashingReservations.activeRecoveries).isGreaterThanOrEqualTo(1)
        assertThat(runtime.claude.calls).isEqualTo(2)
        assertThat(runtime.openAi.calls).isEqualTo(1)
        assertThat(modes).hasSize(3)
        assertThat(modes.count { it == ProviderCallMode.FALLBACK }).isEqualTo(1)
        assertThat(states.count { it == "UNKNOWN" }).isGreaterThanOrEqualTo(2)
        assertThat(states.count { it == "SUCCEEDED" }).isEqualTo(1)
        assertThat(redisTemplate.opsForHash<String, String>().get("aigen:job:${record.jobId}", "llmCallCount"))
            .isEqualTo("3")
        assertThat(ledger.keys.joinToString("|").lowercase())
            .doesNotContain("transcript", "prompt", "completion", "evidence", "providerresponse")
    }

    private fun prepareRedis(
        jobId: UUID,
        clubId: UUID,
    ) {
        val jobKey = "aigen:job:$jobId"
        redisTemplate.opsForHash<String, String>().putAll(
            jobKey,
            mapOf("status" to JobStatus.RUNNING.name, "clubId" to clubId.toString(), "llmCallCount" to "0"),
        )
        redisTemplate.expire(jobKey, Duration.ofMinutes(5))
        redisTemplate
            .opsForValue()
            .set("aigen:club:$clubId:provider_admission", jobId.toString(), Duration.ofMinutes(5))
    }

    private fun waitForListenerAssignment() {
        assertThat(listenerRegistry.listenerContainers).hasSize(1)
        ContainerTestUtils.waitForAssignment(listenerRegistry.listenerContainers.single(), 1)
    }

    @SpringBootConfiguration
    @EnableKafka
    @ImportAutoConfiguration(DataRedisAutoConfiguration::class)
    class TestApplication

    @TestConfiguration(proxyBeanMethods = false)
    internal class RuntimeConfiguration {
        @Bean
        @Primary
        fun aiGenerationProperties(): AiGenerationProperties = GroundedRuntime.properties()

        @Bean
        fun groundedRuntime(
            redisTemplate: StringRedisTemplate,
            properties: AiGenerationProperties,
        ): GroundedRuntime = GroundedRuntime(redisTemplate, properties)

        @Bean
        fun aiGenerationWorker(runtime: GroundedRuntime): AiGenerationWorker = runtime.worker

        @Bean
        fun aiGenerationMetrics(runtime: GroundedRuntime): AiGenerationMetrics = runtime.metrics
    }

    companion object {
        private val topicSuffix = UUID.randomUUID().toString()
        private val topicJobs = "readmates.aigen.jobs.grounded-test.$topicSuffix"
        private val consumerGroup = "readmates-aigen-grounded-worker-test-$topicSuffix"

        @JvmStatic
        @DynamicPropertySource
        fun registerProperties(registry: DynamicPropertyRegistry) {
            RedisTestContainer.registerRedisProperties(registry)
            val bootstrapServers = KafkaTestContainer.container.bootstrapServers
            createTopic(bootstrapServers, topicJobs)
            registry.add("readmates.aigen.kafka.bootstrap-servers") { bootstrapServers }
            registry.add("readmates.aigen.kafka.topic-jobs") { topicJobs }
            registry.add("readmates.aigen.kafka.consumer-group") { consumerGroup }
        }

        private fun createTopic(
            bootstrapServers: String,
            topic: String,
        ) {
            AdminClient
                .create(mapOf(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers))
                .use { admin ->
                    admin.createTopics(listOf(NewTopic(topic, 1, 1.toShort()))).all().get(10, TimeUnit.SECONDS)
                }
        }
    }
}

internal class GroundedRuntime(
    redisTemplate: StringRedisTemplate,
    private val properties: AiGenerationProperties,
) {
    val jobStore = FakeJobStore()
    val metrics = AiGenerationMetrics(SimpleMeterRegistry())
    private val audit = FakeAuditPort()
    private val modelCatalog =
        AiGenerationTestFixtures.defaultModelCatalog(setOf(CLAUDE_MODEL, OPENAI_MODEL))
    val claude = SequencedGroundedGenerator(Provider.CLAUDE, failFirst = true)
    val openAi = SequencedGroundedGenerator(Provider.OPENAI, failFirst = false)
    private val groundedGenerators = mapOf(Provider.CLAUDE to claude, Provider.OPENAI to openAi)
    val crashingReservations =
        CrashBeforeFallbackReconciliation(
            RedisProviderCallReservationAdapter(redisTemplate, properties),
        )
    private val coordinator =
        GroundedProviderCallCoordinator(
            gate = ProviderCallGate { ProviderPermitDecision.Acquired(NoOpPermit) },
            reservations = crashingReservations,
            generators = groundedGenerators,
            modelCatalog = modelCatalog,
            auditPort = audit,
            traceContext = AiTraceContextPort { "0123456789abcdef0123456789abcdef" },
            clock = Clock.systemUTC(),
            maxCalls = 3,
        )
    private val groundedExecutor =
        DefaultGroundedGenerationExecutor(
            jobStore = jobStore,
            wholeTranscriptGroundedGeneratorsByProvider = groundedGenerators,
            budgetGuard =
                GroundedInputBudgetGuard(
                    GroundedRequestRenderer {
                        RenderedGroundedRequest("system", "public-safe request", "{}", 16_384)
                    },
                    ModelCapabilityCatalog { ModelCapability(200_000, 64_000, true) },
                    properties,
                ),
            validator = GroundedGenerationValidator(GroundedEvidenceProjector()),
            modelCatalog = modelCatalog,
            auditPort = audit,
            callCoordinator = coordinator,
            latencyNotification = FakeLatencyNotification(),
            properties = properties,
            clock = Clock.systemUTC(),
            metrics = metrics,
            sleeper = Sleeper { },
            fallbackChain = ProviderFallbackChain(emptyMap(), modelCatalog, properties),
            callPolicy = GroundedProviderCallPolicy(properties),
        )
    val worker =
        AiGenerationWorker(
            jobStore = jobStore,
            generators = emptyMap(),
            modelCatalog = modelCatalog,
            validator = FakeValidator(),
            auditPort = audit,
            costGuard = FakeCostGuard(),
            latencyNotification = FakeLatencyNotification(),
            properties = properties,
            clock = Clock.systemUTC(),
            metrics = metrics,
            sleeper = Sleeper { },
            fallbackChain = ProviderFallbackChain(emptyMap(), modelCatalog, properties),
            groundedExecutor = groundedExecutor,
            providerCallReservations = crashingReservations,
        )

    fun newRecord(now: Instant) =
        AiGenerationTestFixtures
            .jobRecord(
                model = CLAUDE_MODEL,
                status = JobStatus.RUNNING,
                stage = JobStage.GENERATING_RECORD,
                sessionMeta =
                    AiGenerationTestFixtures.sessionMeta(
                        expectedAuthorNames = listOf("Alice"),
                    ),
                createdAt = now,
                lastUpdatedAt = now,
                expiresAt = now.plus(Duration.ofHours(1)),
            ).copy(
                pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                validatedTurns =
                    listOf(
                        ValidatedTranscriptTurn(
                            "t000001",
                            "Alice",
                            UUID.fromString("00000000-0000-0000-0000-000000000011"),
                            0,
                            "A public-safe source statement.",
                        ),
                    ),
                eligibleFallbackModels = listOf(OPENAI_MODEL),
                groundingStatus = GroundingStatus.PENDING,
            )

    companion object {
        val CLAUDE_MODEL = AiGenerationTestFixtures.CLAUDE_MODEL
        val OPENAI_MODEL = ModelId(Provider.OPENAI, "gpt-5.4-mini")

        fun properties(): AiGenerationProperties =
            AiGenerationTestFixtures
                .defaultProperties()
                .copy(
                    enabledProviders = setOf("CLAUDE", "OPENAI"),
                    providerCalls =
                        AiGenerationProperties.ProviderCalls(
                            requestTimeout = Duration.ofMillis(500),
                            transientBackoffBase = Duration.ofMillis(1),
                            transientBackoffMax = Duration.ofMillis(5),
                        ),
                )
    }
}

internal class SequencedGroundedGenerator(
    override val provider: Provider,
    private val failFirst: Boolean,
) : WholeTranscriptGroundedGenerator {
    var calls = 0

    override fun generate(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GroundedGenerationOutput {
        calls += 1
        if (failFirst && calls == 1) {
            throw LlmGenerationException(GenerationError(ErrorCode.PROVIDER_UNAVAILABLE, "safe unavailable"))
        }
        return GroundedGenerationOutput(validDraft(), USAGE)
    }

    override fun repair(
        model: ModelId,
        section: GenerationItem,
        request: RenderedGroundedRequest,
    ): GroundedSectionRepairOutput = error("not used")

    private fun validDraft() =
        GroundedGenerationDraft(
            "readmates-grounded-generation:v2",
            7,
            "Test Book",
            LocalDate.of(2026, 5, 16),
            listOf(GroundedTextBlock("A careful opening.", listOf("t000001"))),
            listOf(GroundedAuthoredText("Alice", "A grounded note.", listOf("t000001"))),
            listOf(GroundedAuthoredText("Alice", "A concise review.", listOf("t000001"))),
            "feedback.md",
            listOf(
                GroundedFeedbackSection("관찰자 노트", "Grounded observer note.", listOf("t000001")),
                GroundedFeedbackSection("참여자별 피드백", participantMarkdown(), listOf("t000001")),
            ),
        )

    private fun participantMarkdown() =
        """
        ### 01. Alice

        역할: 근거를 확인하는 참여자

        #### 참여 스타일

        발언의 전제를 확인했다.

        #### 실질 기여

        - 논의의 근거를 정리했다.

        #### 문제점과 자기모순

        ##### 1. 설명을 더 구체화할 수 있었다

        - 핵심: 설명의 범위가 좁았다.
        - 근거: 근거를 한 가지 제시했다.
        - 해석: 적용 조건을 덧붙이면 더 선명해진다.

        #### 실천 과제

        1. 다음 논의에서 적용 조건을 함께 말한다.

        #### 드러난 한 문장

        > 근거를 먼저 확인하겠습니다.

        맥락: 논의 기준을 정리하던 장면

        주석: 판단 과정을 보여준다.
        """.trimIndent()

    companion object {
        val USAGE = TokenUsage(100, 0, 0, 100)
    }
}

internal class CrashBeforeFallbackReconciliation(
    private val delegate: ProviderCallReservationPort,
) : ProviderCallReservationPort {
    private val modesByAttempt = mutableMapOf<UUID, ProviderCallMode>()
    var crashes = 0
    var activeRecoveries = 0

    override fun reserve(command: ProviderCallReservationCommand): ProviderCallReservationResult =
        delegate.reserve(command).also { result ->
            if (result is ProviderCallReservationResult.Reserved) {
                modesByAttempt[result.attempt.attemptId] = command.mode
            }
        }

    override fun reconcile(command: ProviderCallReconciliationCommand): ProviderCallReconciliationResult {
        if (modesByAttempt[command.attemptId] == ProviderCallMode.FALLBACK && crashes == 0) {
            crashes += 1
            throw IllegalStateException("synthetic crash before reconciliation")
        }
        return delegate.reconcile(command)
    }

    override fun recoverStaleInFlightUnknown(
        jobId: UUID,
        staleBefore: Instant,
        now: Instant,
    ): ProviderCallRecoveryResult =
        delegate.recoverStaleInFlightUnknown(jobId, staleBefore, now).also {
            if (it.activeInFlight) activeRecoveries += 1
        }

    override fun clubMonthlyCost(clubId: UUID): BigDecimal = delegate.clubMonthlyCost(clubId)
}

private data object NoOpPermit : ProviderCallPermit {
    override fun record(
        outcome: ProviderCircuitOutcome,
        elapsed: Duration,
    ) = Unit

    override fun close() = Unit
}
