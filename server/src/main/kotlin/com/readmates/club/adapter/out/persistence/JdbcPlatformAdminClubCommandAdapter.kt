package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.model.NormalizedClubDomainHostname
import com.readmates.club.application.model.PlatformAdminClubCommandReceipt
import com.readmates.club.application.port.out.CreatePlatformAdminClubDomainOrigin
import com.readmates.club.application.port.out.LoadClubDomainOperationalHostnamePort
import com.readmates.club.application.port.out.LoadPlatformAdminClubCommandPreviewResult
import com.readmates.club.application.port.out.PlatformAdminClubCommandPort
import com.readmates.club.application.port.out.PlatformAdminDomainConvergenceAcquisition
import com.readmates.club.application.port.out.PlatformAdminDomainConvergenceLease
import com.readmates.club.application.port.out.StorePlatformAdminClubDomainEvidenceCommand
import com.readmates.club.application.port.out.StorePlatformAdminClubDomainResult
import com.readmates.club.application.port.out.StorePlatformAdminClubVisibilityCommand
import com.readmates.club.application.port.out.StorePlatformAdminClubVisibilityResult
import com.readmates.club.application.port.out.StorePlatformAdminDomainRecheckCommand
import com.readmates.club.application.port.out.StorePlatformAdminDomainRecheckResult
import com.readmates.club.application.port.out.StoredPlatformAdminClubCommandPreview
import com.readmates.club.application.port.out.StoredPlatformAdminDomainCommandPreview
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@Repository
class JdbcPlatformAdminClubCommandAdapter(
    jdbcTemplate: JdbcTemplate,
    objectMapper: ObjectMapper,
) : PlatformAdminClubCommandPort,
    LoadClubDomainOperationalHostnamePort {
    private val previews = JdbcPlatformAdminClubPreviewStore(jdbcTemplate, objectMapper)
    private val origins = JdbcPlatformAdminClubOriginStore(jdbcTemplate, objectMapper)
    private val convergence = JdbcPlatformAdminDomainConvergenceStore(jdbcTemplate, objectMapper)

    override fun savePreview(preview: StoredPlatformAdminClubCommandPreview) = previews.saveVisibility(preview)

    override fun loadPreview(previewId: UUID): VisibilityPreview = previews.loadVisibility(previewId)

    override fun loadReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
        commandType: String,
        targetType: String,
        targetId: UUID,
    ): PlatformAdminClubCommandReceipt? =
        origins.loadReceipt(
            receiptId,
            actorAdminId,
            commandType,
            targetType,
            targetId,
        )

    override fun storeVisibility(command: VisibilityCommand): VisibilityStoreResult = origins.storeVisibility(command)

    override fun saveDomainPreview(preview: StoredPlatformAdminDomainCommandPreview) = previews.saveDomain(preview)

    override fun loadDomainPreview(previewId: UUID): DomainPreview? = previews.loadDomain(previewId)

    override fun storeDomainCreation(
        origin: CreatePlatformAdminClubDomainOrigin,
        evidence: StorePlatformAdminClubDomainEvidenceCommand,
    ): DomainCreateResult = origins.storeDomainCreation(origin, evidence)

    override fun storeDomainRecheck(command: StorePlatformAdminDomainRecheckCommand): DomainRecheckResult =
        origins.storeDomainRecheck(command)

    override fun tryAcquireDomainConvergence(
        convergenceId: UUID,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ): PlatformAdminDomainConvergenceAcquisition {
        val acquired = convergence.tryAcquire(convergenceId, leaseOwner, now, leaseExpiresAt)
        return acquired
    }

    override fun loadOperationalHostname(domainId: UUID): NormalizedClubDomainHostname? {
        val hostname = convergence.loadOperationalHostname(domainId)
        return hostname
    }

    override fun finishDomainConvergence(
        lease: PlatformAdminDomainConvergenceLease,
        leaseOwner: String,
        result: ClubDomainActualCheckResult,
        safeErrorCode: String?,
        terminalFailure: Boolean,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean = convergence.finish(lease, leaseOwner, result, safeErrorCode, terminalFailure, completedAt, retryAt)
}

private typealias VisibilityPreview = LoadPlatformAdminClubCommandPreviewResult
private typealias VisibilityCommand = StorePlatformAdminClubVisibilityCommand
private typealias VisibilityStoreResult = StorePlatformAdminClubVisibilityResult
private typealias DomainPreview = StoredPlatformAdminDomainCommandPreview
private typealias DomainCreateResult = StorePlatformAdminClubDomainResult
private typealias DomainRecheckResult = StorePlatformAdminDomainRecheckResult
