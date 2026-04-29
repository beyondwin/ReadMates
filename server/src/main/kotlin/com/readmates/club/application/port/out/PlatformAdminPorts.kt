package com.readmates.club.application.port.out

import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import java.time.OffsetDateTime
import java.util.UUID

interface LoadPlatformAdminSummaryPort {
    fun countActiveClubs(): Long
    fun countDomainsRequiringAction(): Long
    fun listDomains(limit: Int): List<PlatformAdminClubDomain>
    fun listDomainsRequiringAction(limit: Int): List<PlatformAdminClubDomain>
}

interface CreateClubDomainPort {
    fun createClubDomain(
        clubId: UUID,
        hostname: String,
        kind: ClubDomainKind,
        isPrimary: Boolean,
    ): PlatformAdminClubDomain
}

interface LoadClubDomainProvisioningPort {
    fun loadClubDomain(domainId: UUID): PlatformAdminClubDomain?
}

interface UpdateClubDomainProvisioningPort {
    fun updateClubDomainProvisioning(
        domainId: UUID,
        status: ClubDomainStatus,
        verifiedAt: OffsetDateTime?,
        lastCheckedAt: OffsetDateTime,
        errorCode: String?,
    ): PlatformAdminClubDomain
}

interface CheckClubDomainActualStatePort {
    fun check(hostname: String): ClubDomainActualCheckResult
}
