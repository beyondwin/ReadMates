package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.ActiveAiGenerationJobProbe
import com.readmates.aigen.application.port.out.AiGenerationAdmissionDisposition
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryCommand
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryResult
import com.readmates.aigen.application.port.out.AiGenerationFailureRecoveryPort
import com.readmates.aigen.application.port.out.AiGenerationIndexRepairResult
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AiGenerationProcessingCandidate
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadataResult
import com.readmates.aigen.application.port.out.AiGenerationRecoveryReclassification
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.ProviderCallReservationCommand
import com.readmates.aigen.application.port.out.ProviderCallReservationPort
import com.readmates.aigen.application.port.out.ProviderCallReservationResult
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.math.BigDecimal
import java.nio.file.Path
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.io.path.readText

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
        "readmates.aigen.enabled=true",
        "readmates.aigen.enabled-providers=OPENAI",
        "readmates.aigen.fallback-default-model=gpt-5.4-mini",
        "readmates.aigen.grounded.capabilities[gpt-5.4-mini].context-window-tokens=400000",
        "readmates.aigen.grounded.capabilities[gpt-5.4-mini].max-output-tokens=128000",
        "readmates.aigen.grounded.capabilities[gpt-5.4-mini].structured-output-supported=true",
        "readmates.aigen.pricing[gpt-5.4-mini].input-per-m-token-usd=0.75",
        "readmates.aigen.pricing[gpt-5.4-mini].cache-write-input-per-m-token-usd=0.75",
        "readmates.aigen.pricing[gpt-5.4-mini].cached-input-per-m-token-usd=0.075",
        "readmates.aigen.pricing[gpt-5.4-mini].output-per-m-token-usd=4.50",
        "readmates.aigen.job.recovery-index-repair-batch-size=2",
        "readmates.aigen.job.recovery-index-repair-max-members=3",
        "spring.ai.model.chat=none",
        "READMATES_AIGEN_OPENAI_API_KEY=test-key",
        "spring.ai.google.genai.api-key=test-key",
        "spring.ai.openai.api-key=test-key",
        "spring.ai.anthropic.api-key=test-key",
    ],
)
@Tag("integration")
@Tag("container")
class RedisAiGenerationFailureRecoveryTest(
    @param:Autowired private val recovery: AiGenerationFailureRecoveryPort,
    @param:Autowired private val store: AiGenerationJobStore,
    @param:Autowired private val guard: GenerationCostGuard,
    @param:Autowired private val reservations: ProviderCallReservationPort,
    @param:Autowired private val redis: StringRedisTemplate,
    @param:Autowired private val properties: AiGenerationProperties,
    @param:Autowired private val queueProbe: ActiveAiGenerationJobProbe,
) : ReadmatesRedisIntegrationTestSupport() {
    @Suppress("UnusedPrivateProperty")
    @MockitoBean
    private lateinit var jobQueue: AiGenerationJobQueue

    @BeforeEach
    fun clearRecoveryIndexes() {
        redis.delete(redis.keys("$PROCESSING_KEY:repair-worklist:*").orEmpty())
        redis.delete(
            listOf(
                PROCESSING_KEY,
                QUARANTINE_KEY,
                ACTIVE_KEY,
                ACTIVE_EPOCH_KEY,
                REPAIR_STATE_KEY,
            ),
        )
    }

    @Test
    fun `queue probe is unavailable until the active epoch has a completed repair pass`() {
        assertThat(queueProbe.probe(NOW)).isEqualTo(
            ActiveAiGenerationJobProbe.Unavailable(
                ActiveAiGenerationJobProbe.UnavailableReason.INDEX_NOT_READY,
            ),
        )

        assertThat(recovery.repairProcessingRecoveryIndex(NOW))
            .isEqualTo(AiGenerationIndexRepairResult.PASS_COMPLETED)
        assertThat(queueProbe.probe(NOW)).isEqualTo(ActiveAiGenerationJobProbe.Available(0))

        val pending = record(JobStatus.PENDING).also(store::save)
        val running = record(JobStatus.RUNNING).also(store::save)
        record(JobStatus.SUCCEEDED).also(store::save)

        assertThat(queueProbe.probe(NOW)).isEqualTo(
            ActiveAiGenerationJobProbe.Unavailable(
                ActiveAiGenerationJobProbe.UnavailableReason.INDEX_NOT_READY,
            ),
        )
        assertThat(recovery.repairProcessingRecoveryIndex(NOW))
            .isEqualTo(AiGenerationIndexRepairResult.EPOCH_RESET)
        assertThat(queueProbe.probe(NOW)).isEqualTo(
            ActiveAiGenerationJobProbe.Unavailable(
                ActiveAiGenerationJobProbe.UnavailableReason.INDEX_NOT_READY,
            ),
        )
        assertThat(recovery.repairProcessingRecoveryIndex(NOW))
            .isEqualTo(AiGenerationIndexRepairResult.PASS_COMPLETED)

        assertThat(queueProbe.probe(NOW)).isEqualTo(ActiveAiGenerationJobProbe.Available(2))
        assertThat(score(PROCESSING_KEY, pending.jobId)).isNotNull()
        assertThat(score(PROCESSING_KEY, running.jobId)).isNotNull()
    }

    @Test
    fun `queue probe prunes expired quarantine and refuses live quarantine or over cap`() {
        assertThat(recovery.repairProcessingRecoveryIndex(NOW))
            .isEqualTo(AiGenerationIndexRepairResult.PASS_COMPLETED)
        val quarantined = UUID.randomUUID()
        redis.opsForZSet().add(QUARANTINE_KEY, quarantined.toString(), NOW.plusSeconds(1).toEpochMilli().toDouble())

        assertThat(queueProbe.probe(NOW)).isEqualTo(
            ActiveAiGenerationJobProbe.Unavailable(
                ActiveAiGenerationJobProbe.UnavailableReason.QUARANTINED,
            ),
        )
        assertThat(queueProbe.probe(NOW.plusSeconds(1))).isEqualTo(ActiveAiGenerationJobProbe.Available(0))
        val expiredQuarantineScore: Double? = redis.opsForZSet().score(QUARANTINE_KEY, quarantined.toString())
        assertThat(expiredQuarantineScore).isNull()

        repeat(properties.job.recoveryIndexRepairMaxMembers) {
            redis.opsForZSet().add(ACTIVE_KEY, UUID.randomUUID().toString(), it.toDouble())
        }
        assertThat(queueProbe.probe(NOW.plusSeconds(1))).isEqualTo(ActiveAiGenerationJobProbe.Available(0))
        redis.opsForZSet().add(
            ACTIVE_KEY,
            UUID.randomUUID().toString(),
            properties.job.recoveryIndexRepairMaxMembers.toDouble(),
        )
        assertThat(queueProbe.probe(NOW.plusSeconds(1))).isEqualTo(
            ActiveAiGenerationJobProbe.Unavailable(
                ActiveAiGenerationJobProbe.UnavailableReason.OVER_CAP,
            ),
        )
    }

    @Test
    fun `hash-only metadata survives missing payload and pending recovery refunds matching receipt once`() {
        val record = record(JobStatus.PENDING)
        assertThat(guard.checkBeforeCall(record.hostUserId, record.clubId, record.jobId)).isEqualTo(GuardDecision.Allow)
        store.save(record)
        redis.opsForZSet().add(QUARANTINE_KEY, record.jobId.toString(), NOW.plusSeconds(30).toEpochMilli().toDouble())
        redis.opsForZSet().add(COMMIT_RECOVERY_KEY, record.jobId.toString(), 1.0)
        redis.delete("${jobKey(record.jobId)}:transcript")
        redis.delete(admissionKey(record.clubId))

        val loaded = recovery.loadRecoveryMetadata(record.jobId)
        assertThat(loaded).isInstanceOf(AiGenerationRecoveryMetadataResult.Valid::class.java)
        val first = recovery.recover(command(record, AiGenerationAdmissionDisposition.RELEASE_PENDING))
        val repeated = recovery.recover(command(record, AiGenerationAdmissionDisposition.RELEASE_PENDING))

        assertThat(first).isEqualTo(AiGenerationAtomicRecoveryResult.Recovered)
        assertThat(repeated).isEqualTo(AiGenerationAtomicRecoveryResult.StateChanged)
        assertThat(hash(record.jobId, "status")).isEqualTo(JobStatus.FAILED.name)
        assertThat(value(dailyKey(record.hostUserId))).isEqualTo("0")
        assertThat(value(minuteKey(record.hostUserId))).isEqualTo("0")
        assertThat(redis.hasKey(receiptKey(record.jobId))).isFalse()
        assertRemovedFromActiveIndexes(record)
    }

    @Test
    fun `active recent and commit index reads never delete hashes with missing transient payload`() {
        val pending = record(JobStatus.PENDING)
        store.save(pending)
        redis.delete("${jobKey(pending.jobId)}:transcript")
        redis.delete("${jobKey(pending.jobId)}:turns")

        assertThat(store.loadActiveJobs(10).map(JobRecord::jobId)).contains(pending.jobId)
        assertThat(store.loadRecentForSession(pending.sessionId, 10).map(JobRecord::jobId)).contains(pending.jobId)
        assertThat(redis.hasKey(jobKey(pending.jobId))).isTrue()

        val committing = record(JobStatus.PENDING)
        store.save(committing)
        store.updateStatus(committing.jobId, JobStatus.COMMITTING, JobStage.READY, 100, null)
        redis.delete("${jobKey(committing.jobId)}:transcript")
        redis.delete("${jobKey(committing.jobId)}:turns")

        assertThat(store.loadCommitRecoveryJobs(10).map(JobRecord::jobId)).contains(committing.jobId)
        assertThat(redis.hasKey(jobKey(committing.jobId))).isTrue()
    }

    @Test
    fun `recreated counter token is never decremented and newer lease survives terminalization`() {
        val record = record(JobStatus.PENDING)
        guard.checkBeforeCall(record.hostUserId, record.clubId, record.jobId)
        store.save(record)
        redis.opsForValue().set(dailyKey(record.hostUserId), "7")
        redis.opsForValue().set(dailyTokenKey(record.hostUserId), UUID.randomUUID().toString())
        val newerAdmission = UUID.randomUUID().toString()
        redis.opsForValue().set(admissionKey(record.clubId), newerAdmission)

        val result = recovery.recover(command(record, AiGenerationAdmissionDisposition.RELEASE_PENDING))

        assertThat(result).isEqualTo(AiGenerationAtomicRecoveryResult.Recovered)
        assertThat(value(dailyKey(record.hostUserId))).isEqualTo("7")
        assertThat(value(minuteKey(record.hostUserId))).isEqualTo("0")
        assertThat(value(admissionKey(record.clubId))).isEqualTo(newerAdmission)
        assertThat(hash(record.jobId, "status")).isEqualTo(JobStatus.FAILED.name)
    }

    @Test
    fun `pending refund independently protects recreated minute window`() {
        val record = record(JobStatus.PENDING)
        guard.checkBeforeCall(record.hostUserId, record.clubId, record.jobId)
        store.save(record)
        redis.opsForValue().set(minuteKey(record.hostUserId), "9")
        redis.opsForValue().set(minuteTokenKey(record.hostUserId), UUID.randomUUID().toString())

        assertThat(recovery.recover(command(record, AiGenerationAdmissionDisposition.RELEASE_PENDING)))
            .isEqualTo(AiGenerationAtomicRecoveryResult.Recovered)
        assertThat(value(dailyKey(record.hostUserId))).isEqualTo("0")
        assertThat(value(minuteKey(record.hostUserId))).isEqualTo("9")
    }

    @Test
    fun `legacy pending without receipt terminalizes unaccounted without refund`() {
        val record = record(JobStatus.PENDING)
        store.save(record)
        redis.opsForValue().set(dailyKey(record.hostUserId), "3")

        val result = recovery.recover(command(record, AiGenerationAdmissionDisposition.RELEASE_PENDING))

        assertThat(result).isEqualTo(AiGenerationAtomicRecoveryResult.RecoveredUnaccounted)
        assertThat(value(dailyKey(record.hostUserId))).isEqualTo("3")
        assertThat(hash(record.jobId, "status")).isEqualTo(JobStatus.FAILED.name)
    }

    @Test
    fun `running recovery retains counters and strict-stale provider cost evidence`() {
        val record = record(JobStatus.RUNNING)
        guard.checkBeforeCall(record.hostUserId, record.clubId, record.jobId)
        store.save(record)
        val attemptId = UUID.randomUUID()
        assertThat(
            reservations.reserve(
                reservation(record, attemptId, NOW.minusSeconds(20)),
            ),
        ).isInstanceOf(ProviderCallReservationResult.Reserved::class.java)

        val result =
            recovery.recover(
                command(record, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)
                    .copy(providerStaleBefore = NOW.minusSeconds(10)),
            )

        assertThat(result).isInstanceOf(AiGenerationAtomicRecoveryResult.RecoveredWithAttempts::class.java)
        val attempts = (result as AiGenerationAtomicRecoveryResult.RecoveredWithAttempts).attempts
        assertThat(attempts.map { it.attemptId }).containsExactly(attemptId)
        assertThat(attempts.single().costBasis.name).isEqualTo("ESTIMATED_UNKNOWN")
        assertThat(value(dailyKey(record.hostUserId))).isEqualTo("1")
        assertThat(value(minuteKey(record.hostUserId))).isEqualTo("1")
        assertThat(hash(record.jobId, "llmCallCount")).isEqualTo("1")
    }

    @Test
    fun `live or malformed running attempt defers or quarantines without failing the job`() {
        val live = record(JobStatus.RUNNING)
        guard.checkBeforeCall(live.hostUserId, live.clubId, live.jobId)
        store.save(live)
        val liveAttempt = UUID.randomUUID()
        reservations.reserve(reservation(live, liveAttempt, NOW.minusSeconds(5)))

        assertThat(
            recovery.recover(
                command(live, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)
                    .copy(providerStaleBefore = NOW.minusSeconds(10)),
            ),
        ).isEqualTo(AiGenerationAtomicRecoveryResult.DeferredInFlight)
        assertThat(hash(live.jobId, "status")).isEqualTo(JobStatus.RUNNING.name)

        val corrupt = record(JobStatus.RUNNING)
        guard.checkBeforeCall(corrupt.hostUserId, corrupt.clubId, corrupt.jobId)
        store.save(corrupt)
        val corruptAttempt = UUID.randomUUID()
        reservations.reserve(reservation(corrupt, corruptAttempt, NOW.minusSeconds(20)))
        redis.opsForHash<String, String>().delete(
            providerAttemptsKey(corrupt.jobId),
            "$corruptAttempt:startedAtEpochMs",
        )

        assertThat(recovery.recover(command(corrupt, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)))
            .isEqualTo(AiGenerationAtomicRecoveryResult.Corrupt)
        assertThat(hash(corrupt.jobId, "status")).isEqualTo(JobStatus.RUNNING.name)
        assertThat(score(QUARANTINE_KEY, corrupt.jobId)).isNotNull()
        assertThat(score(PROCESSING_KEY, corrupt.jobId)).isNull()

        val malformedLedger = record(JobStatus.RUNNING)
        guard.checkBeforeCall(malformedLedger.hostUserId, malformedLedger.clubId, malformedLedger.jobId)
        store.save(malformedLedger)
        val malformedAttempt = UUID.randomUUID()
        reservations.reserve(reservation(malformedLedger, malformedAttempt, NOW.minusSeconds(20)))
        redis.opsForHash<String, String>().put(
            providerAttemptsKey(malformedLedger.jobId),
            "$malformedAttempt:provider",
            "UNSUPPORTED",
        )
        assertThat(recovery.recover(command(malformedLedger, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)))
            .isEqualTo(AiGenerationAtomicRecoveryResult.Corrupt)
        assertThat(hash(malformedLedger.jobId, "status")).isEqualTo(JobStatus.RUNNING.name)
    }

    @Test
    fun `provider ledger validates bounded exact serialization before mutating any stale attempt`() {
        val mixed = record(JobStatus.RUNNING)
        guard.checkBeforeCall(mixed.hostUserId, mixed.clubId, mixed.jobId)
        store.save(mixed)
        val staleAttempt = UUID.randomUUID()
        val corruptAttempt = UUID.randomUUID()
        reservations.reserve(reservation(mixed, staleAttempt, NOW.minusSeconds(30)))
        reservations.reserve(reservation(mixed, corruptAttempt, NOW.minusSeconds(20)))
        redis.opsForHash<String, String>().put(
            providerAttemptsKey(mixed.jobId),
            "$corruptAttempt:startedAt",
            "xxxxxxxxxxxxxxxxxxxx",
        )

        assertThat(recovery.recover(command(mixed, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)))
            .isEqualTo(AiGenerationAtomicRecoveryResult.Corrupt)
        assertThat(hashAttempt(mixed.jobId, staleAttempt, "state")).isEqualTo("IN_FLIGHT")
        assertThat(hashAttempt(mixed.jobId, corruptAttempt, "state")).isEqualTo("IN_FLIGHT")

        val oversized = record(JobStatus.RUNNING)
        guard.checkBeforeCall(oversized.hostUserId, oversized.clubId, oversized.jobId)
        store.save(oversized)
        val attempts = (1..3).map { UUID.randomUUID() }
        attempts.forEachIndexed { index, attemptId ->
            reservations.reserve(reservation(oversized, attemptId, NOW.minusSeconds(30L + index)))
        }
        redis.opsForHash<String, String>().put(
            providerAttemptsKey(oversized.jobId),
            "${UUID.randomUUID()}:state",
            "IN_FLIGHT",
        )

        assertThat(recovery.recover(command(oversized, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)))
            .isEqualTo(AiGenerationAtomicRecoveryResult.Corrupt)
        attempts.forEach { assertThat(hashAttempt(oversized.jobId, it, "state")).isEqualTo("IN_FLIGHT") }
    }

    @Test
    fun `provider ledger rejects decoder-invalid fields without backfill or partial mutation`() {
        listOf(
            "ordinal" to "-1",
            "reservedCostUsd" to "-0.01",
            "reservedCostUsd" to "0x10",
            "safeErrorCode" to "NOT_AN_ERROR_CODE",
        ).forEach { (field, invalidValue) ->
            val running = record(JobStatus.RUNNING)
            guard.checkBeforeCall(running.hostUserId, running.clubId, running.jobId)
            store.save(running)
            val attemptId = UUID.randomUUID()
            reservations.reserve(reservation(running, attemptId, NOW.minusSeconds(20)))
            redis.opsForHash<String, String>().delete(
                jobKey(running.jobId),
                "lastUpdatedAtEpochSecond",
                "lastUpdatedAtNano",
            )
            redis.opsForHash<String, String>().put(
                providerAttemptsKey(running.jobId),
                "$attemptId:$field",
                invalidValue,
            )

            assertThat(recovery.recover(command(running, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)))
                .isEqualTo(AiGenerationAtomicRecoveryResult.Corrupt)

            assertThat(hashAttempt(running.jobId, attemptId, "state")).isEqualTo("IN_FLIGHT")
            assertThat(hash(running.jobId, "lastUpdatedAtEpochSecond")).isNull()
            assertThat(hash(running.jobId, "lastUpdatedAtNano")).isNull()
            assertThat(hash(running.jobId, "status")).isEqualTo(JobStatus.RUNNING.name)
        }
    }

    @Test
    fun `provider timestamps use exact same millisecond cutoff and strict calendar parsing`() {
        listOf(
            Instant.parse("2024-02-29T00:00:00Z"),
            Instant.parse("2026-08-10T00:00:00.123Z"),
            Instant.parse("2026-08-10T00:00:00.123456Z"),
            Instant.parse("2026-08-10T00:00:00.123456789Z"),
        ).forEach { startedAt ->
            val running = record(JobStatus.RUNNING)
            guard.checkBeforeCall(running.hostUserId, running.clubId, running.jobId)
            store.save(running)
            val attemptId = UUID.randomUUID()
            reservations.reserve(reservation(running, attemptId, startedAt))

            val result =
                recovery.recover(
                    command(running, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)
                        .copy(providerStaleBefore = startedAt.plusNanos(1)),
                )
            assertThat(result).isInstanceOf(AiGenerationAtomicRecoveryResult.RecoveredWithAttempts::class.java)
        }

        listOf("2025-02-29T00:00:00Z", "2024-02-30T00:00:00Z", "2026-08-10T24:00:00Z").forEach { invalid ->
            val running = record(JobStatus.RUNNING)
            guard.checkBeforeCall(running.hostUserId, running.clubId, running.jobId)
            store.save(running)
            val attemptId = UUID.randomUUID()
            reservations.reserve(reservation(running, attemptId, NOW.minusSeconds(20)))
            redis.opsForHash<String, String>().put(providerAttemptsKey(running.jobId), "$attemptId:startedAt", invalid)

            assertThat(recovery.recover(command(running, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)))
                .isEqualTo(AiGenerationAtomicRecoveryResult.Corrupt)
            assertThat(hashAttempt(running.jobId, attemptId, "state")).isEqualTo("IN_FLIGHT")
        }
    }

    @Test
    fun `recovery identity CAS prevents wrong owner admission and index mutation`() {
        listOf("hostUserId", "clubId", "sessionId").forEach { identityField ->
            val running = record(JobStatus.RUNNING)
            guard.checkBeforeCall(running.hostUserId, running.clubId, running.jobId)
            store.save(running)
            val selected = command(running, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)
            redis.opsForHash<String, String>().put(jobKey(running.jobId), identityField, UUID.randomUUID().toString())
            val before = redis.opsForHash<String, String>().entries(jobKey(running.jobId))
            val receiptBefore = redis.opsForHash<String, String>().entries(receiptKey(running.jobId))
            val activeBefore = score(ACTIVE_KEY, running.jobId)
            val processingBefore = score(PROCESSING_KEY, running.jobId)

            assertThat(recovery.recover(selected)).isEqualTo(AiGenerationAtomicRecoveryResult.StateChanged)

            assertThat(redis.opsForHash<String, String>().entries(jobKey(running.jobId))).isEqualTo(before)
            assertThat(redis.opsForHash<String, String>().entries(receiptKey(running.jobId))).isEqualTo(receiptBefore)
            assertThat(score(ACTIVE_KEY, running.jobId)).isEqualTo(activeBefore)
            assertThat(score(PROCESSING_KEY, running.jobId)).isEqualTo(processingBefore)
        }
    }

    @Test
    fun `exact status timestamp and scheduled cutoff reject stale selection races`() {
        val statusChanged = record(JobStatus.RUNNING)
        store.save(statusChanged)
        redis.opsForHash<String, String>().put(jobKey(statusChanged.jobId), "status", JobStatus.PENDING.name)
        assertThat(recovery.recover(command(statusChanged, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)))
            .isEqualTo(AiGenerationAtomicRecoveryResult.StateChanged)
        assertThat(hash(statusChanged.jobId, "status")).isEqualTo(JobStatus.PENDING.name)

        val record = record(JobStatus.RUNNING)
        store.save(record)
        val original = command(record, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)
        val refreshed = record.lastUpdatedAt.plusNanos(1)
        redis.opsForHash<String, String>().put(jobKey(record.jobId), "lastUpdatedAt", refreshed.toString())
        redis.opsForHash<String, String>().put(
            jobKey(record.jobId),
            "lastUpdatedAtEpochSecond",
            refreshed.epochSecond.toString(),
        )
        redis.opsForHash<String, String>().put(jobKey(record.jobId), "lastUpdatedAtNano", refreshed.nano.toString())

        assertThat(recovery.recover(original)).isEqualTo(AiGenerationAtomicRecoveryResult.StateChanged)
        assertThat(hash(record.jobId, "status")).isEqualTo(JobStatus.RUNNING.name)

        val selected = record(JobStatus.RUNNING, lastUpdatedAt = NOW.minusSeconds(60).plusNanos(1))
        store.save(selected)
        assertThat(
            recovery.recover(
                command(selected, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)
                    .copy(scheduledCutoff = NOW.minusSeconds(60)),
            ),
        ).isEqualTo(AiGenerationAtomicRecoveryResult.NotStale)
        assertThat(hash(selected.jobId, "status")).isEqualTo(JobStatus.RUNNING.name)

        val equality = record(JobStatus.RUNNING, lastUpdatedAt = NOW.minusSeconds(60))
        store.save(equality)
        assertThat(
            recovery.recover(
                command(equality, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)
                    .copy(scheduledCutoff = NOW.minusSeconds(60)),
            ),
        ).isEqualTo(AiGenerationAtomicRecoveryResult.Recovered)
        assertThat(hash(equality.jobId, "status")).isEqualTo(JobStatus.FAILED.name)
    }

    inner class RepairLifecycle {
        @Test
        fun `atomic reclassification quarantines unknown status identity and exact tuple corruption`() {
            val corruptions =
                listOf<(JobRecord) -> Unit>(
                    { record -> redis.opsForHash<String, String>().put(jobKey(record.jobId), "status", "UNKNOWN") },
                    { record -> redis.opsForHash<String, String>().put(jobKey(record.jobId), "clubId", "not-a-club") },
                    { record ->
                        redis.opsForHash<String, String>().put(jobKey(record.jobId), "lastUpdatedAtNano", "7")
                    },
                )

            corruptions.forEach { corrupt ->
                val record = record(JobStatus.PENDING).also(store::save)
                corrupt(record)

                assertThat(recovery.reclassify(record.jobId, NOW))
                    .isEqualTo(AiGenerationRecoveryReclassification.CORRUPT)
                assertThat(score(PROCESSING_KEY, record.jobId)).isNull()
                assertThat(score(QUARANTINE_KEY, record.jobId)).isNotNull()
            }
        }

        @Test
        fun `current save and progress writers atomically maintain exact processing timestamp tuple`() {
            val record = record(JobStatus.PENDING)
            store.save(record)
            assertProcessingTuple(record.jobId, record.lastUpdatedAt)

            store.updateStatus(record.jobId, JobStatus.RUNNING, JobStage.GENERATING_RECORD, 25, null)

            val updated = Instant.parse(requireNotNull(hash(record.jobId, "lastUpdatedAt")))
            assertProcessingTuple(record.jobId, updated)
            assertThat(score(ACTIVE_KEY, record.jobId)).isNotNull()
            assertThat(redis.opsForValue().get(ACTIVE_EPOCH_KEY)).isNotBlank()
        }

        @Test
        fun `corrupt identity rejects generic progress before any hash or index mutation`() {
            val record = record(JobStatus.PENDING)
            store.save(record)
            redis.opsForHash<String, String>().delete(jobKey(record.jobId), "sessionId")
            val before = redis.opsForHash<String, String>().entries(jobKey(record.jobId))
            val processingScore = score(PROCESSING_KEY, record.jobId)

            assertThatThrownBy {
                store.updateStatus(record.jobId, JobStatus.RUNNING, JobStage.GENERATING_RECORD, 25, null)
            }

            assertThat(redis.opsForHash<String, String>().entries(jobKey(record.jobId))).isEqualTo(before)
            assertThat(score(PROCESSING_KEY, record.jobId)).isEqualTo(processingScore)
        }

        @Test
        fun `legacy repair is bounded persisted and isolates corrupt missing and valid members`() {
            val valid = record(JobStatus.PENDING)
            store.save(valid)
            redis.delete(PROCESSING_KEY)
            val corruptId = UUID.randomUUID()
            redis.opsForZSet().add(ACTIVE_KEY, corruptId.toString(), 1.0)
            redis.opsForHash<String, String>().put(jobKey(corruptId), "status", JobStatus.PENDING.name)
            val missingId = UUID.randomUUID()
            redis.opsForZSet().add(ACTIVE_KEY, missingId.toString(), 2.0)

            val first = recovery.repairProcessingRecoveryIndex(NOW)
            val second = recovery.repairProcessingRecoveryIndex(NOW)

            assertThat(first.name).isIn("PAGE_COMPLETED", "QUARANTINED", "PASS_COMPLETED", "EPOCH_RESET")
            assertThat(second.name).isIn("PAGE_COMPLETED", "QUARANTINED", "PASS_COMPLETED")
            assertThat(score(PROCESSING_KEY, valid.jobId)).isNotNull()
            assertThat(score(QUARANTINE_KEY, corruptId)).isNotNull()
            assertThat(score(PROCESSING_KEY, missingId)).isNull()
        }

        @Test
        fun `repair quarantines unknown status malformed identity and mismatched exact tuple`() {
            val unknown = record(JobStatus.PENDING).also(store::save)
            val malformedIdentity = record(JobStatus.PENDING).also(store::save)
            val mismatchedTuple = record(JobStatus.PENDING).also(store::save)
            redis.opsForHash<String, String>().put(jobKey(unknown.jobId), "status", "UNKNOWN")
            redis.opsForHash<String, String>().put(jobKey(malformedIdentity.jobId), "sessionId", "not-a-session")
            redis.opsForHash<String, String>().put(jobKey(mismatchedTuple.jobId), "lastUpdatedAtNano", "7")
            redis.delete(PROCESSING_KEY)

            recovery.repairProcessingRecoveryIndex(NOW)
            recovery.repairProcessingRecoveryIndex(NOW)

            listOf(unknown, malformedIdentity, mismatchedTuple).forEach { record ->
                assertThat(score(QUARANTINE_KEY, record.jobId)).isNotNull()
                assertThat(score(PROCESSING_KEY, record.jobId)).isNull()
            }
        }

        @Test
        fun `repair prunes malformed active member without starving the bounded worklist`() {
            val malformedMember = "not-a-job-id"
            val valid = record(JobStatus.PENDING).also(store::save)
            redis.opsForZSet().add(ACTIVE_KEY, malformedMember, 0.0)
            redis.delete(PROCESSING_KEY)

            recovery.repairProcessingRecoveryIndex(NOW)

            assertThat(redis.opsForZSet().range(ACTIVE_KEY, 0, -1).orEmpty()).doesNotContain(malformedMember)
            assertThat(redis.opsForZSet().range(QUARANTINE_KEY, 0, -1).orEmpty()).doesNotContain(malformedMember)
            assertThat(score(PROCESSING_KEY, valid.jobId)).isNotNull()
        }

        @Test
        fun `processing candidate load prunes an invalid oldest member instead of permanent starvation`() {
            val valid = record(JobStatus.PENDING).also(store::save)
            val malformedMember = "not-a-job-id"
            redis.opsForZSet().add(PROCESSING_KEY, malformedMember, 0.0)
            redis.opsForZSet().add(PROCESSING_KEY, valid.jobId.toString(), 1.0)

            assertThat(recovery.loadProcessingRecoveryJobs(NOW, 1)).isEmpty()
            assertThat(redis.opsForZSet().range(PROCESSING_KEY, 0, -1).orEmpty()).doesNotContain(malformedMember)
            assertThat(recovery.loadProcessingRecoveryJobs(NOW, 1).map(AiGenerationProcessingCandidate::jobId))
                .containsExactly(valid.jobId)
        }

        @Test
        fun `repair persists completion after last response loss and starts a fresh next pass`() {
            val records = (1..3).map { record(JobStatus.PENDING).also(store::save) }
            redis.delete(PROCESSING_KEY)

            assertThat(recovery.repairProcessingRecoveryIndex(NOW))
                .isEqualTo(AiGenerationIndexRepairResult.PAGE_COMPLETED)
            val firstState = redis.opsForHash<String, String>().entries(REPAIR_STATE_KEY)
            val firstPass = requireNotNull(firstState["passId"])
            assertThat(firstState["remainingCount"]).isEqualTo("1")
            assertThat(redis.opsForZSet().size(worklistKey(firstPass))).isEqualTo(1)

            recovery.repairProcessingRecoveryIndex(NOW) // Simulate loss of the final response after Redis committed it.
            val completed = redis.opsForHash<String, String>().entries(REPAIR_STATE_KEY)
            assertThat(completed["remainingCount"]).isEqualTo("0")
            assertThat(completed["passId"]).isNull()
            assertThat(completed["completedEpoch"]).isEqualTo(value(ACTIVE_EPOCH_KEY))
            assertThat(redis.hasKey(worklistKey(firstPass))).isFalse()
            records.forEach { assertThat(score(PROCESSING_KEY, it.jobId)).isNotNull() }

            assertThat(recovery.repairProcessingRecoveryIndex(NOW))
                .isEqualTo(AiGenerationIndexRepairResult.PAGE_COMPLETED)
            val nextPass = redis.opsForHash<String, String>().get(REPAIR_STATE_KEY, "passId")
            assertThat(nextPass).isNotBlank().isNotEqualTo(firstPass)
            assertThat(redis.opsForHash<String, String>().get(REPAIR_STATE_KEY, "completedEpoch"))
                .isEqualTo(value(ACTIVE_EPOCH_KEY))
        }

        @Test
        fun `missing mid-pass worklist resets only broken pass and snapshots again`() {
            (1..3).forEach { store.save(record(JobStatus.PENDING)) }
            redis.delete(PROCESSING_KEY)
            recovery.repairProcessingRecoveryIndex(NOW)
            val brokenPass = requireNotNull(redis.opsForHash<String, String>().get(REPAIR_STATE_KEY, "passId"))
            redis.delete(worklistKey(brokenPass))

            recovery.repairProcessingRecoveryIndex(NOW)

            val replacementPass = redis.opsForHash<String, String>().get(REPAIR_STATE_KEY, "passId")
            assertThat(replacementPass).isNotBlank().isNotEqualTo(brokenPass)
            assertThat(redis.opsForHash<String, String>().get(REPAIR_STATE_KEY, "remainingCount")).isEqualTo("1")
        }

        @Test
        fun `empty initial repair snapshot durably completes its epoch`() {
            assertThat(recovery.repairProcessingRecoveryIndex(NOW))
                .isEqualTo(AiGenerationIndexRepairResult.PASS_COMPLETED)

            val state = redis.opsForHash<String, String>().entries(REPAIR_STATE_KEY)
            assertThat(state["activeIndexEpoch"]).isNotBlank().isEqualTo(value(ACTIVE_EPOCH_KEY))
            assertThat(state["completedEpoch"]).isEqualTo(value(ACTIVE_EPOCH_KEY))
            assertThat(state["remainingCount"]).isEqualTo("0")
            assertThat(state["passId"]).isNull()
        }

        @Test
        fun `missing worklist with completed current epoch is recognized as a finished pass`() {
            assertThat(recovery.repairProcessingRecoveryIndex(NOW))
                .isEqualTo(AiGenerationIndexRepairResult.PASS_COMPLETED)
            val epoch = requireNotNull(value(ACTIVE_EPOCH_KEY))
            redis.opsForHash<String, String>().putAll(
                REPAIR_STATE_KEY,
                mapOf(
                    "activeIndexEpoch" to epoch,
                    "passId" to "lost-final-response",
                    "remainingCount" to "0",
                    "completedEpoch" to epoch,
                ),
            )
            redis.delete(worklistKey("lost-final-response"))

            assertThat(recovery.repairProcessingRecoveryIndex(NOW))
                .isEqualTo(AiGenerationIndexRepairResult.PASS_COMPLETED)
            assertThat(redis.opsForHash<String, String>().get(REPAIR_STATE_KEY, "passId")).isNull()
            assertThat(redis.opsForHash<String, String>().get(REPAIR_STATE_KEY, "completedEpoch")).isEqualTo(epoch)
        }

        @Test
        fun `active key recreation during persisted pass rotates epoch and prevents stale member re-add`() {
            (1..3).forEach { store.save(record(JobStatus.PENDING)) }
            redis.delete(PROCESSING_KEY)
            recovery.repairProcessingRecoveryIndex(NOW)
            val previousEpoch = value(ACTIVE_EPOCH_KEY)
            redis.delete(ACTIVE_KEY)

            assertThat(recovery.repairProcessingRecoveryIndex(NOW)).isEqualTo(AiGenerationIndexRepairResult.EPOCH_RESET)
            assertThat(value(ACTIVE_EPOCH_KEY)).isNotBlank().isNotEqualTo(previousEpoch)
            assertThat(redis.opsForZSet().size(ACTIVE_KEY)).isZero()
        }

        @Test
        fun `active writers rotate epoch after active key deletion and terminal retry`() {
            val first = record(JobStatus.PENDING)
            store.save(first)
            val initialEpoch = value(ACTIVE_EPOCH_KEY)
            redis.delete(ACTIVE_KEY)
            store.updateStatus(first.jobId, JobStatus.RUNNING, JobStage.GENERATING_RECORD, 30, null)
            val progressEpoch = value(ACTIVE_EPOCH_KEY)
            assertThat(progressEpoch).isNotBlank().isNotEqualTo(initialEpoch)

            assertThat(
                store.transitionStatus(first.jobId, setOf(JobStatus.RUNNING), JobStatus.FAILED, null, 100, null, null),
            ).isTrue()
            val terminalEpoch = value(ACTIVE_EPOCH_KEY)
            redis.delete(ACTIVE_KEY)
            assertThat(
                store.transitionStatus(
                    first.jobId,
                    setOf(JobStatus.FAILED),
                    JobStatus.PENDING,
                    JobStage.QUEUED,
                    0,
                    null,
                    null,
                ),
            ).isTrue()
            assertThat(value(ACTIVE_EPOCH_KEY)).isNotBlank().isNotEqualTo(terminalEpoch)

            val beforeSave = value(ACTIVE_EPOCH_KEY)
            redis.delete(ACTIVE_KEY)
            store.save(record(JobStatus.PENDING))
            assertThat(value(ACTIVE_EPOCH_KEY)).isNotBlank().isNotEqualTo(beforeSave)
        }

        @Test
        fun `repair re-reads concurrent terminal state and never stale re-adds processing member`() {
            val fillers = (1..2).map { record(JobStatus.PENDING).also(store::save) }
            val target = record(JobStatus.PENDING).also(store::save)
            fillers.forEachIndexed { index, record ->
                redis.opsForZSet().add(ACTIVE_KEY, record.jobId.toString(), index.toDouble())
            }
            redis.opsForZSet().add(ACTIVE_KEY, target.jobId.toString(), 3.0)
            redis.delete(PROCESSING_KEY)
            recovery.repairProcessingRecoveryIndex(NOW)

            store.updateStatus(target.jobId, JobStatus.FAILED, null, 100, null)
            recovery.repairProcessingRecoveryIndex(NOW)

            assertThat(hash(target.jobId, "status")).isEqualTo(JobStatus.FAILED.name)
            assertThat(score(ACTIVE_KEY, target.jobId)).isNull()
            assertThat(score(PROCESSING_KEY, target.jobId)).isNull()
        }

        @Test
        fun `repair re-reads concurrent progress and restores its exact current timestamp`() {
            val fillers = (1..2).map { record(JobStatus.PENDING).also(store::save) }
            val target = record(JobStatus.RUNNING).also(store::save)
            fillers.forEachIndexed { index, record ->
                redis.opsForZSet().add(ACTIVE_KEY, record.jobId.toString(), index.toDouble())
            }
            redis.opsForZSet().add(ACTIVE_KEY, target.jobId.toString(), 3.0)
            redis.delete(PROCESSING_KEY)
            recovery.repairProcessingRecoveryIndex(NOW)

            store.updateStatus(target.jobId, JobStatus.RUNNING, JobStage.GENERATING_RECORD, 60, null)
            val refreshed = Instant.parse(requireNotNull(hash(target.jobId, "lastUpdatedAt")))
            redis.opsForZSet().remove(PROCESSING_KEY, target.jobId.toString())
            recovery.repairProcessingRecoveryIndex(NOW)

            assertProcessingTuple(target.jobId, refreshed)
        }

        @Test
        fun `quarantine requires operator removal while current writer heals its own member`() {
            val corruptId = UUID.randomUUID()
            redis.opsForZSet().add(ACTIVE_KEY, corruptId.toString(), 1.0)
            redis.opsForValue().set(ACTIVE_EPOCH_KEY, UUID.randomUUID().toString(), properties.job.redisTtl)
            redis.opsForHash<String, String>().put(jobKey(corruptId), "status", JobStatus.PENDING.name)
            assertThat(recovery.repairProcessingRecoveryIndex(NOW)).isEqualTo(AiGenerationIndexRepairResult.QUARANTINED)
            assertThat(hash(corruptId, "recoveryQuarantineReason")).isEqualTo("CORRUPT_RECOVERY_METADATA")
            assertThat(hash(corruptId, "recoveryQuarantinedAt")).isEqualTo(NOW.toString())

            val repairedAt = NOW.minusSeconds(30)
            redis.opsForHash<String, String>().putAll(
                jobKey(corruptId),
                mapOf(
                    "status" to JobStatus.PENDING.name,
                    "clubId" to UUID.randomUUID().toString(),
                    "sessionId" to UUID.randomUUID().toString(),
                    "hostUserId" to UUID.randomUUID().toString(),
                    "lastUpdatedAt" to repairedAt.toString(),
                    "lastUpdatedAtEpochSecond" to repairedAt.epochSecond.toString(),
                    "lastUpdatedAtNano" to repairedAt.nano.toString(),
                ),
            )
            recovery.repairProcessingRecoveryIndex(NOW)
            assertThat(score(PROCESSING_KEY, corruptId)).isNull()
            redis.opsForZSet().remove(QUARANTINE_KEY, corruptId.toString())
            recovery.repairProcessingRecoveryIndex(NOW)
            assertThat(score(PROCESSING_KEY, corruptId)).isNotNull()
            assertThat(hash(corruptId, "recoveryQuarantineReason")).isNull()
            assertThat(hash(corruptId, "recoveryQuarantinedAt")).isNull()

            val current = record(JobStatus.PENDING).also(store::save)
            redis.opsForZSet().add(
                QUARANTINE_KEY,
                current.jobId.toString(),
                NOW.plus(properties.job.redisTtl).toEpochMilli().toDouble(),
            )
            redis.opsForHash<String, String>().putAll(
                jobKey(current.jobId),
                mapOf(
                    "recoveryQuarantineReason" to "CORRUPT_RECOVERY_METADATA",
                    "recoveryQuarantinedAt" to NOW.toString(),
                ),
            )
            store.updateStatus(current.jobId, JobStatus.PENDING, JobStage.QUEUED, 0, null)
            assertThat(score(QUARANTINE_KEY, current.jobId)).isNull()
            assertThat(hash(current.jobId, "recoveryQuarantineReason")).isNull()
        }

        @Test
        fun `expired quarantine is pruned and over-cap refuses worklist snapshot`() {
            redis.opsForZSet().add(QUARANTINE_KEY, UUID.randomUUID().toString(), NOW.toEpochMilli().toDouble())
            assertThat(recovery.repairProcessingRecoveryIndex(NOW))
                .isEqualTo(AiGenerationIndexRepairResult.PASS_COMPLETED)
            assertThat(redis.opsForZSet().size(QUARANTINE_KEY)).isZero()

            (1..4).forEach { store.save(record(JobStatus.PENDING)) }
            assertThat(recovery.repairProcessingRecoveryIndex(NOW)).isEqualTo(AiGenerationIndexRepairResult.OVER_CAP)
            assertThat(redis.keys("$PROCESSING_KEY:repair-worklist:*")).isEmpty()
            assertThat(redis.opsForHash<String, String>().get(REPAIR_STATE_KEY, "passId")).isNull()
        }

        @Test
        fun `all current Redis status writers carry exact tuple and processing index keys`() {
            val storeSource =
                Path.of("src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt").readText()
            val genericScripts =
                Path.of("src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisScripts.kt").readText()
            val groundedScripts =
                Path
                    .of("src/main/kotlin/com/readmates/aigen/adapter/out/redis/GroundedAiGenerationRedisScripts.kt")
                    .readText()

            assertThat(storeSource).doesNotContain("Instant.now()", "ops.put(hashKey, \"status\"")
            assertRedisWriterDiscovery(genericScripts, groundedScripts)
            assertRedisWriterInvariants(storeSource, genericScripts, groundedScripts)
        }
    }

    @TestFactory
    fun repairLifecycleContracts(): List<DynamicTest> {
        val cases = RepairLifecycle()
        return listOf(
            "exact reclassification" to
                { cases.`atomic reclassification quarantines unknown status identity and exact tuple corruption`() },
            "current exact writer tuple" to
                { cases.`current save and progress writers atomically maintain exact processing timestamp tuple`() },
            "generic writer no partial mutation" to
                { cases.`corrupt identity rejects generic progress before any hash or index mutation`() },
            "bounded mixed repair" to
                { cases.`legacy repair is bounded persisted and isolates corrupt missing and valid members`() },
            "corrupt repair validation" to
                { cases.`repair quarantines unknown status malformed identity and mismatched exact tuple`() },
            "malformed active member" to
                { cases.`repair prunes malformed active member without starving the bounded worklist`() },
            "processing ghost starvation" to
                { cases.`processing candidate load prunes an invalid oldest member instead of permanent starvation`() },
            "last response loss" to
                { cases.`repair persists completion after last response loss and starts a fresh next pass`() },
            "missing mid-pass worklist" to
                { cases.`missing mid-pass worklist resets only broken pass and snapshots again`() },
            "empty snapshot" to { cases.`empty initial repair snapshot durably completes its epoch`() },
            "completed missing worklist" to
                { cases.`missing worklist with completed current epoch is recognized as a finished pass`() },
            "active key epoch recreation" to
                {
                    cases.`active key recreation during persisted pass rotates epoch and prevents stale member re-add`()
                },
            "active writer epoch rotation" to
                { cases.`active writers rotate epoch after active key deletion and terminal retry`() },
            "terminal repair race" to
                { cases.`repair re-reads concurrent terminal state and never stale re-adds processing member`() },
            "progress repair race" to
                { cases.`repair re-reads concurrent progress and restores its exact current timestamp`() },
            "quarantine lifecycle" to
                { cases.`quarantine requires operator removal while current writer heals its own member`() },
            "quarantine expiry and over-cap" to
                { cases.`expired quarantine is pruned and over-cap refuses worklist snapshot`() },
            "writer inventory" to
                { cases.`all current Redis status writers carry exact tuple and processing index keys`() },
        ).map { (name, contract) ->
            dynamicTest(name) {
                clearRecoveryIndexes()
                contract()
            }
        }
    }

    @Test
    fun `metadata timestamps fail closed without synthesis and preserve corrupt evidence`() {
        listOf("createdAt", "expiresAt", "lastUpdatedAt").forEach { field ->
            val record = record(JobStatus.PENDING).also(store::save)
            redis.opsForHash<String, String>().delete(jobKey(record.jobId), field)

            assertThatThrownBy { store.loadMetadata(record.jobId) }
                .isInstanceOf(CorruptAiGenerationJobRecordException::class.java)
            assertThat(redis.hasKey(jobKey(record.jobId))).isTrue()
        }
        val malformedTuple = record(JobStatus.PENDING).also(store::save)
        redis.opsForHash<String, String>().put(jobKey(malformedTuple.jobId), "lastUpdatedAtEpochSecond", "invalid")
        redis.opsForHash<String, String>().put(jobKey(malformedTuple.jobId), "lastUpdatedAtNano", "invalid")

        assertThatThrownBy { store.loadMetadata(malformedTuple.jobId) }
            .isInstanceOf(CorruptAiGenerationJobRecordException::class.java)
        assertThat(recovery.loadRecoveryMetadata(malformedTuple.jobId))
            .isEqualTo(AiGenerationRecoveryMetadataResult.Corrupt)
    }

    @Test
    fun `deterministic client ordering preserves reserve recover and progress race invariants`() {
        val reservationFirst = record(JobStatus.RUNNING)
        guard.checkBeforeCall(reservationFirst.hostUserId, reservationFirst.clubId, reservationFirst.jobId)
        store.save(reservationFirst)
        val attemptId = UUID.randomUUID()
        val reservationThenRecovery =
            orderedClients(
                first = { reservations.reserve(reservation(reservationFirst, attemptId, NOW.minusSeconds(5))) },
                second = {
                    recovery.recover(
                        command(reservationFirst, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)
                            .copy(providerStaleBefore = NOW.minusSeconds(10)),
                    )
                },
            )
        assertThat(reservationThenRecovery.first).isInstanceOf(ProviderCallReservationResult.Reserved::class.java)
        assertThat(reservationThenRecovery.second).isEqualTo(AiGenerationAtomicRecoveryResult.DeferredInFlight)
        assertThat(hash(reservationFirst.jobId, "status")).isEqualTo(JobStatus.RUNNING.name)

        val recoveryFirst = record(JobStatus.RUNNING)
        guard.checkBeforeCall(recoveryFirst.hostUserId, recoveryFirst.clubId, recoveryFirst.jobId)
        store.save(recoveryFirst)
        val recoveryThenReservation =
            orderedClients(
                first = { recovery.recover(command(recoveryFirst, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)) },
                second = { reservations.reserve(reservation(recoveryFirst, UUID.randomUUID(), NOW)) },
            )
        assertThat(recoveryThenReservation.first).isEqualTo(AiGenerationAtomicRecoveryResult.Recovered)
        assertThat(recoveryThenReservation.second).isEqualTo(ProviderCallReservationResult.StateChanged)
        assertNoFailedInFlight(recoveryFirst.jobId)

        val progressFirst = record(JobStatus.RUNNING)
        store.save(progressFirst)
        val selected = command(progressFirst, AiGenerationAdmissionDisposition.COMPLETE_RUNNING)
        val progressThenRecovery =
            orderedClients(
                first = {
                    store.updateStatus(
                        progressFirst.jobId,
                        JobStatus.RUNNING,
                        JobStage.GENERATING_RECORD,
                        55,
                        null,
                    )
                },
                second = { recovery.recover(selected) },
            )
        assertThat(progressThenRecovery.second).isEqualTo(AiGenerationAtomicRecoveryResult.StateChanged)
        assertThat(hash(progressFirst.jobId, "status")).isEqualTo(JobStatus.RUNNING.name)
        assertNoFailedInFlight(progressFirst.jobId)
    }

    private fun record(
        status: JobStatus,
        lastUpdatedAt: Instant = NOW.minusSeconds(60),
    ): JobRecord = recoveryRecord(properties, status, lastUpdatedAt)

    private fun assertProcessingTuple(
        jobId: UUID,
        expected: Instant,
    ) {
        assertThat(hash(jobId, "lastUpdatedAtEpochSecond")).isEqualTo(expected.epochSecond.toString())
        assertThat(hash(jobId, "lastUpdatedAtNano")).isEqualTo(expected.nano.toString())
        assertThat(score(PROCESSING_KEY, jobId))
            .isEqualTo(expected.toEpochMilli().toDouble())
    }

    private fun assertRemovedFromActiveIndexes(record: JobRecord) {
        assertThat(score(ACTIVE_KEY, record.jobId)).isNull()
        assertThat(score(PROCESSING_KEY, record.jobId)).isNull()
        assertThat(score("aigen:club:${record.clubId}:jobs:active", record.jobId)).isNull()
        assertThat(score(QUARANTINE_KEY, record.jobId)).isNull()
        assertThat(score(COMMIT_RECOVERY_KEY, record.jobId)).isNull()
    }

    private fun value(key: String) = redis.opsForValue().get(key)

    private fun hash(
        jobId: UUID,
        field: String,
    ) = redis.opsForHash<String, String>().get(jobKey(jobId), field)

    private fun hashAttempt(
        jobId: UUID,
        attemptId: UUID,
        field: String,
    ) = redis.opsForHash<String, String>().get(providerAttemptsKey(jobId), "$attemptId:$field")

    private fun score(
        key: String,
        jobId: UUID,
    ): Double? = redis.opsForZSet().score(key, jobId.toString())

    private fun worklistKey(passId: String) = "$PROCESSING_KEY:repair-worklist:$passId"

    private fun assertNoFailedInFlight(jobId: UUID) {
        val failed = hash(jobId, "status") == JobStatus.FAILED.name
        val inFlight =
            redis
                .opsForHash<String, String>()
                .entries(providerAttemptsKey(jobId))
                .any { (field, value) -> field.endsWith(":state") && value == "IN_FLIGHT" }
        assertThat(failed && inFlight).isFalse()
    }
}

private fun sourceWriterWindow(
    storeSource: String,
    marker: String,
): String {
    val start = storeSource.indexOf(marker)
    assertThat(start).isNotNegative()
    return storeSource.substring(start, (start + 1_800).coerceAtMost(storeSource.length))
}

private fun sourceScriptBlock(
    source: String,
    name: String,
): String {
    val start = source.indexOf("    val $name:")
    assertThat(start).isNotNegative()
    val next = source.indexOf("\n    val ", start + 1).takeIf { it >= 0 } ?: source.length
    return source.substring(start, next)
}

private fun statusWriterNames(source: String): Set<String> {
    val markers = Regex("(?m)^    val (\\w+):").findAll(source).toList()
    return markers
        .mapIndexed { index, marker ->
            val end = markers.getOrNull(index + 1)?.range?.first ?: source.length
            marker.groupValues[1] to source.substring(marker.range.first, end)
        }.filter { (_, block) ->
            block.contains("'status'") || block.contains("'lastUpdatedAt'")
        }.mapTo(linkedSetOf()) { (name) -> name }
}

private fun assertIdentityBeforeFirstMutation(block: String) {
    val firstMutation =
        listOf("HSET", "HDEL", "SET", "DEL", "ZADD", "ZREM", "EXPIRE", "INCRBY")
            .map { command -> block.indexOf("redis.call('$command'") }
            .filter { it >= 0 }
            .min()
    assertThat(block.indexOf("corrupt job identity")).isNotNegative().isLessThan(firstMutation)
}

private fun assertRedisWriterDiscovery(
    genericScripts: String,
    groundedScripts: String,
) {
    assertThat(statusWriterNames(genericScripts)).containsExactlyInAnyOrder(
        "updateStatus",
        "recoverFailure",
        "reclassifyRecovery",
        "repairProcessingMember",
        "transitionStatus",
        "saveResultIfStatus",
    )
    assertThat(statusWriterNames(groundedScripts)).containsExactlyInAnyOrder(
        "saveResult",
        "acquireCommitLease",
        "recoverExpiredCommitLease",
        "releaseCommitLeaseForRetry",
        "markCommittedForCleanup",
        "markCleanupComplete",
    )
}

private fun assertRedisWriterInvariants(
    storeSource: String,
    genericScripts: String,
    groundedScripts: String,
) {
    mapOf(
        "AiGenerationRedisScripts.saveMetadata" to false,
        "AiGenerationRedisScripts.updateStatus" to true,
        "AiGenerationJobMutationRedisScripts.transitionStatus" to true,
        "AiGenerationJobMutationRedisScripts.saveResultIfStatus" to true,
        "AiGenerationRecoveryRedisScripts.recoverFailure" to false,
    ).forEach { (marker, requiresTupleArguments) ->
        val window = sourceWriterWindow(storeSource, marker)
        assertThat(window).contains("PROCESSING_RECOVERY_KEY")
        if (requiresTupleArguments) assertThat(window).contains("epochSecond.toString()", "nano.toString()")
    }
    listOf(
        "updateStatus",
        "recoverFailure",
        "reclassifyRecovery",
        "repairProcessingMember",
        "transitionStatus",
        "saveResultIfStatus",
    ).forEach { name ->
        val block = sourceScriptBlock(genericScripts, name)
        assertThat(block).contains("lastUpdatedAtEpochSecond", "lastUpdatedAtNano")
        assertThat(block).containsAnyOf("redis.call('ZADD'", "redis.call('ZREM'")
    }
    listOf("updateStatus", "transitionStatus", "saveResultIfStatus")
        .forEach { assertIdentityBeforeFirstMutation(sourceScriptBlock(genericScripts, it)) }
    listOf(
        "saveResult",
        "acquireCommitLease",
        "recoverExpiredCommitLease",
        "releaseCommitLeaseForRetry",
        "markCommittedForCleanup",
        "markCleanupComplete",
    ).forEach {
        assertThat(sourceWriterWindow(storeSource, "GroundedAiGenerationRedisScripts.$it"))
            .contains("PROCESSING_RECOVERY_KEY", "epochSecond.toString()", "nano.toString()")
        val block = sourceScriptBlock(groundedScripts, it)
        assertThat(block).contains("lastUpdatedAtEpochSecond", "lastUpdatedAtNano")
        assertIdentityBeforeFirstMutation(block)
    }
}

private fun command(
    record: JobRecord,
    disposition: AiGenerationAdmissionDisposition,
) = AiGenerationAtomicRecoveryCommand(
    jobId = record.jobId,
    hostUserId = record.hostUserId,
    clubId = record.clubId,
    sessionId = record.sessionId,
    expectedStatus = record.status,
    observedLastUpdatedAt = record.lastUpdatedAt,
    scheduledCutoff = null,
    providerStaleBefore = NOW.minusSeconds(10),
    error = GenerationError(ErrorCode.ASYNC_PROCESSING_EXHAUSTED, "fixed safe message"),
    now = NOW,
    admissionDisposition = disposition,
)

private fun reservation(
    record: JobRecord,
    attemptId: UUID,
    startedAt: Instant,
) = ProviderCallReservationCommand(
    attemptId = attemptId,
    jobId = record.jobId,
    clubId = record.clubId,
    admissionId = record.jobId,
    expectedStatus = JobStatus.RUNNING,
    model = record.model,
    mode = ProviderCallMode.PRIMARY,
    maximumCostUsd = BigDecimal("0.25"),
    maxCalls = 3,
    now = startedAt,
)

private fun recoveryRecord(
    properties: AiGenerationProperties,
    status: JobStatus,
    lastUpdatedAt: Instant,
): JobRecord {
    val sessionId = UUID.randomUUID()
    val clubId = UUID.randomUUID()
    return JobRecord(
        jobId = UUID.randomUUID(),
        sessionId = sessionId,
        clubId = clubId,
        hostUserId = UUID.randomUUID(),
        model = MODEL,
        authorNameMode = AuthorNameMode.REAL,
        instructions = null,
        transcript = "public-safe fixture transcript",
        sessionMeta =
            SessionMeta(
                sessionId,
                clubId,
                1,
                "Public Test Book",
                null,
                LocalDate.of(2026, 8, 10),
                listOf("Alice"),
                AuthorNameMode.REAL,
            ),
        status = status,
        stage = if (status == JobStatus.PENDING) JobStage.QUEUED else JobStage.GENERATING_RECORD,
        progressPct = 0,
        result = null,
        error = null,
        tokens = TokenUsage.ZERO,
        costAccumulatedUsd = BigDecimal.ZERO,
        expiresAt = NOW.plus(properties.job.redisTtl),
        createdAt = NOW.minusSeconds(120),
        lastUpdatedAt = lastUpdatedAt,
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

private fun <F, S> orderedClients(
    first: () -> F,
    second: () -> S,
): Pair<F, S> {
    val firstCommitted = CountDownLatch(1)
    val executor = Executors.newFixedThreadPool(2)
    return try {
        val firstFuture =
            executor.submit<F> {
                try {
                    first()
                } finally {
                    firstCommitted.countDown()
                }
            }
        val secondFuture =
            executor.submit<S> {
                check(firstCommitted.await(10, TimeUnit.SECONDS)) { "first Redis client did not reach its barrier" }
                second()
            }
        firstFuture.get(10, TimeUnit.SECONDS) to secondFuture.get(10, TimeUnit.SECONDS)
    } finally {
        executor.shutdownNow()
    }
}

private fun jobKey(jobId: UUID) = "aigen:job:$jobId"

private fun receiptKey(jobId: UUID) = "aigen:job:$jobId:admission-receipt"

private fun dailyKey(hostId: UUID) = "aigen:host:$hostId:daily"

private fun dailyTokenKey(hostId: UUID) = "aigen:host:$hostId:daily:window-token"

private fun minuteKey(hostId: UUID) = "aigen:host:$hostId:minute"

private fun minuteTokenKey(hostId: UUID) = "aigen:host:$hostId:minute:window-token"

private fun admissionKey(clubId: UUID) = "aigen:club:$clubId:provider_admission"

private val NOW: Instant = Instant.parse("2026-08-10T10:00:00.123456789Z")
private val MODEL = ModelId(Provider.OPENAI, "gpt-test-allowlisted")
private const val ACTIVE_KEY = "aigen:jobs:active"
private const val ACTIVE_EPOCH_KEY = "aigen:jobs:active:epoch"
private const val PROCESSING_KEY = "aigen:jobs:processing-recovery"
private const val QUARANTINE_KEY = "aigen:jobs:processing-recovery:quarantine"
private const val REPAIR_STATE_KEY = "aigen:jobs:processing-recovery:repair-state"
private const val COMMIT_RECOVERY_KEY = "aigen:jobs:commit-recovery"
