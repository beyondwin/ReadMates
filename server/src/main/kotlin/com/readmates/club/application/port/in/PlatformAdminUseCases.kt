package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.CreateClubDomainCommand
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.PlatformAdminDashboardSummary
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
