package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AiGenerationRecoveryResult
import com.readmates.aigen.application.model.AiGenerationRecoverySource
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.RecordUnroutableAiGenerationRecordUseCase
import com.readmates.aigen.application.port.`in`.RecoverExhaustedAiGenerationJobUseCase
import com.readmates.aigen.application.port.`in`.RecoverStalledAiGenerationJobsUseCase
import com.readmates.aigen.application.port.out.AiGenerationAdmissionDisposition
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryCommand
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryResult
import com.readmates.aigen.application.port.out.AiGenerationFailureRecoveryPort
import com.readmates.aigen.application.port.out.AiGenerationProcessingCandidate
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadata
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadataResult
import com.readmates.aigen.application.port.out.AiGenerationRecoveryReclassification
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant
import java.util.UUID

private data class RecoveryInvocation(
    val jobId: UUID,
    val source: AiGenerationRecoverySource,
    val now: Instant,
    val scheduledCutoff: Instant? = null,
    val candidate: AiGenerationProcessingCandidate? = null,
    val propagate: Boolean = false,
)

@Service
@ConditionalOnBean(AiGenerationFailureRecoveryPort::class)
class AiGenerationFailureRecoveryService(
    private val recoveryPort: AiGenerationFailureRecoveryPort,
    private val metrics: AiGenerationMetrics,
    private val properties: AiGenerationProperties,
    private val clock: Clock,
) : RecoverExhaustedAiGenerationJobUseCase,
    RecoverStalledAiGenerationJobsUseCase,
    RecordUnroutableAiGenerationRecordUseCase {
    override fun recoverExhausted(
        jobId: UUID,
        source: AiGenerationRecoverySource,
    ): AiGenerationRecoveryResult {
        val now = clock.instant()
        return recoverAndRecord(RecoveryInvocation(jobId, source, now, propagate = true))
    }

    override fun recoverStalledBatch(): List<AiGenerationRecoveryResult> {
        val now = clock.instant()
        val cutoff = now.minus(properties.job.processingDeadline)
        val repairResult =
            runCatching { recoveryPort.repairProcessingRecoveryIndex(now) }.getOrElse {
                metrics.recordRecoveryIndexRepair(AiGenerationIndexRepairResultTag.FAILED)
                throw it
            }
        metrics.recordRecoveryIndexRepair(AiGenerationIndexRepairResultTag.valueOf(repairResult.name))
        return recoveryPort
            .loadProcessingRecoveryJobs(cutoff, properties.job.recoveryBatchSize)
            .map { candidate ->
                recoverAndRecord(
                    RecoveryInvocation(
                        candidate.jobId,
                        AiGenerationRecoverySource.SCHEDULED,
                        now,
                        scheduledCutoff = cutoff,
                        candidate = candidate,
                    ),
                )
            }
    }

    override fun recordUnroutableKafkaRecord() {
        metrics.recordFailureRecovery(
            AiGenerationRecoverySource.KAFKA,
            AiGenerationRecoveryResult.UNROUTABLE_RECORD,
        )
    }

    private fun recoverAndRecord(invocation: RecoveryInvocation): AiGenerationRecoveryResult =
        runCatching { recover(invocation) }
            .fold(
                onSuccess = { result ->
                    metrics.recordFailureRecovery(invocation.source, result)
                    result
                },
                onFailure = { failure ->
                    metrics.recordFailureRecovery(invocation.source, AiGenerationRecoveryResult.FAILED)
                    if (invocation.propagate) throw failure
                    AiGenerationRecoveryResult.FAILED
                },
            )

    private fun recover(invocation: RecoveryInvocation): AiGenerationRecoveryResult =
        when {
            invocation.candidate?.corrupt == true -> quarantine(invocation.jobId, invocation.now)
            invocation.candidate?.missing == true -> reclassify(invocation.jobId, invocation.now)
            invocation.candidate != null && invocation.candidate.metadata?.status !in PROCESSING_STATUSES ->
                reclassify(invocation.jobId, invocation.now)
            invocation.candidate != null ->
                recoverValid(
                    requireNotNull(invocation.candidate.metadata),
                    invocation.now,
                    invocation.scheduledCutoff,
                )
            else ->
                when (val loaded = recoveryPort.loadRecoveryMetadata(invocation.jobId)) {
                    is AiGenerationRecoveryMetadataResult.Valid ->
                        recoverValid(loaded.metadata, invocation.now, invocation.scheduledCutoff)
                    AiGenerationRecoveryMetadataResult.Missing -> AiGenerationRecoveryResult.MISSING
                    AiGenerationRecoveryMetadataResult.Corrupt -> quarantine(invocation.jobId, invocation.now)
                }
        }

    private fun quarantine(
        jobId: UUID,
        now: Instant,
    ): AiGenerationRecoveryResult {
        recoveryPort.quarantineCorrupt(jobId, now)
        return AiGenerationRecoveryResult.CORRUPT
    }

    private fun recoverValid(
        metadata: AiGenerationRecoveryMetadata,
        now: Instant,
        scheduledCutoff: Instant?,
    ): AiGenerationRecoveryResult {
        if (metadata.status !in PROCESSING_STATUSES) return AiGenerationRecoveryResult.ALREADY_TERMINAL
        val result =
            recoveryPort.recover(
                AiGenerationAtomicRecoveryCommand(
                    jobId = metadata.jobId,
                    hostUserId = metadata.hostUserId,
                    clubId = metadata.clubId,
                    sessionId = metadata.sessionId,
                    expectedStatus = metadata.status,
                    observedLastUpdatedAt = metadata.lastUpdatedAt,
                    scheduledCutoff = scheduledCutoff,
                    providerStaleBefore = now.minus(properties.providerCalls.requestTimeout),
                    error = EXHAUSTED_ERROR,
                    now = now,
                    admissionDisposition =
                        if (metadata.status == JobStatus.PENDING) {
                            AiGenerationAdmissionDisposition.RELEASE_PENDING
                        } else {
                            AiGenerationAdmissionDisposition.COMPLETE_RUNNING
                        },
                ),
            )
        return when (result) {
            AiGenerationAtomicRecoveryResult.Recovered -> recoveredResult(metadata.status)
            AiGenerationAtomicRecoveryResult.RecoveredUnaccounted ->
                AiGenerationRecoveryResult.RECOVERED_PENDING_UNACCOUNTED
            is AiGenerationAtomicRecoveryResult.RecoveredWithAttempts -> {
                result.attempts.forEach { attempt ->
                    metrics.recordProviderCost(attempt.provider, attempt.costBasis, attempt.reservedCostUsd)
                }
                recoveredResult(metadata.status)
            }
            is AiGenerationAtomicRecoveryResult.DeferredInFlightWithAttempts -> {
                result.attempts.forEach { attempt ->
                    metrics.recordProviderCost(attempt.provider, attempt.costBasis, attempt.reservedCostUsd)
                }
                AiGenerationRecoveryResult.DEFERRED_IN_FLIGHT
            }
            AiGenerationAtomicRecoveryResult.StateChanged -> reclassify(metadata.jobId, now)
            AiGenerationAtomicRecoveryResult.NotStale -> AiGenerationRecoveryResult.DEFERRED_NOT_STALE
            AiGenerationAtomicRecoveryResult.DeferredInFlight -> AiGenerationRecoveryResult.DEFERRED_IN_FLIGHT
            AiGenerationAtomicRecoveryResult.Corrupt -> AiGenerationRecoveryResult.CORRUPT
            AiGenerationAtomicRecoveryResult.Missing -> AiGenerationRecoveryResult.MISSING
        }
    }

    private fun reclassify(
        jobId: UUID,
        now: Instant,
    ): AiGenerationRecoveryResult =
        when (recoveryPort.reclassify(jobId, now)) {
            AiGenerationRecoveryReclassification.ACTIVE -> AiGenerationRecoveryResult.DEFERRED_STATE_CHANGED
            AiGenerationRecoveryReclassification.TERMINAL -> AiGenerationRecoveryResult.ALREADY_TERMINAL
            AiGenerationRecoveryReclassification.MISSING -> AiGenerationRecoveryResult.MISSING
            AiGenerationRecoveryReclassification.CORRUPT -> AiGenerationRecoveryResult.CORRUPT
        }

    private fun recoveredResult(status: JobStatus): AiGenerationRecoveryResult =
        if (status == JobStatus.PENDING) {
            AiGenerationRecoveryResult.RECOVERED_PENDING
        } else {
            AiGenerationRecoveryResult.RECOVERED_RUNNING
        }

    private companion object {
        val PROCESSING_STATUSES = setOf(JobStatus.PENDING, JobStatus.RUNNING)
        val EXHAUSTED_ERROR =
            GenerationError(
                ErrorCode.ASYNC_PROCESSING_EXHAUSTED,
                "AI generation processing exhausted its bounded recovery budget.",
            )
    }
}
