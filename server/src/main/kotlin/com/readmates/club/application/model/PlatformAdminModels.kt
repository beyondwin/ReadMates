package com.readmates.club.application.model

import com.readmates.club.domain.PlatformAdminRole

data class PlatformAdminDashboardSummary(
    val platformRole: PlatformAdminRole,
    val activeClubCount: Long,
    val domainActionRequiredCount: Long,
)
