package com.readmates.club.application.service

import com.readmates.club.application.model.PlatformAdminDashboardSummary
import com.readmates.club.application.port.`in`.PlatformAdminSummaryUseCase
import com.readmates.club.application.port.out.LoadPlatformAdminSummaryPort
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service

@Service
class PlatformAdminService(
    private val summaryPort: LoadPlatformAdminSummaryPort,
) : PlatformAdminSummaryUseCase {
    override fun summary(admin: CurrentPlatformAdmin): PlatformAdminDashboardSummary =
        PlatformAdminDashboardSummary(
            platformRole = admin.role,
            activeClubCount = summaryPort.countActiveClubs(),
            domainActionRequiredCount = summaryPort.countDomainsRequiringAction(),
        )
}
