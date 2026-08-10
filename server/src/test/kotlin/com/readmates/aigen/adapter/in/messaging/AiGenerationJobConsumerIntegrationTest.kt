package com.readmates.aigen.adapter.`in`.messaging

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessage
import com.readmates.aigen.adapter.out.messaging.AiGenerationJobProducer
import com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStore
import com.readmates.aigen.adapter.out.redis.RedisGenerationCostCounters
import com.readmates.aigen.adapter.out.redis.RedisProviderCallReservationAdapter
import com.readmates.aigen.application.model.AI_GENERATION_JOB_ID_HEADER
import com.readmates.aigen.application.model.AiGenerationRecoveryResult
import com.readmates.aigen.application.model.AiGenerationRecoverySource
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderAttemptState
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.`in`.RecoverExhaustedAiGenerationJobUseCase
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryCommand
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryResult
import com.readmates.aigen.application.port.out.AiGenerationFailureRecoveryPort
import com.readmates.aigen.application.port.out.AiGenerationIndexRepairResult
import com.readmates.aigen.application.port.out.AiGenerationJobPublishCommand
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AiGenerationProcessingCandidate
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadataResult
import com.readmates.aigen.application.port.out.AiGenerationRecoveryReclassification
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.ProviderCallReservationCommand
import com.readmates.aigen.application.port.out.ProviderCallReservationPort
import com.readmates.aigen.application.port.out.ProviderCallReservationResult
import com.readmates.aigen.application.service.AiGenerationFailureRecoveryService
import com.readmates.aigen.application.service.AiGenerationMetrics
import com.readmates.aigen.application.service.AiGenerationWorker
import com.readmates.aigen.config.AiGenerationKafkaConfig
import com.readmates.aigen.config.AiGenerationKafkaProperties
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.aigen.support.AiGenerationTestModels
import com.readmates.shared.cache.RedisCacheMetrics
import com.readmates.support.KafkaTestContainer
import com.readmates.support.RedisTestContainer
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import io.micrometer.observation.Observation
import io.micrometer.observation.ObservationHandler
import io.micrometer.observation.ObservationRegistry
import io.micrometer.observation.transport.ReceiverContext
import io.micrometer.observation.transport.SenderContext
import io.micrometer.tracing.Tracer
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator
import io.opentelemetry.context.propagation.TextMapPropagator
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.clients.producer.KafkaProducer
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.kafka.clients.producer.ProducerRecord
import org.apache.kafka.common.TopicPartition
import org.apache.kafka.common.header.internals.RecordHeader
import org.apache.kafka.common.serialization.ByteArrayDeserializer
import org.apache.kafka.common.serialization.ByteArraySerializer
import org.apache.kafka.common.serialization.StringDeserializer
import org.apache.kafka.common.serialization.StringSerializer
import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.SmartInitializingSingleton
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.SpringBootConfiguration
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration
import org.springframework.boot.micrometer.observation.autoconfigure.ObservationAutoConfiguration
import org.springframework.boot.micrometer.tracing.autoconfigure.MicrometerTracingAutoConfiguration
import org.springframework.boot.micrometer.tracing.opentelemetry.autoconfigure.OpenTelemetryTracingAutoConfiguration
import org.springframework.boot.opentelemetry.autoconfigure.OpenTelemetrySdkAutoConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.core.Ordered
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.kafka.annotation.EnableKafka
import org.springframework.kafka.config.KafkaListenerEndpointRegistry
import org.springframework.kafka.listener.CommonErrorHandler
import org.springframework.kafka.listener.DefaultErrorHandler
import org.springframework.kafka.listener.RetryListener
import org.springframework.kafka.support.JacksonMapperUtils
import org.springframework.kafka.test.utils.ContainerTestUtils
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.math.BigDecimal
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Properties
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

@SpringBootTest(
    classes = [
        AiGenerationJobConsumerIntegrationTest.TestApplication::class,
        AiGenerationKafkaConfig::class,
        AiGenerationJobProducer::class,
        AiGenerationJobConsumer::class,
        RedisAiGenerationJobStore::class,
        RedisGenerationCostCounters::class,
        RedisProviderCallReservationAdapter::class,
        AiGenerationFailureRecoveryService::class,
        RedisCacheMetrics::class,
        AiGenerationJobConsumerIntegrationTest.TestWorkerConfiguration::class,
        AiGenerationJobConsumerIntegrationTest.TestTracingConfiguration::class,
    ],
    properties = [
        "readmates.aigen.enabled=true",
        "readmates.aigen.kafka.enabled=true",
        "readmates.redis.enabled=true",
        "readmates.aigen.provider-calls.request-timeout=1s",
    ],
)
@Tag("integration")
@Tag("container")
@ImportAutoConfiguration(
    ObservationAutoConfiguration::class,
    MicrometerTracingAutoConfiguration::class,
    OpenTelemetryTracingAutoConfiguration::class,
    OpenTelemetrySdkAutoConfiguration::class,
    DataRedisAutoConfiguration::class,
)
class AiGenerationJobConsumerIntegrationTest(
    @param:Autowired private val producer: AiGenerationJobProducer,
    @param:Autowired private val worker: AiGenerationWorker,
    @param:Autowired private val kafkaListenerEndpointRegistry: KafkaListenerEndpointRegistry,
    @param:Autowired private val observationRegistry: ObservationRegistry,
    @param:Autowired private val tracer: Tracer,
    @param:Autowired private val traceCapture: KafkaTraceObservationCapture,
    @param:Autowired private val redis: StringRedisTemplate,
    @param:Autowired private val jobStore: AiGenerationJobStore,
    @param:Autowired private val admissionGuard: GenerationCostGuard,
    @param:Autowired private val reservations: ProviderCallReservationPort,
    @param:Autowired private val recoveryPortGate: KafkaRecoveryPortGate,
    @param:Autowired private val retryProbe: KafkaRetryProbe,
    @param:Autowired private val meterRegistry: SimpleMeterRegistry,
    @param:Autowired private val mutableClock: MutableKafkaClock,
    @param:Autowired private val exhaustedRecovery: RecoverExhaustedAiGenerationJobUseCase,
    @param:Autowired private val properties: AiGenerationProperties,
) {
    @BeforeEach
    fun resetTraceCapture() {
        traceCapture.clear()
        retryProbe.reset()
        recoveryPortGate.reset()
        mutableClock.reset()
        meterRegistry.clear()
        Mockito.reset(worker)
    }

    @Test
    fun `generic Kafka exhaustion terminalizes pending Redis state before committing`() {
        waitForListenerAssignment()
        val command = command(UUID.randomUUID())
        seedJob(command, JobStatus.PENDING)
        assertPendingAdmission(command)
        Mockito.doThrow(RuntimeException("generic worker failure")).`when`(worker).process(command.jobId)
        val initialOffset = committedOffset()

        producer.publish(command)

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                assertThat(jobStatus(command.jobId)).isEqualTo(JobStatus.FAILED.name)
                Mockito.verify(worker, Mockito.times(3)).process(command.jobId)
                assertThat(retryProbe.attempts(initialOffset)).containsExactly(1, 2, 3)
                assertThat(committedOffset()).isEqualTo(initialOffset + 1)
                assertThat(
                    recoveryMetric(AiGenerationRecoverySource.KAFKA, AiGenerationRecoveryResult.RECOVERED_PENDING),
                ).isEqualTo(1.0)
            }
        assertPendingAdmissionReleased(command)
        assertRemovedFromRecoveryIndexes(command.jobId)
    }

    @Test
    fun `live recovery defers without commit and stale redelivery uses current Redis state`() {
        waitForListenerAssignment()
        val command = command(UUID.randomUUID())
        seedJob(command, JobStatus.RUNNING)
        val physicalCalls = AtomicInteger()
        val reservation =
            reservations.reserve(
                providerReservation(
                    command = command,
                    attemptId = UUID.randomUUID(),
                    now = mutableClock.instant(),
                ),
            )
        assertThat(reservation).isInstanceOf(ProviderCallReservationResult.Reserved::class.java)
        physicalCalls.incrementAndGet()
        Mockito
            .doThrow(RuntimeException("synthetic crash after provider reservation"))
            .`when`(worker)
            .process(command.jobId)
        val initialOffset = committedOffset()

        producer.publish(command)

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                assertThat(retryProbe.recoveryFailures(initialOffset)).isGreaterThanOrEqualTo(2)
                assertThat(retryProbe.attempts(initialOffset).take(6)).containsExactly(1, 2, 3, 1, 2, 3)
                assertThat(jobStatus(command.jobId)).isEqualTo(JobStatus.RUNNING.name)
                assertThat(providerAttemptStates(command.jobId)).containsExactly(ProviderAttemptState.IN_FLIGHT.name)
                assertThat(providerReservationCount(command.jobId)).isEqualTo(1)
                assertThat(physicalCalls.get()).isEqualTo(1)
                assertThat(committedOffset()).isEqualTo(initialOffset)
            }

        val attemptsBeforeRestart = retryProbe.attempts(initialOffset).size
        restartListener()
        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                assertThat(retryProbe.attempts(initialOffset).size).isGreaterThan(attemptsBeforeRestart)
                assertThat(providerReservationCount(command.jobId)).isEqualTo(1)
                assertThat(physicalCalls.get()).isEqualTo(1)
                assertThat(committedOffset()).isEqualTo(initialOffset)
            }

        mutableClock.advance(Duration.ofSeconds(2))

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                assertThat(jobStatus(command.jobId)).isEqualTo(JobStatus.FAILED.name)
                assertThat(providerAttemptStates(command.jobId)).containsExactly(ProviderAttemptState.UNKNOWN.name)
                assertThat(providerReservationCount(command.jobId)).isEqualTo(1)
                assertThat(physicalCalls.get()).isEqualTo(1)
                assertThat(jobField(command.jobId, "llmCallCount")).isEqualTo("1")
                assertThat(redis.opsForValue().get(monthlyCostKey(command.clubId))).isEqualTo("0.25")
                assertThat(providerUnknownCostMetric()).isEqualTo(0.25)
                assertThat(committedOffset()).isEqualTo(initialOffset + 1)
            }
        assertThat(redis.hasKey(admissionKey(command.clubId))).isFalse()
        assertThat(redis.opsForValue().get(dailyKey(command.hostUserId))).isEqualTo("1")
        assertRemovedFromRecoveryIndexes(command.jobId)
    }

    @Test
    fun `malformed value with canonical job header recovers Redis state before commit`() {
        waitForListenerAssignment()
        val command = command(UUID.randomUUID())
        seedJob(command, JobStatus.PENDING)
        val initialOffset = committedOffset()

        val recordOffset =
            sendRawRecord(
                value = "{malformed-json".toByteArray(StandardCharsets.UTF_8),
                headerValues = listOf(command.jobId.toString()),
            )
        assertThat(recordOffset).isGreaterThanOrEqualTo(initialOffset)

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                assertThat(jobStatus(command.jobId)).isEqualTo(JobStatus.FAILED.name)
                assertThat(retryProbe.attempts(recordOffset)).containsExactly(1, 2, 3)
                assertThat(committedOffset()).isEqualTo(recordOffset + 1)
                assertThat(
                    recoveryMetric(AiGenerationRecoverySource.KAFKA, AiGenerationRecoveryResult.RECOVERED_PENDING),
                ).isEqualTo(1.0)
                Mockito.verifyNoInteractions(worker)
            }
        assertPendingAdmissionReleased(command)
    }

    @Test
    fun `ambiguous and absent poison identities consume bounded recovery without invoking worker`() {
        waitForListenerAssignment()
        val command = command(UUID.randomUUID())
        seedJob(command, JobStatus.PENDING)
        val message = message(command.jobId)
        val validJson = JacksonMapperUtils.enhancedJsonMapper().writeValueAsBytes(message)
        val cases =
            listOf(
                "malformed-no-header" to ("{malformed-json".toByteArray(StandardCharsets.UTF_8) to emptyList()),
                "valid-no-header" to (validJson to emptyList()),
                "valid-invalid-header" to (validJson to listOf("not-a-uuid")),
                "valid-mismatched-header" to (validJson to listOf(UUID.randomUUID().toString())),
            )
        val rootLogger = LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME) as Logger
        val logAppender = ListAppender<ILoggingEvent>().apply { start() }
        rootLogger.addAppender(logAppender)

        try {
            cases.forEachIndexed { index, (description, fixture) ->
                val initialOffset = committedOffset()
                val recordOffset = sendRawRecord(fixture.first, fixture.second)
                assertThat(recordOffset).isGreaterThanOrEqualTo(initialOffset)

                await()
                    .atMost(Duration.ofSeconds(20))
                    .alias(description)
                    .untilAsserted {
                        assertThat(retryProbe.attempts(recordOffset)).containsExactly(1, 2, 3)
                        assertThat(unroutableMetric()).isEqualTo((index + 1).toDouble())
                        assertThat(committedOffset()).isEqualTo(recordOffset + 1)
                    }
            }
        } finally {
            rootLogger.detachAppender(logAppender)
            logAppender.stop()
        }
        assertThat(jobStatus(command.jobId)).isEqualTo(JobStatus.PENDING.name)
        Mockito.verifyNoInteractions(worker)
        assertThat(logAppender.list.map(ILoggingEvent::getFormattedMessage).joinToString("\n"))
            .doesNotContain("{malformed-json", "not-a-uuid", command.jobId.toString())

        val scheduledResult = exhaustedRecovery.recoverExhausted(command.jobId, AiGenerationRecoverySource.SCHEDULED)
        assertThat(scheduledResult).isEqualTo(AiGenerationRecoveryResult.RECOVERED_PENDING)
        assertThat(jobStatus(command.jobId)).isEqualTo(JobStatus.FAILED.name)
        assertThat(recoveryMetric(AiGenerationRecoverySource.SCHEDULED, AiGenerationRecoveryResult.RECOVERED_PENDING))
            .isEqualTo(1.0)
    }

    @Test
    fun `persistence recovery failure resets the exact delivery cycle and rereads current Redis state`() {
        waitForListenerAssignment()
        val command = command(UUID.randomUUID())
        seedJob(command, JobStatus.PENDING)
        Mockito.doThrow(RuntimeException("generic worker failure")).`when`(worker).process(command.jobId)
        recoveryPortGate.failLoads.set(true)
        val initialOffset = committedOffset()

        producer.publish(command)

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                assertThat(retryProbe.recoveryFailures(initialOffset)).isGreaterThanOrEqualTo(1)
                assertThat(retryProbe.attempts(initialOffset).take(4)).containsExactly(1, 2, 3, 1)
                assertThat(jobStatus(command.jobId)).isEqualTo(JobStatus.PENDING.name)
                assertThat(committedOffset()).isEqualTo(initialOffset)
            }

        jobStore.updateStatus(
            command.jobId,
            JobStatus.RUNNING,
            JobStage.GENERATING_RECORD,
            10,
            null,
        )
        assertThat(jobStatus(command.jobId)).isEqualTo(JobStatus.RUNNING.name)
        recoveryPortGate.failLoads.set(false)

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                assertThat(jobStatus(command.jobId)).isEqualTo(JobStatus.FAILED.name)
                assertThat(committedOffset()).isEqualTo(initialOffset + 1)
                assertThat(
                    recoveryMetric(AiGenerationRecoverySource.KAFKA, AiGenerationRecoveryResult.RECOVERED_RUNNING),
                ).isEqualTo(1.0)
                assertThat(redis.opsForValue().get(dailyKey(command.hostUserId))).isEqualTo("1")
            }
    }

    @Test
    fun `native Kafka observations propagate traceparent without changing the routing payload`() {
        waitForListenerAssignment()
        val jobId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val hostUserId = UUID.randomUUID()
        Mockito.doNothing().`when`(worker).process(jobId)

        val traceId =
            publishObserved(
                AiGenerationJobPublishCommand(
                    jobId = jobId,
                    sessionId = sessionId,
                    clubId = clubId,
                    hostUserId = hostUserId,
                    provider = Provider.CLAUDE,
                    model = AiGenerationTestModels.CLAUDE_DEFAULT,
                    kind = JobKind.FULL,
                ),
            )

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                Mockito.verify(worker).process(jobId)
            }

        val record = readRawRecord(jobId)
        val traceparentHeaders = record.headers().headers("traceparent").toList()
        assertThat(traceparentHeaders).hasSize(1)
        assertThat(String(traceparentHeaders.single().value(), StandardCharsets.US_ASCII))
            .matches("00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]")
        assertThat(record.headers().headers("baggage")).isEmpty()
        val jobIdHeaders = record.headers().headers(AI_GENERATION_JOB_ID_HEADER).toList()
        assertThat(jobIdHeaders).hasSize(1)
        assertThat(String(jobIdHeaders.single().value(), StandardCharsets.US_ASCII)).isEqualTo(jobId.toString())
        val payloadJson = String(record.value(), StandardCharsets.UTF_8)
        assertThat(payloadJson).contains(jobId.toString(), clubId.toString())
        assertThat(payloadJson).doesNotContain("traceparent", "baggage", "traceId", "spanId")

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                val kafkaSpans = traceCapture.spansForTrace(traceId)
                val producerSpans = kafkaSpans.filter { it.direction == KafkaTraceDirection.PRODUCER }
                val consumerSpans = kafkaSpans.filter { it.direction == KafkaTraceDirection.CONSUMER }
                assertThat(producerSpans)
                    .describedAs(
                        "trace=%s captured spans: %s",
                        traceId,
                        traceCapture.snapshot(),
                    ).hasSize(1)
                assertThat(consumerSpans).hasSize(1)
                assertThat(producerSpans.single().spanId).isNotEqualTo(consumerSpans.single().spanId)
            }
    }

    @Test
    fun `consumer redelivers when the worker throws so the job is reprocessed`() {
        waitForListenerAssignment()
        val jobId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val hostUserId = UUID.randomUUID()
        // First call throws (consumer skips ack → container redelivers); subsequent calls succeed.
        Mockito
            .doThrow(RuntimeException("first attempt fails"))
            .doNothing()
            .`when`(worker)
            .process(jobId)

        val traceId =
            publishObserved(
                AiGenerationJobPublishCommand(
                    jobId = jobId,
                    sessionId = sessionId,
                    clubId = clubId,
                    hostUserId = hostUserId,
                    provider = Provider.CLAUDE,
                    model = AiGenerationTestModels.CLAUDE_DEFAULT,
                    kind = JobKind.FULL,
                ),
            )

        await()
            .atMost(Duration.ofSeconds(30))
            .untilAsserted {
                Mockito.verify(worker, Mockito.times(2)).process(jobId)
                val consumerSpans =
                    traceCapture
                        .spansForTrace(traceId)
                        .filter { it.direction == KafkaTraceDirection.CONSUMER }
                assertThat(consumerSpans)
                    .describedAs("captured spans: %s", traceCapture.snapshot())
                    .hasSize(2)
                assertThat(consumerSpans.map(CapturedKafkaTrace::spanId)).doesNotHaveDuplicates()
            }
    }

    @Test
    fun `AiGenerationJobMessage payload contains only routing metadata as a structural PII guarantee`() {
        val fields =
            AiGenerationJobMessage::class.java.declaredFields.map { it.name }

        assertThat(fields).containsExactlyInAnyOrder(
            "jobId",
            "sessionId",
            "clubId",
            "hostUserId",
            "provider",
            "model",
            "kind",
        )
        assertThat(fields).doesNotContain(
            "transcript",
            "turns",
            "speakerName",
            "result",
            "evidence",
            "excerpt",
            "instructions",
            "prompt",
            "providerResponse",
        )
    }

    private fun seedJob(
        command: AiGenerationJobPublishCommand,
        status: JobStatus,
    ) {
        assertThat(admissionGuard.checkBeforeCall(command.hostUserId, command.clubId, command.jobId))
            .isEqualTo(GuardDecision.Allow)
        jobStore.save(jobRecord(command, status))
    }

    private fun jobRecord(
        command: AiGenerationJobPublishCommand,
        status: JobStatus,
    ): JobRecord {
        val now = mutableClock.instant()
        return JobRecord(
            jobId = command.jobId,
            sessionId = command.sessionId,
            clubId = command.clubId,
            hostUserId = command.hostUserId,
            model = ModelId(command.provider, command.model),
            authorNameMode = AuthorNameMode.REAL,
            instructions = null,
            transcript = "Public-safe Kafka recovery fixture transcript.",
            sessionMeta =
                SessionMeta(
                    command.sessionId,
                    command.clubId,
                    1,
                    "Public Test Book",
                    null,
                    LocalDate.of(2026, 8, 10),
                    listOf("Alice"),
                    AuthorNameMode.REAL,
                ),
            status = status,
            stage = if (status == JobStatus.PENDING) JobStage.QUEUED else JobStage.GENERATING_RECORD,
            progressPct = if (status == JobStatus.PENDING) 0 else 10,
            result = null,
            error = null,
            tokens = TokenUsage.ZERO,
            costAccumulatedUsd = BigDecimal.ZERO,
            expiresAt = now.plus(properties.job.redisTtl),
            createdAt = now.minusSeconds(60),
            lastUpdatedAt = now,
            validatedTurns =
                listOf(
                    ValidatedTranscriptTurn(
                        "t000001",
                        "Alice",
                        UUID.randomUUID(),
                        0,
                        "Public-safe source statement.",
                    ),
                ),
        )
    }

    private fun providerReservation(
        command: AiGenerationJobPublishCommand,
        attemptId: UUID,
        now: Instant,
    ) = ProviderCallReservationCommand(
        attemptId = attemptId,
        jobId = command.jobId,
        clubId = command.clubId,
        admissionId = command.jobId,
        expectedStatus = JobStatus.RUNNING,
        model = ModelId(command.provider, command.model),
        mode = ProviderCallMode.PRIMARY,
        maximumCostUsd = BigDecimal("0.25"),
        maxCalls = 3,
        now = now,
    )

    private fun assertPendingAdmission(command: AiGenerationJobPublishCommand) {
        assertThat(redis.opsForValue().get(dailyKey(command.hostUserId))).isEqualTo("1")
        assertThat(redis.opsForValue().get(minuteKey(command.hostUserId))).isEqualTo("1")
        assertThat(redis.opsForValue().get(admissionKey(command.clubId))).isEqualTo(command.jobId.toString())
        assertThat(redis.hasKey(receiptKey(command.jobId))).isTrue()
        assertThat(redis.opsForZSet().score(PROCESSING_RECOVERY_KEY, command.jobId.toString())).isNotNull()
    }

    private fun assertPendingAdmissionReleased(command: AiGenerationJobPublishCommand) {
        assertThat(redis.opsForValue().get(dailyKey(command.hostUserId))).isEqualTo("0")
        assertThat(redis.opsForValue().get(minuteKey(command.hostUserId))).isEqualTo("0")
        assertThat(redis.hasKey(admissionKey(command.clubId))).isFalse()
        assertThat(redis.hasKey(receiptKey(command.jobId))).isFalse()
    }

    private fun assertRemovedFromRecoveryIndexes(jobId: UUID) {
        assertThat(redis.opsForZSet().score(ACTIVE_JOBS_KEY, jobId.toString()) == null).isTrue()
        assertThat(redis.opsForZSet().score(PROCESSING_RECOVERY_KEY, jobId.toString()) == null).isTrue()
    }

    private fun jobStatus(jobId: UUID): String? = jobField(jobId, "status")

    private fun jobField(
        jobId: UUID,
        field: String,
    ): String? = redis.opsForHash<String, String>().get(jobKey(jobId), field)

    private fun providerAttemptStates(jobId: UUID): List<String> =
        redis
            .opsForHash<String, String>()
            .entries(providerAttemptsKey(jobId))
            .filterKeys { it.endsWith(":state") }
            .values
            .toList()

    private fun providerReservationCount(jobId: UUID): Int =
        redis
            .opsForHash<String, String>()
            .keys(providerAttemptsKey(jobId))
            .count { it.endsWith(":state") }

    private fun recoveryMetric(
        source: AiGenerationRecoverySource,
        result: AiGenerationRecoveryResult,
    ): Double =
        meterRegistry
            .find(FAILURE_RECOVERY_METRIC)
            .tags("source", source.name.lowercase(), "result", result.name.lowercase())
            .counter()
            ?.count() ?: 0.0

    private fun unroutableMetric(): Double =
        recoveryMetric(
            AiGenerationRecoverySource.KAFKA,
            AiGenerationRecoveryResult.UNROUTABLE_RECORD,
        )

    private fun providerUnknownCostMetric(): Double =
        meterRegistry
            .find(PROVIDER_COST_METRIC)
            .tags("provider", Provider.CLAUDE.name, "basis", "ESTIMATED_UNKNOWN")
            .counter()
            ?.count() ?: 0.0

    private fun waitForListenerAssignment() {
        val listenerContainers = kafkaListenerEndpointRegistry.listenerContainers
        assertThat(listenerContainers).hasSize(1)
        ContainerTestUtils.waitForAssignment(listenerContainers.single(), 1)
    }

    private fun restartListener() {
        val container = kafkaListenerEndpointRegistry.listenerContainers.single()
        val stopped = CountDownLatch(1)
        container.stop(stopped::countDown)
        assertThat(stopped.await(10, TimeUnit.SECONDS)).isTrue()
        container.start()
        ContainerTestUtils.waitForAssignment(container, 1)
    }

    private fun command(jobId: UUID) =
        AiGenerationJobPublishCommand(
            jobId = jobId,
            sessionId = UUID.randomUUID(),
            clubId = UUID.randomUUID(),
            hostUserId = UUID.randomUUID(),
            provider = Provider.CLAUDE,
            model = AiGenerationTestModels.CLAUDE_DEFAULT,
            kind = JobKind.FULL,
        )

    private fun message(jobId: UUID) =
        AiGenerationJobMessage(
            jobId = jobId,
            sessionId = UUID.randomUUID(),
            clubId = UUID.randomUUID(),
            hostUserId = UUID.randomUUID(),
            provider = Provider.CLAUDE,
            model = AiGenerationTestModels.CLAUDE_DEFAULT,
            kind = JobKind.FULL,
        )

    private fun sendRawRecord(
        value: ByteArray,
        headerValues: List<String>,
    ): Long {
        val properties =
            mapOf<String, Any>(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG to KafkaTestContainer.container.bootstrapServers,
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG to StringSerializer::class.java,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG to ByteArraySerializer::class.java,
            )
        KafkaProducer<String, ByteArray>(properties).use { rawProducer ->
            val record = ProducerRecord<String, ByteArray>(topicJobs, "club", value)
            headerValues.forEach { header ->
                record.headers().add(
                    RecordHeader(
                        AI_GENERATION_JOB_ID_HEADER,
                        header.toByteArray(StandardCharsets.US_ASCII),
                    ),
                )
            }
            return rawProducer.send(record).get(10, TimeUnit.SECONDS).offset()
        }
    }

    private fun committedOffset(): Long =
        AdminClient
            .create(mapOf(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG to KafkaTestContainer.container.bootstrapServers))
            .use { admin ->
                admin
                    .listConsumerGroupOffsets(consumerGroup)
                    .partitionsToOffsetAndMetadata()
                    .get(10, TimeUnit.SECONDS)[TopicPartition(topicJobs, 0)]
                    ?.offset() ?: 0L
            }

    private fun publishObserved(command: AiGenerationJobPublishCommand): String {
        val observation = Observation.start("readmates.aigen.test.publish", observationRegistry)
        try {
            observation.openScope().use {
                val traceId = checkNotNull(tracer.currentSpan()).context().traceId()
                producer.publish(command)
                return traceId
            }
        } finally {
            observation.stop()
        }
    }

    private fun readRawRecord(jobId: UUID): org.apache.kafka.clients.consumer.ConsumerRecord<String, ByteArray> {
        val properties =
            Properties().also {
                it[ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG] = KafkaTestContainer.container.bootstrapServers
                it[ConsumerConfig.GROUP_ID_CONFIG] = "readmates-aigen-trace-inspector-${UUID.randomUUID()}"
                it[ConsumerConfig.AUTO_OFFSET_RESET_CONFIG] = "earliest"
                it[ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG] = "false"
            }
        KafkaConsumer(properties, StringDeserializer(), ByteArrayDeserializer()).use { consumer ->
            consumer.subscribe(listOf(topicJobs))
            val deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos()
            while (System.nanoTime() < deadline) {
                consumer
                    .poll(Duration.ofMillis(250))
                    .firstOrNull { record ->
                        String(record.value(), StandardCharsets.UTF_8).contains(jobId.toString())
                    }?.let { return it }
            }
        }
        error("Kafka record was not observable for job $jobId")
    }

    @SpringBootConfiguration
    @EnableKafka
    class TestApplication

    @TestConfiguration(proxyBeanMethods = false)
    class TestWorkerConfiguration {
        @Bean
        fun aiGenerationWorker(): AiGenerationWorker = Mockito.mock(AiGenerationWorker::class.java)

        @Bean
        fun meterRegistry(): SimpleMeterRegistry = SimpleMeterRegistry()

        @Bean
        fun metrics(meterRegistry: SimpleMeterRegistry) = AiGenerationMetrics(meterRegistry)

        @Bean
        fun mutableKafkaClock(): MutableKafkaClock = MutableKafkaClock()

        @Bean
        @Primary
        fun gatedRecovery(delegate: RedisAiGenerationJobStore) = KafkaRecoveryPortGate(delegate)

        @Bean
        fun kafkaRetryProbe(): KafkaRetryProbe = KafkaRetryProbe()

        @Bean
        fun installKafkaRetryProbe(
            errorHandler: CommonErrorHandler,
            retryProbe: KafkaRetryProbe,
        ): SmartInitializingSingleton =
            SmartInitializingSingleton {
                (errorHandler as DefaultErrorHandler).setRetryListeners(retryProbe)
            }
    }

    @Suppress("MaxLineLength")
    @TestConfiguration(proxyBeanMethods = false)
    class TestTracingConfiguration {
        @Bean
        fun kafkaTraceObservationCapture(tracer: Tracer): KafkaTraceObservationCapture = KafkaTraceObservationCapture(tracer)

        @Bean
        fun traceContextPropagator(): TextMapPropagator = W3CTraceContextPropagator.getInstance()
    }

    companion object {
        private val topicSuffix = UUID.randomUUID().toString()
        private val topicJobs = "readmates.aigen.jobs.test.$topicSuffix"
        private val consumerGroup = "readmates-aigen-worker-test-$topicSuffix"

        @JvmStatic
        @DynamicPropertySource
        fun registerKafkaProperties(registry: DynamicPropertyRegistry) {
            RedisTestContainer.registerRedisProperties(registry)
            val bootstrapServers = KafkaTestContainer.container.bootstrapServers
            createTopic(bootstrapServers, topicJobs)

            registry.add("readmates.aigen.kafka.bootstrap-servers") { bootstrapServers }
            registry.add("readmates.aigen.kafka.topic-jobs") { topicJobs }
            registry.add("readmates.aigen.kafka.consumer-group") { consumerGroup }
            registry.add("readmates.aigen.kafka.consumer-retry-delay") { "1ms" }
            registry.add("readmates.aigen.kafka.consumer-max-attempts") { "3" }
        }

        private fun createTopic(
            bootstrapServers: String,
            topic: String,
        ) {
            AdminClient
                .create(mapOf(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers))
                .use { adminClient ->
                    adminClient
                        .createTopics(listOf(NewTopic(topic, 1, 1.toShort())))
                        .all()
                        .get(10, TimeUnit.SECONDS)
                }
        }
    }
}

class KafkaRecoveryPortGate(
    private val delegate: AiGenerationFailureRecoveryPort,
) : AiGenerationFailureRecoveryPort {
    val failLoads = AtomicBoolean()

    fun reset() {
        failLoads.set(false)
    }

    override fun loadRecoveryMetadata(jobId: UUID): AiGenerationRecoveryMetadataResult {
        if (failLoads.get()) throw IllegalStateException("synthetic recovery persistence failure")
        return delegate.loadRecoveryMetadata(jobId)
    }

    override fun recover(command: AtomicRecoveryCommand): AtomicRecoveryResult = delegate.recover(command)

    override fun reclassify(
        jobId: UUID,
        now: Instant,
    ): AiGenerationRecoveryReclassification = delegate.reclassify(jobId, now)

    override fun quarantineCorrupt(
        jobId: UUID,
        now: Instant,
    ) = delegate.quarantineCorrupt(jobId, now)

    override fun repairProcessingRecoveryIndex(now: Instant): IndexRepairResult = repairIndex(now)

    override fun loadProcessingRecoveryJobs(
        staleBefore: Instant,
        limit: Int,
    ): List<AiGenerationProcessingCandidate> = delegate.loadProcessingRecoveryJobs(staleBefore, limit)

    private fun repairIndex(now: Instant): IndexRepairResult = delegate.repairProcessingRecoveryIndex(now)
}

class KafkaRetryProbe : RetryListener {
    private val attemptsByOffset = ConcurrentHashMap<Long, CopyOnWriteArrayList<Int>>()
    private val recoveryFailuresByOffset = ConcurrentHashMap<Long, AtomicInteger>()

    override fun failedDelivery(
        record: org.apache.kafka.clients.consumer.ConsumerRecord<*, *>,
        ex: Exception?,
        deliveryAttempt: Int,
    ) {
        attemptsByOffset.computeIfAbsent(record.offset()) { CopyOnWriteArrayList() }.add(deliveryAttempt)
    }

    override fun recoveryFailed(
        record: org.apache.kafka.clients.consumer.ConsumerRecord<*, *>,
        original: Exception?,
        failure: Exception,
    ) {
        recoveryFailuresByOffset.computeIfAbsent(record.offset()) { AtomicInteger() }.incrementAndGet()
    }

    fun attempts(offset: Long): List<Int> = attemptsByOffset[offset]?.toList().orEmpty()

    fun recoveryFailures(offset: Long): Int = recoveryFailuresByOffset[offset]?.get() ?: 0

    fun reset() {
        attemptsByOffset.clear()
        recoveryFailuresByOffset.clear()
    }
}

class MutableKafkaClock : Clock() {
    private val current = AtomicReference(BASE_INSTANT)

    fun reset() {
        current.set(BASE_INSTANT)
    }

    fun advance(duration: Duration) {
        current.updateAndGet { it.plus(duration) }
    }

    override fun instant(): Instant = current.get()

    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId): Clock = Clock.fixed(instant(), zone)

    private companion object {
        val BASE_INSTANT: Instant = Instant.parse("2026-08-10T10:00:00Z")
    }
}

private fun jobKey(jobId: UUID) = "aigen:job:$jobId"

private fun receiptKey(jobId: UUID) = "aigen:job:$jobId:admission-receipt"

private fun providerAttemptsKey(jobId: UUID) = "aigen:job:$jobId:provider-attempts"

private fun dailyKey(hostUserId: UUID) = "aigen:host:$hostUserId:daily"

private fun minuteKey(hostUserId: UUID) = "aigen:host:$hostUserId:minute"

private fun admissionKey(clubId: UUID) = "aigen:club:$clubId:provider_admission"

private fun monthlyCostKey(clubId: UUID) = "aigen:club:$clubId:monthly_cost_usd"

private typealias AtomicRecoveryCommand = AiGenerationAtomicRecoveryCommand
private typealias AtomicRecoveryResult = AiGenerationAtomicRecoveryResult
private typealias IndexRepairResult = AiGenerationIndexRepairResult

private const val ACTIVE_JOBS_KEY = "aigen:jobs:active"
private const val PROCESSING_RECOVERY_KEY = "aigen:jobs:processing-recovery"
private const val FAILURE_RECOVERY_METRIC = "readmates.aigen.failure.recovery"
private const val PROVIDER_COST_METRIC = "readmates.aigen.provider.cost.usd"

enum class KafkaTraceDirection { PRODUCER, CONSUMER }

data class CapturedKafkaTrace(
    val direction: KafkaTraceDirection,
    val traceId: String,
    val spanId: String,
)

@Suppress("MaxLineLength")
class KafkaTraceObservationCapture(
    private val tracer: Tracer,
) : ObservationHandler<Observation.Context>,
    Ordered {
    private val captured = CopyOnWriteArrayList<CapturedKafkaTrace>()

    fun clear() = captured.clear()

    fun spansForTrace(traceId: String): List<CapturedKafkaTrace> = captured.filter { it.traceId == traceId }.distinct()

    fun snapshot(): List<CapturedKafkaTrace> = captured.toList()

    override fun supportsContext(context: Observation.Context): Boolean = context is SenderContext<*> || context is ReceiverContext<*>

    override fun onScopeOpened(context: Observation.Context) {
        val span = checkNotNull(tracer.currentSpan())
        val direction =
            when (context) {
                is SenderContext<*> -> KafkaTraceDirection.PRODUCER
                is ReceiverContext<*> -> KafkaTraceDirection.CONSUMER
                else -> error("Unsupported Kafka observation context")
            }
        captured +=
            CapturedKafkaTrace(
                direction = direction,
                traceId = span.context().traceId(),
                spanId = span.context().spanId(),
            )
    }

    override fun getOrder(): Int = Ordered.LOWEST_PRECEDENCE
}
