package com.readmates.club.adapter.out.persistence

import com.readmates.auth.application.port.out.MemberAvatarAllocationPort
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.model.PlatformAdminOnboardingResult
import com.readmates.club.application.port.out.LoadPlatformAdminOnboardingPreviewResult
import com.readmates.club.application.port.out.LockedPlatformAdminOnboardingSource
import com.readmates.club.application.port.out.OriginStoreResult
import com.readmates.club.application.port.out.PlatformAdminHostInvitationConvergenceAcquisition
import com.readmates.club.application.port.out.PlatformAdminHostInvitationConvergenceLease
import com.readmates.club.application.port.out.PlatformAdminHostInvitationDeliveryTarget
import com.readmates.club.application.port.out.PlatformAdminOnboardingCommandPort
import com.readmates.club.application.port.out.StorePlatformAdminOnboardingOriginCommand
import com.readmates.club.application.port.out.StoredPlatformAdminOnboardingPreview
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

@Repository
class JdbcPlatformAdminOnboardingCommandAdapter(
    jdbcTemplate: JdbcTemplate,
    objectMapper: ObjectMapper,
    avatarAllocation: MemberAvatarAllocationPort,
) : PlatformAdminOnboardingCommandPort {
    private val previews = JdbcPlatformAdminOnboardingPreviewStore(jdbcTemplate, objectMapper)
    private val origins = JdbcPlatformAdminOnboardingOriginStore(jdbcTemplate, objectMapper, avatarAllocation)
    private val hostConvergence = JdbcPlatformAdminHostInvitationConvergenceStore(jdbcTemplate)

    override fun saveOnboardingPreview(preview: StoredPlatformAdminOnboardingPreview) = previews.save(preview)

    override fun loadOnboardingPreview(previewId: UUID): PreviewLoadResult = previews.load(previewId)

    override fun lockOnboardingSource(command: PlatformAdminOnboardingCommand): LockedPlatformAdminOnboardingSource =
        previews.lockSource(command)

    override fun storeOnboardingOrigin(command: OriginCommand): OriginStoreResult = origins.store(command)

    override fun loadOnboardingReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
    ): PlatformAdminOnboardingResult? = origins.loadReceipt(receiptId, actorAdminId)

    override fun loadOnboardingDomainConvergenceId(receiptId: UUID): UUID? = origins.loadDomainConvergenceId(receiptId)

    override fun tryAcquireHostInvitationConvergence(
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
        maxAttempts: Int,
    ): HostInvitationAcquisition = hostConvergence.tryAcquire(leaseOwner, startedAt, leaseExpiresAt, maxAttempts)

    override fun loadHostInvitationDeliveryTarget(
        lease: PlatformAdminHostInvitationConvergenceLease,
        at: Instant,
    ): PlatformAdminHostInvitationDeliveryTarget? = hostConvergence.loadTarget(lease, at)

    override fun finishHostInvitationConvergence(
        lease: PlatformAdminHostInvitationConvergenceLease,
        leaseOwner: String,
        succeeded: Boolean,
        safeErrorCode: String?,
        terminalFailure: Boolean,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean =
        hostConvergence.finish(
            lease,
            leaseOwner,
            succeeded,
            safeErrorCode,
            terminalFailure,
            completedAt,
            retryAt,
        )
}

private typealias PreviewLoadResult = LoadPlatformAdminOnboardingPreviewResult
private typealias HostInvitationAcquisition = PlatformAdminHostInvitationConvergenceAcquisition
private typealias OriginCommand = StorePlatformAdminOnboardingOriginCommand
