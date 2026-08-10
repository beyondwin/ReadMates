package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AiGenerationRecoveryResult
import com.readmates.aigen.application.model.AiGenerationRecoverySource
import com.readmates.aigen.application.model.CostBasis
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderAttempt
import com.readmates.aigen.application.model.ProviderAttemptState
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.port.out.AiGenerationAdmissionDisposition
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryCommand
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryResult
import com.readmates.aigen.application.port.out.AiGenerationFailureRecoveryPort
import com.readmates.aigen.application.port.out.AiGenerationIndexRepairResult
import com.readmates.aigen.application.port.out.AiGenerationProcessingCandidate
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadata
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadataResult
import com.readmates.aigen.application.port.out.AiGenerationRecoveryReclassification
import com.readmates.aigen.config.AiGenerationProperties
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class AiGenerationFailureRecoveryServiceTest {
    private val now = Instant.parse("2026-08-10T10:00:00.123456789Z")
    private val properties = AiGenerationProperties()
    private val port = FakeFailureRecoveryPort()
    private val registry = SimpleMeterRegistry()
    private val service =
        AiGenerationFailureRecoveryService(
            recoveryPort = port,
            metrics = AiGenerationMetrics(registry),
            properties = properties,
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )

    @Test
    fun `pending recovery selects release admission and records the final source result`() {
        val metadata = metadata(JobStatus.PENDING)
        port.metadata[metadata.jobId] = AiGenerationRecoveryMetadataResult.Valid(metadata)
        port.atomicResult = AiGenerationAtomicRecoveryResult.Recovered

        val result = service.recoverExhausted(metadata.jobId, AiGenerationRecoverySource.KAFKA)

        assertThat(result).isEqualTo(AiGenerationRecoveryResult.RECOVERED_PENDING)
        assertThat(port.commands.single().admissionDisposition)
            .isEqualTo(AiGenerationAdmissionDisposition.RELEASE_PENDING)
        assertThat(
            port.commands
                .single()
                .error.code,
        ).isEqualTo(ErrorCode.ASYNC_PROCESSING_EXHAUSTED)
        assertThat(
            port.commands
                .single()
                .error.message,
        ).isEqualTo("AI generation processing exhausted its bounded recovery budget.")
        assertRecoveryMetric("kafka", "recovered_pending")
    }

    @Test
    fun `legacy pending recovery exposes unaccounted without guessing a refund`() {
        val metadata = metadata(JobStatus.PENDING)
        port.metadata[metadata.jobId] = AiGenerationRecoveryMetadataResult.Valid(metadata)
        port.atomicResult = AiGenerationAtomicRecoveryResult.RecoveredUnaccounted

        assertThat(service.recoverExhausted(metadata.jobId, AiGenerationRecoverySource.SCHEDULED))
            .isEqualTo(AiGenerationRecoveryResult.RECOVERED_PENDING_UNACCOUNTED)
        assertRecoveryMetric("scheduled", "recovered_pending_unaccounted")
    }

    @Test
    fun `running recovery passes strict provider cutoff in the same atomic command`() {
        val metadata = metadata(JobStatus.RUNNING)
        port.metadata[metadata.jobId] = AiGenerationRecoveryMetadataResult.Valid(metadata)
        port.atomicResult = AiGenerationAtomicRecoveryResult.Recovered

        val result = service.recoverExhausted(metadata.jobId, AiGenerationRecoverySource.KAFKA)

        assertThat(result).isEqualTo(AiGenerationRecoveryResult.RECOVERED_RUNNING)
        val command = port.commands.single()
        assertThat(command.admissionDisposition).isEqualTo(AiGenerationAdmissionDisposition.COMPLETE_RUNNING)
        assertThat(command.providerStaleBefore).isEqualTo(now.minus(properties.providerCalls.requestTimeout))
        assertThat(command.scheduledCutoff).isNull()
    }

    @Test
    fun `live running provider attempt remains a typed deferred application result`() {
        val metadata = metadata(JobStatus.RUNNING)
        port.metadata[metadata.jobId] = AiGenerationRecoveryMetadataResult.Valid(metadata)
        port.atomicResult = AiGenerationAtomicRecoveryResult.DeferredInFlight

        assertThat(service.recoverExhausted(metadata.jobId, AiGenerationRecoverySource.KAFKA))
            .isEqualTo(AiGenerationRecoveryResult.DEFERRED_IN_FLIGHT)
        assertRecoveryMetric("kafka", "deferred_in_flight")
    }

    @Test
    fun `missing payload is irrelevant because recovery loads hash metadata only`() {
        val metadata = metadata(JobStatus.PENDING)
        port.metadata[metadata.jobId] = AiGenerationRecoveryMetadataResult.Valid(metadata)
        port.atomicResult = AiGenerationAtomicRecoveryResult.Recovered

        assertThat(service.recoverExhausted(metadata.jobId, AiGenerationRecoverySource.KAFKA))
            .isEqualTo(AiGenerationRecoveryResult.RECOVERED_PENDING)
        assertThat(port.loaded).containsExactly(metadata.jobId)
    }

    @Test
    fun `terminal missing and corrupt rows return bounded durable classifications`() {
        val terminal = metadata(JobStatus.SUCCEEDED)
        val missingId = UUID.randomUUID()
        val corruptId = UUID.randomUUID()
        port.metadata[terminal.jobId] = AiGenerationRecoveryMetadataResult.Valid(terminal)
        port.metadata[missingId] = AiGenerationRecoveryMetadataResult.Missing
        port.metadata[corruptId] = AiGenerationRecoveryMetadataResult.Corrupt

        assertThat(service.recoverExhausted(terminal.jobId, AiGenerationRecoverySource.KAFKA))
            .isEqualTo(AiGenerationRecoveryResult.ALREADY_TERMINAL)
        assertThat(service.recoverExhausted(missingId, AiGenerationRecoverySource.KAFKA))
            .isEqualTo(AiGenerationRecoveryResult.MISSING)
        assertThat(service.recoverExhausted(corruptId, AiGenerationRecoverySource.KAFKA))
            .isEqualTo(AiGenerationRecoveryResult.CORRUPT)
        assertThat(port.quarantined).containsExactly(corruptId)
        assertThat(port.commands).isEmpty()
    }

    @Test
    fun `state changed is atomically reclassified without stale metadata writes`() {
        val metadata = metadata(JobStatus.PENDING)
        port.metadata[metadata.jobId] = AiGenerationRecoveryMetadataResult.Valid(metadata)
        port.atomicResult = AiGenerationAtomicRecoveryResult.StateChanged
        port.reclassification = AiGenerationRecoveryReclassification.ACTIVE

        assertThat(service.recoverExhausted(metadata.jobId, AiGenerationRecoverySource.KAFKA))
            .isEqualTo(AiGenerationRecoveryResult.DEFERRED_STATE_CHANGED)
        assertThat(port.reclassified).containsExactly(metadata.jobId)
    }

    @Test
    fun `scheduled exact-cutoff rejection maps to not stale and carries the same cutoff tuple`() {
        val metadata = metadata(JobStatus.RUNNING)
        val cutoff = now.minus(properties.job.processingDeadline)
        port.repairResult = AiGenerationIndexRepairResult.PAGE_COMPLETED
        port.candidates += AiGenerationProcessingCandidate(metadata)
        port.atomicResult = AiGenerationAtomicRecoveryResult.NotStale

        assertThat(service.recoverStalledBatch()).containsExactly(AiGenerationRecoveryResult.DEFERRED_NOT_STALE)
        assertThat(port.loadedCutoff).isEqualTo(cutoff)
        assertThat(port.commands.single().scheduledCutoff).isEqualTo(cutoff)
    }

    @Test
    fun `scheduled batch isolates corrupt and persistence-failing rows`() {
        val corrupt = metadata(JobStatus.PENDING)
        val failed = metadata(JobStatus.PENDING)
        val recovered = metadata(JobStatus.PENDING)
        port.repairResult = AiGenerationIndexRepairResult.QUARANTINED
        port.candidates +=
            listOf(
                AiGenerationProcessingCandidate(corrupt, corrupt = true),
                AiGenerationProcessingCandidate(failed),
                AiGenerationProcessingCandidate(recovered),
            )
        port.atomicResults[failed.jobId] = IllegalStateException("redis unavailable")
        port.atomicResults[recovered.jobId] = AiGenerationAtomicRecoveryResult.Recovered

        val results = service.recoverStalledBatch()

        assertThat(results).containsExactly(
            AiGenerationRecoveryResult.CORRUPT,
            AiGenerationRecoveryResult.FAILED,
            AiGenerationRecoveryResult.RECOVERED_PENDING,
        )
        assertThat(port.commands.map { it.jobId }).containsExactly(failed.jobId, recovered.jobId)
        assertRepairMetric("quarantined")
    }

    @Test
    fun `repair persistence failure records failed and propagates the wave failure`() {
        port.repairFailure = IllegalStateException("redis unavailable")

        assertThatThrownBy(service::recoverStalledBatch).isSameAs(port.repairFailure)
        assertRepairMetric("failed")
    }

    @Test
    fun `scheduled missing and terminal ghosts are atomically reclassified out of processing`() {
        val missing = metadata(JobStatus.PENDING)
        val terminal = metadata(JobStatus.FAILED)
        port.candidates +=
            listOf(
                AiGenerationProcessingCandidate(jobId = missing.jobId, missing = true),
                AiGenerationProcessingCandidate(terminal),
            )
        port.reclassifications[missing.jobId] = AiGenerationRecoveryReclassification.MISSING
        port.reclassifications[terminal.jobId] = AiGenerationRecoveryReclassification.TERMINAL

        assertThat(service.recoverStalledBatch()).containsExactly(
            AiGenerationRecoveryResult.MISSING,
            AiGenerationRecoveryResult.ALREADY_TERMINAL,
        )
        assertThat(port.reclassified).containsExactly(missing.jobId, terminal.jobId)
    }

    @Test
    fun `reconciled unknown provider evidence records cost once in the observed execution`() {
        val metadata = metadata(JobStatus.RUNNING)
        port.metadata[metadata.jobId] = AiGenerationRecoveryMetadataResult.Valid(metadata)
        port.atomicResult = AiGenerationAtomicRecoveryResult.Recovered
        port.reconciled = listOf(providerAttempt(metadata.jobId))

        service.recoverExhausted(metadata.jobId, AiGenerationRecoverySource.KAFKA)
        port.reconciled = emptyList()
        service.recoverExhausted(metadata.jobId, AiGenerationRecoverySource.KAFKA)

        assertThat(
            registry
                .find("readmates.aigen.provider.cost.usd")
                .tag("provider", "OPENAI")
                .tag("basis", "ESTIMATED_UNKNOWN")
                .counter()
                ?.count(),
        ).isEqualTo(0.25)
    }

    @Test
    fun `persistence failure records failed and propagates to Kafka caller`() {
        val metadata = metadata(JobStatus.PENDING)
        port.metadata[metadata.jobId] = AiGenerationRecoveryMetadataResult.Valid(metadata)
        port.atomicResults[metadata.jobId] = IllegalStateException("redis unavailable")

        assertThatThrownBy {
            service.recoverExhausted(metadata.jobId, AiGenerationRecoverySource.KAFKA)
        }.isInstanceOf(IllegalStateException::class.java)
        assertRecoveryMetric("kafka", "failed")
    }

    @Test
    fun `one invocation uses one clock instant for timestamps and both cutoffs`() {
        val ticking = CountingClock(now)
        val localPort = FakeFailureRecoveryPort()
        val metadata = metadata(JobStatus.RUNNING)
        localPort.metadata[metadata.jobId] = AiGenerationRecoveryMetadataResult.Valid(metadata)
        localPort.atomicResult = AiGenerationAtomicRecoveryResult.Recovered
        val localService = AiGenerationFailureRecoveryService(localPort, fakeMetrics(), properties, ticking)

        localService.recoverExhausted(metadata.jobId, AiGenerationRecoverySource.KAFKA)

        assertThat(ticking.reads).isEqualTo(1)
        assertThat(localPort.commands.single().now).isEqualTo(now)
    }

    @Test
    fun `unroutable record is owned by the application metric boundary`() {
        service.recordUnroutableKafkaRecord()

        assertRecoveryMetric("kafka", "unroutable_record")
    }

    private fun metadata(status: JobStatus): AiGenerationRecoveryMetadata {
        val timestamp = Instant.parse("2026-08-10T09:00:00.000000001Z")
        return AiGenerationRecoveryMetadata(
            jobId = UUID.randomUUID(),
            hostUserId = UUID.randomUUID(),
            clubId = UUID.randomUUID(),
            sessionId = UUID.randomUUID(),
            status = status,
            lastUpdatedAt = timestamp,
        )
    }

    private fun providerAttempt(jobId: UUID) =
        ProviderAttempt(
            attemptId = UUID.randomUUID(),
            ordinal = 1,
            jobId = jobId,
            provider = Provider.OPENAI,
            model = ModelId(Provider.OPENAI, "gpt-test-allowlisted"),
            mode = ProviderCallMode.PRIMARY,
            state = ProviderAttemptState.UNKNOWN,
            reservedCostUsd = BigDecimal("0.25"),
            costBasis = CostBasis.ESTIMATED_UNKNOWN,
            safeErrorCode = null,
            startedAt = now.minusSeconds(600),
            completedAt = now,
        )

    private fun assertRecoveryMetric(
        source: String,
        result: String,
    ) {
        assertThat(
            registry
                .find("readmates.aigen.failure.recovery")
                .tag("source", source)
                .tag("result", result)
                .counter()
                ?.count(),
        ).isEqualTo(1.0)
    }

    private fun assertRepairMetric(result: String) {
        assertThat(
            registry
                .find("readmates.aigen.recovery.index.repair")
                .tag("result", result)
                .counter()
                ?.count(),
        ).isEqualTo(1.0)
    }
}

private class FakeFailureRecoveryPort : AiGenerationFailureRecoveryPort {
    val metadata = mutableMapOf<UUID, AiGenerationRecoveryMetadataResult>()
    val loaded = mutableListOf<UUID>()
    val commands = mutableListOf<AiGenerationAtomicRecoveryCommand>()
    val atomicResults = mutableMapOf<UUID, Any>()
    var atomicResult: AiGenerationAtomicRecoveryResult = AiGenerationAtomicRecoveryResult.Recovered
    var reconciled: List<ProviderAttempt> = emptyList()
    var reclassification: AiGenerationRecoveryReclassification = AiGenerationRecoveryReclassification.ACTIVE
    val reclassifications = mutableMapOf<UUID, AiGenerationRecoveryReclassification>()
    val reclassified = mutableListOf<UUID>()
    val quarantined = mutableListOf<UUID>()
    var repairResult: AiGenerationIndexRepairResult = AiGenerationIndexRepairResult.PAGE_COMPLETED
    var repairFailure: RuntimeException? = null
    val candidates = mutableListOf<AiGenerationProcessingCandidate>()
    var loadedCutoff: Instant? = null

    override fun loadRecoveryMetadata(jobId: UUID): AiGenerationRecoveryMetadataResult {
        loaded += jobId
        return metadata[jobId] ?: AiGenerationRecoveryMetadataResult.Missing
    }

    override fun recover(command: AiGenerationAtomicRecoveryCommand): AiGenerationAtomicRecoveryResult {
        commands += command
        val configured = atomicResults[command.jobId]
        if (configured is RuntimeException) throw configured
        val result = configured as? AiGenerationAtomicRecoveryResult ?: atomicResult
        return if (result == AiGenerationAtomicRecoveryResult.Recovered && reconciled.isNotEmpty()) {
            AiGenerationAtomicRecoveryResult.RecoveredWithAttempts(reconciled)
        } else {
            result
        }
    }

    override fun reclassify(
        jobId: UUID,
        now: Instant,
    ): AiGenerationRecoveryReclassification {
        reclassified += jobId
        return reclassifications[jobId] ?: reclassification
    }

    override fun quarantineCorrupt(
        jobId: UUID,
        now: Instant,
    ) {
        quarantined += jobId
    }

    override fun repairProcessingRecoveryIndex(now: Instant): AiGenerationIndexRepairResult {
        repairFailure?.let { throw it }
        return repairResult
    }

    override fun loadProcessingRecoveryJobs(
        staleBefore: Instant,
        limit: Int,
    ): List<AiGenerationProcessingCandidate> {
        loadedCutoff = staleBefore
        return candidates.take(limit)
    }
}

private class CountingClock(
    private val value: Instant,
) : Clock() {
    var reads = 0

    override fun getZone() = ZoneOffset.UTC

    override fun withZone(zone: java.time.ZoneId): Clock = this

    override fun instant(): Instant {
        reads += 1
        return value
    }
}
