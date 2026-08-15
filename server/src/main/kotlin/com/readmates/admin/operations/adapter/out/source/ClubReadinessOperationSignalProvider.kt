package com.readmates.admin.operations.adapter.out.source

import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSignal
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.out.AdminOperationSignalProvider
import com.readmates.admin.operations.application.port.out.AdminOperationSignalVerification
import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.toPlatformActor
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.OffsetDateTime
import java.util.UUID

@Component
class ClubReadinessOperationSignalProvider(
    private val listClubsUseCase: ListPlatformAdminClubsUseCase,
    private val clock: Clock,
) : AdminOperationSignalProvider {
    override val sourceType = AdminOperationSourceType.CLUB_READINESS

    override fun collect(admin: CurrentPlatformAdmin): AdminOperationSignalBatch {
        val clubs = listClubsUseCase.listClubs(admin.toPlatformActor()).items
        val generatedAt = OffsetDateTime.now(clock)
        val authoritative = clubs.size < CLUB_PAGE_LIMIT
        return AdminOperationSignalBatch(
            sourceType = sourceType,
            status = if (authoritative) AdminOperationSourceStatus.AVAILABLE else AdminOperationSourceStatus.PARTIAL,
            generatedAt = generatedAt,
            authoritative = authoritative,
            signals = clubs.mapNotNull { it.toSignal(generatedAt) },
        )
    }

    @Suppress("ReturnCount")
    override fun verify(
        admin: CurrentPlatformAdmin,
        sourceKey: String,
    ): AdminOperationSignalVerification {
        val clubId = sourceKey.clubReadinessId() ?: return AdminOperationSignalVerification.ABSENT
        val clubs = listClubsUseCase.listClubs(admin.toPlatformActor()).items
        val club = clubs.firstOrNull { it.clubId == clubId }
        if (club != null) {
            return if (club.toSignal(OffsetDateTime.now(clock)) == null) {
                AdminOperationSignalVerification.ABSENT
            } else {
                AdminOperationSignalVerification.ACTIVE
            }
        }
        return if (clubs.size < CLUB_PAGE_LIMIT) {
            AdminOperationSignalVerification.ABSENT
        } else {
            AdminOperationSignalVerification.UNAVAILABLE
        }
    }

    private fun PlatformAdminClubListItem.toSignal(observedAt: OffsetDateTime): AdminOperationSignal? {
        val projection = projection() ?: return null
        return AdminOperationSignal(
            sourceType = sourceType,
            sourceKey = "$CLUB_SOURCE_PREFIX$clubId",
            clubId = clubId,
            severity = projection.severity,
            summaryCode = projection.summaryCode,
            impactCount = projection.impactCount,
            detailHref = "/admin/clubs/$clubId",
            observedAt = observedAt,
        )
    }

    private fun PlatformAdminClubListItem.projection(): ClubSignalProjection? =
        when {
            domainActionRequiredCount > 0 ->
                ClubSignalProjection(
                    severity = AdminOperationSeverity.WARNING,
                    summaryCode = "CLUB_DOMAIN_ACTION_REQUIRED",
                    impactCount = domainActionRequiredCount,
                )
            requiresSetup() ->
                ClubSignalProjection(
                    severity = AdminOperationSeverity.WARNING,
                    summaryCode = "CLUB_SETUP_REQUIRED",
                    impactCount = 1,
                )
            isReadyToPublish() ->
                ClubSignalProjection(
                    severity = AdminOperationSeverity.READY,
                    summaryCode = "CLUB_READY_TO_PUBLISH",
                    impactCount = 1,
                )
            else -> null
        }

    private fun PlatformAdminClubListItem.requiresSetup(): Boolean =
        status != ClubStatus.ACTIVE ||
            firstHostOnboardingState != FirstHostOnboardingState.ASSIGNED ||
            name.isBlank() ||
            tagline.isBlank() ||
            about.isBlank()

    private fun PlatformAdminClubListItem.isReadyToPublish(): Boolean =
        status == ClubStatus.ACTIVE &&
            publicVisibility == ClubPublicVisibility.PRIVATE &&
            firstHostOnboardingState == FirstHostOnboardingState.ASSIGNED

    private fun String.clubReadinessId(): UUID? {
        if (!startsWith(CLUB_SOURCE_PREFIX)) return null
        return runCatching { UUID.fromString(removePrefix(CLUB_SOURCE_PREFIX)) }.getOrNull()
    }

    private data class ClubSignalProjection(
        val severity: AdminOperationSeverity,
        val summaryCode: String,
        val impactCount: Int,
    )

    private companion object {
        const val CLUB_PAGE_LIMIT = 100
        const val CLUB_SOURCE_PREFIX = "CLUB_READINESS:"
    }
}
