package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.PlatformAdminDashboardSummary
import com.readmates.club.application.port.`in`.PlatformAdminSummaryUseCase
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/admin")
class PlatformAdminController(
    private val platformAdminSummaryUseCase: PlatformAdminSummaryUseCase,
) {
    @GetMapping("/summary")
    fun summary(admin: CurrentPlatformAdmin): PlatformAdminSummaryResponse =
        PlatformAdminSummaryResponse.from(platformAdminSummaryUseCase.summary(admin))
}

data class PlatformAdminSummaryResponse(
    val platformRole: String,
    val activeClubCount: Long,
    val domainActionRequiredCount: Long,
) {
    companion object {
        fun from(summary: PlatformAdminDashboardSummary): PlatformAdminSummaryResponse =
            PlatformAdminSummaryResponse(
                platformRole = summary.platformRole.name,
                activeClubCount = summary.activeClubCount,
                domainActionRequiredCount = summary.domainActionRequiredCount,
            )
    }
}
