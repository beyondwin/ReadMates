package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.CreateClubDomainCommand
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.PlatformAdminDashboardSummary
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.shared.security.CurrentPlatformAdmin
import java.util.UUID

interface PlatformAdminSummaryUseCase {
    fun summary(admin: CurrentPlatformAdmin): PlatformAdminDashboardSummary
}

interface CreateClubDomainUseCase {
    fun createClubDomain(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
        command: CreateClubDomainCommand,
    ): PlatformAdminClubDomain
}

interface CheckClubDomainProvisioningUseCase {
    fun checkClubDomainProvisioning(
        admin: CurrentPlatformAdmin,
        domainId: UUID,
    ): PlatformAdminClubDomain
}

interface ListPlatformAdminClubsUseCase {
    fun listClubs(admin: CurrentPlatformAdmin): PlatformAdminClubList
}

interface UpdatePlatformAdminClubUseCase {
    fun updateClub(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
        command: UpdatePlatformAdminClubCommand,
    ): PlatformAdminClubListItem
}
