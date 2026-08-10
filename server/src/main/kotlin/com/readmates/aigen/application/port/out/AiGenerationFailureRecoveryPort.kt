package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ProviderAttempt
import java.time.Instant
import java.util.UUID

data class AiGenerationRecoveryMetadata(
    val jobId: UUID,
    val hostUserId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val status: JobStatus,
    val lastUpdatedAt: Instant,
)

sealed interface AiGenerationRecoveryMetadataResult {
    data class Valid(
        val metadata: AiGenerationRecoveryMetadata,
    ) : AiGenerationRecoveryMetadataResult

    data object Missing : AiGenerationRecoveryMetadataResult

    data object Corrupt : AiGenerationRecoveryMetadataResult
}

enum class AiGenerationAdmissionDisposition { RELEASE_PENDING, COMPLETE_RUNNING }

data class AiGenerationAtomicRecoveryCommand(
    val jobId: UUID,
    val hostUserId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val expectedStatus: JobStatus,
    val observedLastUpdatedAt: Instant,
    val scheduledCutoff: Instant?,
    val providerStaleBefore: Instant,
    val error: GenerationError,
    val now: Instant,
    val admissionDisposition: AiGenerationAdmissionDisposition,
)

sealed interface AiGenerationAtomicRecoveryResult {
    data object Recovered : AiGenerationAtomicRecoveryResult

    data object RecoveredUnaccounted : AiGenerationAtomicRecoveryResult

    data class RecoveredWithAttempts(
        val attempts: List<ProviderAttempt>,
    ) : AiGenerationAtomicRecoveryResult

    data class DeferredInFlightWithAttempts(
        val attempts: List<ProviderAttempt>,
    ) : AiGenerationAtomicRecoveryResult

    data object StateChanged : AiGenerationAtomicRecoveryResult

    data object NotStale : AiGenerationAtomicRecoveryResult

    data object DeferredInFlight : AiGenerationAtomicRecoveryResult

    data object Corrupt : AiGenerationAtomicRecoveryResult

    data object Missing : AiGenerationAtomicRecoveryResult
}

enum class AiGenerationRecoveryReclassification {
    ACTIVE,
    TERMINAL,
    MISSING,
    CORRUPT,
}

enum class AiGenerationIndexRepairResult {
    PAGE_COMPLETED,
    PASS_COMPLETED,
    EPOCH_RESET,
    QUARANTINED,
    OVER_CAP,
    FAILED,
}

data class AiGenerationProcessingCandidate(
    val jobId: UUID,
    val metadata: AiGenerationRecoveryMetadata? = null,
    val corrupt: Boolean = false,
    val missing: Boolean = false,
) {
    constructor(
        metadata: AiGenerationRecoveryMetadata,
        corrupt: Boolean = false,
    ) : this(metadata.jobId, metadata, corrupt)
}

interface AiGenerationFailureRecoveryPort {
    fun loadRecoveryMetadata(jobId: UUID): AiGenerationRecoveryMetadataResult

    fun recover(command: AiGenerationAtomicRecoveryCommand): AiGenerationAtomicRecoveryResult

    fun reclassify(
        jobId: UUID,
        now: Instant,
    ): AiGenerationRecoveryReclassification

    fun quarantineCorrupt(
        jobId: UUID,
        now: Instant,
    )

    fun repairProcessingRecoveryIndex(now: Instant): AiGenerationIndexRepairResult

    fun loadProcessingRecoveryJobs(
        staleBefore: Instant,
        limit: Int,
    ): List<AiGenerationProcessingCandidate>
}
