package com.readmates.club.application.port.out

import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.domain.ClubDomainKind
import java.util.UUID

interface LoadPlatformAdminSummaryPort {
    fun countActiveClubs(): Long
    fun countDomainsRequiringAction(): Long
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
