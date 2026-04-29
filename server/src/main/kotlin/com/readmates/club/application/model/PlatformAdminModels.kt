package com.readmates.club.application.model

import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.club.domain.PlatformAdminRole
import java.time.OffsetDateTime
import java.util.UUID

data class PlatformAdminDashboardSummary(
    val platformRole: PlatformAdminRole,
    val activeClubCount: Long,
    val domainActionRequiredCount: Long,
    val domains: List<PlatformAdminClubDomain>,
    val domainsRequiringAction: List<PlatformAdminClubDomain>,
)

data class CreateClubDomainCommand(
    val hostname: String,
    val kind: ClubDomainKind,
    val isPrimary: Boolean,
)

data class PlatformAdminClubDomain(
    val id: UUID,
    val clubId: UUID,
    val hostname: String,
    val kind: ClubDomainKind,
    val status: ClubDomainStatus,
    val isPrimary: Boolean,
    val verifiedAt: OffsetDateTime?,
    val lastCheckedAt: OffsetDateTime?,
    val errorCode: String?,
)

enum class PlatformAdminDomainDesiredState {
    ENABLED,
    DISABLED,
}

enum class PlatformAdminDomainManualAction {
    CLOUDFLARE_PAGES_CUSTOM_DOMAIN,
    NONE,
}

val PlatformAdminClubDomain.desiredState: PlatformAdminDomainDesiredState
    get() = if (status == ClubDomainStatus.DISABLED) {
        PlatformAdminDomainDesiredState.DISABLED
    } else {
        PlatformAdminDomainDesiredState.ENABLED
    }

val PlatformAdminClubDomain.manualAction: PlatformAdminDomainManualAction
    get() = if (status == ClubDomainStatus.ACTION_REQUIRED) {
        PlatformAdminDomainManualAction.CLOUDFLARE_PAGES_CUSTOM_DOMAIN
    } else {
        PlatformAdminDomainManualAction.NONE
    }
