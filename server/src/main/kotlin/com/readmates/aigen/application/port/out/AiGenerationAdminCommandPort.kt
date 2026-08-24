package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.JobStatus
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import java.time.Instant
import java.util.UUID

data class StoredAiGenerationAdminCommandPreview(
    val previewId: UUID,
    val action: AiOpsAction,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val jobId: UUID,
    val clubId: UUID,
    val jobStatus: JobStatus,
    val jobRevision: Long,
    val canonicalSchemaVersion: String,
    val digestKeyVersion: Int,
    val requestHmac: ByteArray,
    val sanitizedImpact: Map<String, Any>,
    val expiresAt: Instant,
    val consumedAt: Instant?,
    val consumedReceiptId: UUID?,
    val createdAt: Instant,
)

sealed interface LoadAiGenerationAdminCommandPreviewResult {
    data class Loaded(
        val preview: StoredAiGenerationAdminCommandPreview,
    ) : LoadAiGenerationAdminCommandPreviewResult

    data object Missing : LoadAiGenerationAdminCommandPreviewResult
}

data class StoreAiGenerationAdminCommandOrigin(
    val preview: StoredAiGenerationAdminCommandPreview,
    val receiptId: UUID,
    val convergenceId: UUID,
    val auditEventId: UUID,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val digest: AdminCommandDigest,
    val beforeJobStatus: JobStatus,
    val beforeJobRevision: Long,
    val afterJobStatus: JobStatus,
    val afterJobRevision: Long,
    val safeResult: Map<String, String>,
    val occurredAt: Instant,
)

data class AiGenerationAdminCommandReceiptRecord(
    val receiptId: UUID,
    val previewId: UUID,
    val action: AiOpsAction,
    val actorAdminId: UUID,
    val jobId: UUID,
    val clubId: UUID,
    val beforeJobStatus: JobStatus,
    val beforeJobRevision: Long,
    val afterJobStatus: JobStatus,
    val afterJobRevision: Long,
    val originStatus: String,
    val safeResult: Map<String, String>,
    val convergenceId: UUID,
    val effectStatus: String,
    val safeErrorCode: String?,
)

sealed interface StoreAiGenerationAdminCommandOriginResult {
    data class Stored(
        val receipt: AiGenerationAdminCommandReceiptRecord,
    ) : StoreAiGenerationAdminCommandOriginResult

    data object PreviewConsumed : StoreAiGenerationAdminCommandOriginResult
}

data class AiGenerationAdminCommandConvergenceLease(
    val convergenceId: UUID,
    val receiptId: UUID,
    val effectType: String,
    val jobId: UUID,
    val action: AiOpsAction,
    val expectedJobRevision: Long,
    val attemptNo: Int,
)

sealed interface AiGenerationAdminCommandConvergenceAcquisition {
    data class Acquired(
        val lease: AiGenerationAdminCommandConvergenceLease,
    ) : AiGenerationAdminCommandConvergenceAcquisition

    data object Unavailable : AiGenerationAdminCommandConvergenceAcquisition

    data object Terminalized : AiGenerationAdminCommandConvergenceAcquisition
}

data class AiGenerationAdminCommandConvergenceOutcome(
    val state: String,
    val safeErrorCode: String?,
    val availableAt: Instant?,
)

interface AiGenerationAdminCommandPort {
    fun savePreview(preview: StoredAiGenerationAdminCommandPreview)

    fun loadPreview(previewId: UUID): LoadAiGenerationAdminCommandPreviewResult

    fun storeOrigin(command: StoreAiGenerationAdminCommandOrigin): StoreAiGenerationAdminCommandOriginResult

    fun loadReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
        jobId: UUID,
        action: AiOpsAction,
    ): AiGenerationAdminCommandReceiptRecord?

    fun loadAvailableConvergenceIds(
        now: Instant,
        limit: Int,
    ): List<UUID>

    fun tryAcquireConvergence(
        convergenceId: UUID,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ): AiGenerationAdminCommandConvergenceAcquisition

    fun finishConvergence(
        lease: AiGenerationAdminCommandConvergenceLease,
        leaseOwner: String,
        outcome: AiGenerationAdminCommandConvergenceOutcome,
        completedAt: Instant,
    ): Boolean
}
