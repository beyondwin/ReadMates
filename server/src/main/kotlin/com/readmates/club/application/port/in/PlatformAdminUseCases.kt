package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.PlatformAdminDashboardSummary
import com.readmates.shared.security.CurrentPlatformAdmin

interface PlatformAdminSummaryUseCase {
    fun summary(admin: CurrentPlatformAdmin): PlatformAdminDashboardSummary
}
