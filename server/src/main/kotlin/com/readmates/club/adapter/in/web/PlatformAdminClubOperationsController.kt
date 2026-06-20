@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminTodayClosingRiskItem
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import com.readmates.club.application.port.`in`.GetAdminClubOperationsUseCase
import com.readmates.club.application.port.`in`.ListAdminTodayClosingRisksUseCase
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/admin/clubs")
class PlatformAdminClubOperationsController(
    private val getAdminClubOperationsUseCase: GetAdminClubOperationsUseCase,
) {
    @GetMapping("/{clubId}/operations")
    fun operations(
        admin: CurrentPlatformAdmin,
        @PathVariable clubId: UUID,
    ): AdminClubOperationsSnapshotResponse =
        AdminClubOperationsSnapshotResponse.from(getAdminClubOperationsUseCase.operationsSnapshot(admin, clubId))
}

@RestController
@RequestMapping("/api/admin/today")
class PlatformAdminTodayClosingRisksController(
    private val listAdminTodayClosingRisksUseCase: ListAdminTodayClosingRisksUseCase,
) {
    @GetMapping("/closing-risks")
    fun closingRisks(admin: CurrentPlatformAdmin): AdminTodayClosingRiskSnapshotResponse =
        AdminTodayClosingRiskSnapshotResponse.from(listAdminTodayClosingRisksUseCase.todayClosingRisks(admin))
}

data class AdminClubOperationsSnapshotResponse(
    val schema: String,
    val generatedAt: String,
    val club: Any,
    val readiness: Any,
    val memberActivity: Any,
    val sessionProgress: Any,
    val notificationHealth: Any,
    val aiUsage: Any,
    val closingRisks: Any,
    val safeLinks: Any,
) {
    companion object {
        fun from(snapshot: AdminClubOperationsSnapshot): AdminClubOperationsSnapshotResponse =
            AdminClubOperationsSnapshotResponse(
                schema = snapshot.schema,
                generatedAt = snapshot.generatedAt.toString(),
                club = snapshot.club,
                readiness = snapshot.readiness,
                memberActivity = snapshot.memberActivity,
                sessionProgress = snapshot.sessionProgress,
                notificationHealth = snapshot.notificationHealth,
                aiUsage = snapshot.aiUsage,
                closingRisks = snapshot.closingRisks,
                safeLinks = snapshot.safeLinks,
            )
    }
}

data class AdminTodayClosingRiskSnapshotResponse(
    val schema: String,
    val generatedAt: String,
    val items: List<AdminTodayClosingRiskItem>,
) {
    companion object {
        fun from(snapshot: AdminTodayClosingRiskSnapshot): AdminTodayClosingRiskSnapshotResponse =
            AdminTodayClosingRiskSnapshotResponse(
                schema = snapshot.schema,
                generatedAt = snapshot.generatedAt.toString(),
                items = snapshot.items,
            )
    }
}
