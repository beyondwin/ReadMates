@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.analytics.adapter.`in`.web

import com.readmates.admin.analytics.application.model.AdminAnalyticsOverview
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.port.`in`.GetAdminAnalyticsOverviewUseCase
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/admin/analytics")
class PlatformAdminAnalyticsController(
    private val useCase: GetAdminAnalyticsOverviewUseCase,
) {
    @GetMapping("/overview")
    @Suppress("MaxLineLength")
    fun overview(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) window: String?,
    ): AdminAnalyticsOverviewResponse = AdminAnalyticsOverviewResponse.from(useCase.overview(admin, AnalyticsWindow.fromWire(window)))
}

data class AdminAnalyticsOverviewResponse(
    val schema: String,
    val generatedAt: String,
    val window: String,
    val kpis: Any,
    val clubBenchmark: Any,
    val series: Any,
) {
    companion object {
        fun from(overview: AdminAnalyticsOverview): AdminAnalyticsOverviewResponse =
            AdminAnalyticsOverviewResponse(
                schema = overview.schema,
                generatedAt = overview.generatedAt.toString(),
                window = overview.window.wire,
                kpis = overview.kpis,
                clubBenchmark = overview.clubBenchmark,
                series = overview.series,
            )
    }
}
