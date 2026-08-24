package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationJobListResult
import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.AiOpsAdminActionResult
import com.readmates.aigen.application.model.AiOpsAdminCommandPreview
import com.readmates.aigen.application.model.AiOpsAdminCommandReceipt
import com.readmates.aigen.application.model.AiOpsCostTrend
import com.readmates.aigen.application.model.AiOpsCostWindow
import com.readmates.aigen.application.model.AiOpsDeltaDirection
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsSummary
import com.readmates.aigen.application.model.AiOpsTrendAvailability
import com.readmates.aigen.application.model.ConfirmAiOpsAdminCommand
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.ConfirmAiOpsAdminCommandUseCase
import com.readmates.aigen.application.port.`in`.ForceCancelAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsSummaryUseCase
import com.readmates.aigen.application.port.`in`.ListAiOpsJobsUseCase
import com.readmates.aigen.application.port.`in`.PreviewAiOpsAdminCommandUseCase
import com.readmates.aigen.application.port.`in`.RetryAiOpsJobCommitUseCase
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditEntry
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditPort
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandPort
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandReceiptRecord
import com.readmates.aigen.application.port.out.AiGenerationAuditQueryPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.LoadAiGenerationAdminCommandPreviewResult
import com.readmates.aigen.application.port.out.StoreAiGenerationAdminCommandOrigin
import com.readmates.aigen.application.port.out.StoreAiGenerationAdminCommandOriginResult
import com.readmates.aigen.application.port.out.StoredAiGenerationAdminCommandPreview
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.time.ZoneOffset
import java.util.Locale
import java.util.UUID

@Service
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
@Suppress("LongParameterList", "MaxLineLength", "TooManyFunctions")
class AiGenerationOpsService(
    private val auditQueryPort: AiGenerationAuditQueryPort,
    private val adminActionAuditPort: AiGenerationAdminActionAuditPort,
    private val jobStore: AiGenerationJobStore,
    private val clock: Clock,
    private val commitRecoveryService: AiGenerationCommitRecoveryService? = null,
    private val commandPort: AiGenerationAdminCommandPort? = null,
    private val identityService: AdminCommandIdentityService? = null,
    private val idempotencyService: AdminCommandIdempotencyService? = null,
    private val idempotencyProperties: AdminCommandIdempotencyProperties = AdminCommandIdempotencyProperties(),
    private val transactions: TransactionTemplate? = null,
    private val adminCommandConvergenceService: AiGenerationAdminCommandConvergenceService? = null,
) : GetAiOpsSummaryUseCase,
    ListAiOpsJobsUseCase,
    GetAiOpsJobUseCase,
    ForceCancelAiOpsJobUseCase,
    RetryAiOpsJobCommitUseCase,
    PreviewAiOpsAdminCommandUseCase,
    ConfirmAiOpsAdminCommandUseCase {
    override fun summary(
        admin: CurrentPlatformAdmin,
        window: AiOpsCostWindow,
    ): AiOpsSummary {
        val now = clock.instant()
        val activeJobs =
            when (val jobs = jobStore.loadActiveJobs()) {
                is AiGenerationJobListResult.Available -> jobs.records
                is AiGenerationJobListResult.Unavailable -> emptyList()
            }
        val monthStart =
            now
                .atZone(ZoneOffset.UTC)
                .withDayOfMonth(1)
                .toLocalDate()
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
        return AiOpsSummary(
            activeJobCount = activeJobs.size,
            failedLast24h = auditQueryPort.countFailuresSince(now.minus(Duration.ofHours(24))),
            monthToDateCostEstimateUsd = auditQueryPort.costSince(monthStart),
            failureCodes = auditQueryPort.failureCodesSince(monthStart),
            providerCosts = auditQueryPort.providerCostsSince(monthStart),
            staleCandidateCount =
                activeJobs.count {
                    it.status in STALE_CANDIDATE_STATUSES &&
                        it.lastUpdatedAt.isBefore(now.minus(STALE_CANDIDATE_AGE))
                },
            costTrend = costTrend(now, window),
        )
    }

    private fun costTrend(
        now: java.time.Instant,
        window: AiOpsCostWindow,
    ): AiOpsCostTrend {
        val windowSeconds = Duration.ofDays(window.days)
        val currentStart = now.minus(windowSeconds)
        val priorStart = now.minus(windowSeconds.multipliedBy(2))
        val current = auditQueryPort.windowUsageBetween(currentStart, now)
        val prior = auditQueryPort.windowUsageBetween(priorStart, currentStart)
        val available = prior.jobCount > 0
        val direction =
            if (!available) {
                AiOpsDeltaDirection.NONE
            } else {
                when (current.costUsd.compareTo(prior.costUsd)) {
                    1 -> AiOpsDeltaDirection.UP
                    -1 -> AiOpsDeltaDirection.DOWN
                    else -> AiOpsDeltaDirection.FLAT
                }
            }
        return AiOpsCostTrend(
            window = window,
            currentCostUsd = current.costUsd,
            priorCostUsd = prior.costUsd,
            currentJobCount = current.jobCount,
            priorJobCount = prior.jobCount,
            deltaDirection = direction,
            availability = if (available) AiOpsTrendAvailability.AVAILABLE else AiOpsTrendAvailability.NOT_ENOUGH_DATA,
        )
    }

    override fun list(
        admin: CurrentPlatformAdmin,
        filters: AiOpsJobFilters,
    ): AiOpsJobList {
        val now = clock.instant()
        val liveItems =
            if (filters.cursor == null) {
                when (val jobs = jobStore.loadActiveJobs()) {
                    is AiGenerationJobListResult.Available ->
                        jobs.records
                            .filter { it.matches(filters) }
                            .map { it.toOpsItem(now) }

                    is AiGenerationJobListResult.Unavailable -> emptyList()
                }
            } else {
                emptyList()
            }
        val historical = auditQueryPort.listJobs(filters)
        return AiOpsJobList(
            items = (liveItems + historical.items).distinctBy { it.jobId },
            nextCursor = historical.nextCursor,
        )
    }

    override fun get(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsJobListItem =
        jobStore.findJobById(jobId)?.toOpsItem(clock.instant())
            ?: auditQueryPort.findJobById(jobId)
            ?: throw AiGenerationException.JobNotFound(jobId)

    override fun forceCancel(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsAdminActionResult {
        if (admin.role !in ACTION_ROLES) {
            throw AccessDeniedException("Platform admin role ${admin.role} cannot force-cancel AI generation jobs")
        }
        val record =
            jobStore.findJobById(jobId)
                ?: throw safeMissingLiveJob(jobId)
        if (record.status !in FORCE_CANCEL_STATUSES) {
            throw AiGenerationException.IllegalGenerationState(jobId, record.status.name, "admin force-cancel")
        }
        val cancelled =
            jobStore.transitionStatus(
                jobId = jobId,
                expected = FORCE_CANCEL_STATUSES,
                next = JobStatus.CANCELLED,
                stage = null,
                progressPct = 0,
                error = null,
            )
        if (!cancelled) {
            throw AiGenerationException.IllegalGenerationState(
                jobId = jobId,
                currentStatus = jobStore.load(jobId)?.status?.name ?: "MISSING",
                attemptedAction = "admin force-cancel",
            )
        }
        jobStore.deleteTransientPayload(jobId)
        adminActionAuditPort.record(
            AiGenerationAdminActionAuditEntry(
                jobId = jobId,
                clubId = record.clubId,
                sessionId = record.sessionId,
                adminUserId = admin.userId,
                adminRole = admin.role,
                action = AiOpsAction.FORCE_CANCEL.name,
                previousStatus = record.status.name,
                nextStatus = JobStatus.CANCELLED.name,
                result = "SUCCESS",
                safeErrorCode = null,
                createdAt = clock.instant(),
            ),
        )
        return AiOpsAdminActionResult(jobId, record.status, JobStatus.CANCELLED)
    }

    override fun retryCommit(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsAdminActionResult {
        if (admin.role !in ACTION_ROLES) {
            throw AccessDeniedException("Platform admin role ${admin.role} cannot retry AI generation commits")
        }
        val record =
            jobStore.findJobById(jobId)
                ?: throw safeMissingLiveJob(jobId)
        if (record.status !in RETRY_COMMIT_STATUSES) {
            throw AiGenerationException.IllegalGenerationState(jobId, record.status.name, "admin retry-commit")
        }
        val recovered = requireNotNull(commitRecoveryService) { "AI commit recovery is unavailable" }.recover(jobId)
        adminActionAuditPort.record(
            AiGenerationAdminActionAuditEntry(
                jobId = jobId,
                clubId = record.clubId,
                sessionId = record.sessionId,
                adminUserId = admin.userId,
                adminRole = admin.role,
                action = AiOpsAction.RETRY_COMMIT.name,
                previousStatus = record.status.name,
                nextStatus = recovered.status.name,
                result = "SUCCESS",
                safeErrorCode = null,
                createdAt = clock.instant(),
            ),
        )
        return AiOpsAdminActionResult(jobId, record.status, recovered.status)
    }

    override fun previewAdminCommand(
        admin: PlatformActor,
        jobId: UUID,
        action: AiOpsAction,
    ): AiOpsAdminCommandPreview {
        requireManageAi(admin)
        val record = jobStore.loadMetadata(jobId) ?: throw safeMissingLiveJob(jobId)
        requireActionState(jobId, action, record.status)
        val previewId = UUID.randomUUID()
        val request = AiAdminCanonicalRequest(previewId, jobId, action, record.revision)
        val digest =
            requiredIdentityService()
                .resolve(identity(admin, jobId, action, previewId.toString()), request)
                .digests.current
        val now = clock.instant()
        val impactCodes = impactCodes(action)
        val preview =
            StoredAiGenerationAdminCommandPreview(
                previewId = previewId,
                action = action,
                actorAdminId = admin.adminId,
                actorRoleSnapshot = admin.role.name,
                actorCapabilities = admin.capabilities.map { it.name }.sorted(),
                jobId = jobId,
                clubId = record.clubId,
                jobStatus = record.status,
                jobRevision = record.revision,
                canonicalSchemaVersion = digest.schemaVersion,
                digestKeyVersion = digest.digestKeyVersion,
                requestHmac = digest.requestHmac,
                sanitizedImpact =
                    mapOf(
                        "effectType" to effectType(action),
                        "impactCodes" to impactCodes,
                        "providerCancellation" to false,
                    ),
                expiresAt = now.plus(idempotencyProperties.previewTtl),
                consumedAt = null,
                consumedReceiptId = null,
                createdAt = now,
            )
        requiredCommandPort().savePreview(preview)
        return AiOpsAdminCommandPreview(
            previewId,
            jobId,
            action,
            record.status,
            record.revision,
            effectType(action),
            impactCodes,
            preview.expiresAt,
            preview.requestHmac
                .take(FINGERPRINT_PREFIX_BYTES)
                .joinToString("") { "%02x".format(Locale.ROOT, it) },
        )
    }

    override fun confirmAdminCommand(
        admin: PlatformActor,
        jobId: UUID,
        action: AiOpsAction,
        command: ConfirmAiOpsAdminCommand,
    ): AiOpsAdminCommandReceipt {
        requireManageAi(admin)
        if (!command.confirmed) failSafe(jobId, "CONFIRMATION_REQUIRED")
        if (!IDEMPOTENCY_KEY.matches(command.idempotencyKey)) failSafe(jobId, "INVALID_IDEMPOTENCY_KEY")
        if (command.expectedJobRevision < 0) failSafe(jobId, "PREVIEW_MISMATCH")
        val request = AiAdminCanonicalRequest(command.previewId, jobId, action, command.expectedJobRevision)
        val identity = identity(admin, jobId, action, command.idempotencyKey)
        val origin = {
            when (val claim = requiredIdempotencyService().claim(identity, request)) {
                is AdminCommandClaimResult.Completed -> replay(claim, admin, jobId, action)
                AdminCommandClaimResult.Conflict -> failSafe(jobId, "IDEMPOTENCY_CONFLICT")
                AdminCommandClaimResult.InProgress -> failSafe(jobId, "COMMAND_IN_PROGRESS")
                is AdminCommandClaimResult.Claimed -> storeOrigin(admin, jobId, action, command, request, claim)
            }
        }
        val receipt = transactions?.execute { origin() } ?: origin()
        adminCommandConvergenceService?.process(receipt.convergenceId)
        return requiredCommandPort()
            .loadReceipt(receipt.receiptId, admin.adminId, jobId, action)
            .orEmpty(receipt)
            .toResponse()
    }

    private fun storeOrigin(
        admin: PlatformActor,
        jobId: UUID,
        action: AiOpsAction,
        command: ConfirmAiOpsAdminCommand,
        request: AiAdminCanonicalRequest,
        claim: AdminCommandClaimResult.Claimed,
    ): AiGenerationAdminCommandReceiptRecord {
        val preview =
            when (val loaded = requiredCommandPort().loadPreview(command.previewId)) {
                is LoadAiGenerationAdminCommandPreviewResult.Loaded -> loaded.preview
                LoadAiGenerationAdminCommandPreviewResult.Missing -> failSafe(jobId, "PREVIEW_NOT_FOUND")
            }
        validatePreview(admin, jobId, action, command, request, preview)
        val current = jobStore.loadMetadata(jobId) ?: failSafe(jobId, "JOB_EXPIRED")
        requireActionState(jobId, action, current.status)
        if (current.revision != preview.jobRevision || current.status != preview.jobStatus) {
            failSafe(jobId, "JOB_STATE_CHANGED")
        }
        val now = clock.instant()
        val result =
            requiredCommandPort().storeOrigin(
                StoreAiGenerationAdminCommandOrigin(
                    preview = preview,
                    receiptId = UUID.randomUUID(),
                    convergenceId = UUID.randomUUID(),
                    auditEventId = UUID.randomUUID(),
                    actorAdminId = admin.adminId,
                    actorRoleSnapshot = admin.role.name,
                    actorCapabilities = admin.capabilities.map { it.name }.sorted(),
                    digest = claim.currentDigest,
                    beforeJobStatus = current.status,
                    beforeJobRevision = current.revision,
                    afterJobStatus = current.status,
                    afterJobRevision = current.revision,
                    safeResult = mapOf("resultCode" to "EFFECT_PENDING", "effectStatus" to "PENDING"),
                    occurredAt = now,
                ),
            )
        val receipt =
            when (result) {
                is StoreAiGenerationAdminCommandOriginResult.Stored -> result.receipt
                StoreAiGenerationAdminCommandOriginResult.PreviewConsumed -> failSafe(jobId, "PREVIEW_CONSUMED")
            }
        if (!requiredIdempotencyService().complete(
                claim.claimId,
                claim.claimToken,
                AI_ADMIN_RECEIPT_TYPE,
                receipt.receiptId.toString(),
            )
        ) {
            failSafe(jobId, "COMMAND_IN_PROGRESS")
        }
        return receipt
    }

    private fun validatePreview(
        admin: PlatformActor,
        jobId: UUID,
        action: AiOpsAction,
        command: ConfirmAiOpsAdminCommand,
        request: AiAdminCanonicalRequest,
        preview: StoredAiGenerationAdminCommandPreview,
    ) {
        if (preview.actorAdminId != admin.adminId || preview.jobId != jobId || preview.action != action) {
            failSafe(jobId, "PREVIEW_MISMATCH")
        }
        if (preview.consumedAt != null || preview.consumedReceiptId != null) failSafe(jobId, "PREVIEW_CONSUMED")
        if (!preview.expiresAt.isAfter(clock.instant())) failSafe(jobId, "PREVIEW_EXPIRED")
        if (preview.jobRevision != command.expectedJobRevision) failSafe(jobId, "PREVIEW_MISMATCH")
        val digest =
            requiredIdentityService()
                .resolve(identity(admin, jobId, action, command.idempotencyKey), request)
                .digests.lookupCandidates
                .firstOrNull { it.digestKeyVersion == preview.digestKeyVersion }
                ?: failSafe(jobId, "PREVIEW_MISMATCH")
        if (preview.canonicalSchemaVersion != digest.schemaVersion ||
            !RequestIdentityHmac.equal(preview.requestHmac, digest.requestHmac)
        ) {
            failSafe(jobId, "PREVIEW_MISMATCH")
        }
    }

    private fun replay(
        claim: AdminCommandClaimResult.Completed,
        admin: PlatformActor,
        jobId: UUID,
        action: AiOpsAction,
    ): AiGenerationAdminCommandReceiptRecord {
        if (claim.receiptType != AI_ADMIN_RECEIPT_TYPE) failSafe(jobId, "PREVIEW_MISMATCH")
        val receiptId =
            runCatching { UUID.fromString(claim.receiptId) }
                .getOrNull()
                ?: failSafe(jobId, "PREVIEW_MISMATCH")
        return requiredCommandPort().loadReceipt(receiptId, admin.adminId, jobId, action)
            ?: failSafe(jobId, "PREVIEW_MISMATCH")
    }

    private fun identity(
        admin: PlatformActor,
        jobId: UUID,
        action: AiOpsAction,
        idempotencyKey: String,
    ) = PlatformAdminCommandIdentity(
        platformAdminUserId = admin.adminId,
        commandType = commandType(action),
        targetType = AI_ADMIN_TARGET_TYPE,
        targetId = jobId.toString(),
        idempotencyKey = idempotencyKey,
    )

    private fun requireManageAi(admin: PlatformActor) {
        if (!admin.can(PlatformCapability.MANAGE_AI_OPERATIONS)) {
            throw AccessDeniedException("Platform admin role cannot manage AI operations")
        }
    }

    private fun requireActionState(
        jobId: UUID,
        action: AiOpsAction,
        status: JobStatus,
    ) {
        val allowed = if (action == AiOpsAction.FORCE_CANCEL) FORCE_CANCEL_STATUSES else RETRY_COMMIT_STATUSES
        if (status !in allowed) throw AiGenerationException.IllegalGenerationState(jobId, status.name, action.name)
    }

    private fun requiredCommandPort() = requireNotNull(commandPort) { "AI admin command persistence is unavailable" }

    private fun requiredIdentityService() = requireNotNull(identityService) { "AI admin command identity is unavailable" }

    private fun requiredIdempotencyService() = requireNotNull(idempotencyService) { "AI admin idempotency is unavailable" }

    private fun AiGenerationAdminCommandReceiptRecord.toResponse() =
        AiOpsAdminCommandReceipt(
            receiptId,
            previewId,
            jobId,
            action,
            beforeJobStatus,
            beforeJobRevision,
            afterJobStatus,
            afterJobRevision,
            originStatus,
            effectStatus,
            safeErrorCode,
        )

    private fun AiGenerationAdminCommandReceiptRecord?.orEmpty(
        fallback: AiGenerationAdminCommandReceiptRecord,
    ): AiGenerationAdminCommandReceiptRecord = this ?: fallback

    private fun safeMissingLiveJob(jobId: UUID): AiGenerationException {
        val historical = auditQueryPort.findJobById(jobId) ?: return AiGenerationException.JobNotFound(jobId)
        val safeCode = if (historical.status in TERMINAL_STATUSES) "JOB_NOT_LIVE" else "JOB_EXPIRED"
        return AiGenerationException.SafeOpsError(jobId, safeCode)
    }

    private fun JobRecord.matches(filters: AiOpsJobFilters): Boolean =
        (filters.status == null || status == filters.status) &&
            (filters.clubId == null || clubId == filters.clubId) &&
            (filters.errorCode == null || error?.code?.name == filters.errorCode)

    private fun JobRecord.toOpsItem(now: java.time.Instant): AiOpsJobListItem =
        AiOpsJobListItem(
            jobId = jobId,
            clubId = clubId,
            clubSlug = null,
            clubName = null,
            sessionId = sessionId,
            sessionNumber = sessionMeta.sessionNumber,
            bookTitle = sessionMeta.bookTitle,
            status = status,
            stage = stage,
            provider = model.provider,
            model = model.name,
            errorCode = error?.code?.name,
            safeErrorMessage = null,
            costEstimateUsd = costAccumulatedUsd,
            createdAt = createdAt,
            lastUpdatedAt = lastUpdatedAt,
            expiresAt = expiresAt,
            staleCandidate = status in STALE_CANDIDATE_STATUSES && lastUpdatedAt.isBefore(now.minus(STALE_CANDIDATE_AGE)),
            availableActions =
                buildSet {
                    if (status in FORCE_CANCEL_STATUSES) add(AiOpsAction.FORCE_CANCEL)
                    if (status in RETRY_COMMIT_STATUSES) add(AiOpsAction.RETRY_COMMIT)
                },
            revision = revision,
            cleanupPending = cleanupPending,
            commitLeaseExpiresAt = commitLeaseExpiresAt,
        )

    private companion object {
        const val AI_ADMIN_RECEIPT_TYPE = "ai_generation_admin_command_receipt"
        const val AI_ADMIN_TARGET_TYPE = "ai-generation-job"
        const val FINGERPRINT_PREFIX_BYTES = 4
        val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9._-]{8,128}$")
        val ACTION_ROLES = setOf(PlatformAdminRole.OWNER, PlatformAdminRole.OPERATOR)
        val FORCE_CANCEL_STATUSES =
            setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED)
        val RETRY_COMMIT_STATUSES = setOf(JobStatus.COMMIT_RETRY)
        val STALE_CANDIDATE_STATUSES =
            setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.COMMITTING, JobStatus.COMMIT_RETRY)
        val TERMINAL_STATUSES = setOf(JobStatus.COMMITTED, JobStatus.CANCELLED, JobStatus.FAILED)
        val STALE_CANDIDATE_AGE: Duration = Duration.ofMinutes(15)
    }
}

private data class AiAdminCanonicalRequest(
    val previewId: UUID,
    val jobId: UUID,
    val action: AiOpsAction,
    val expectedJobRevision: Long,
) : CanonicalAdminCommandRequest {
    override val schemaVersion: String = "readmates:ai-admin-command:v1"

    override fun canonicalFields(): List<Pair<String, String>> =
        listOf(
            "action" to action.name,
            "confirmed" to "true",
            "expectedJobRevision" to expectedJobRevision.toString(),
            "jobId" to jobId.toString(),
            "previewId" to previewId.toString(),
        )
}

private fun commandType(action: AiOpsAction): String =
    when (action) {
        AiOpsAction.FORCE_CANCEL -> "ai-generation.force-cancel"
        AiOpsAction.RETRY_COMMIT -> "ai-generation.retry-commit"
    }

private fun effectType(action: AiOpsAction): String =
    when (action) {
        AiOpsAction.FORCE_CANCEL -> "AI_JOB_CANCEL"
        AiOpsAction.RETRY_COMMIT -> "AI_COMMIT_RETRY"
    }

private fun impactCodes(action: AiOpsAction): List<String> =
    when (action) {
        AiOpsAction.FORCE_CANCEL -> listOf("CANCEL_JOB", "DELETE_TRANSIENT_PAYLOAD")
        AiOpsAction.RETRY_COMMIT -> listOf("RETRY_COMMIT_RECOVERY")
    }

private fun failSafe(
    jobId: UUID,
    code: String,
): Nothing = throw AiGenerationException.SafeOpsError(jobId, code)
