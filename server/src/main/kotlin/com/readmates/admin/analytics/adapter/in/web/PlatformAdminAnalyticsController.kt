@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.analytics.adapter.`in`.web

import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmark
import com.readmates.admin.analytics.application.model.AdminAnalyticsKpiCard
import com.readmates.admin.analytics.application.model.AdminAnalyticsKpiSeries
import com.readmates.admin.analytics.application.model.AdminAnalyticsOverview
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.port.`in`.ExportAdminAnalyticsCsvUseCase
import com.readmates.admin.analytics.application.port.`in`.GetAdminAnalyticsOverviewUseCase
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.toPlatformActor
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.nio.charset.StandardCharsets

@RestController
@RequestMapping("/api/admin/analytics")
class PlatformAdminAnalyticsController(
    private val useCase: GetAdminAnalyticsOverviewUseCase,
    private val csvExporter: ExportAdminAnalyticsCsvUseCase,
) {
    @GetMapping("/overview")
    @Suppress("MaxLineLength")
    fun overview(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) window: String?,
    ): AdminAnalyticsOverviewResponse = AdminAnalyticsOverviewResponse.from(useCase.overview(admin, AnalyticsWindow.fromWire(window)))

    @GetMapping("/export.csv", produces = ["text/csv; charset=utf-8"])
    fun exportCsv(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) window: String?,
    ): ResponseEntity<String> {
        if (!admin.toPlatformActor().can(PlatformCapability.EXPORT_ANALYTICS)) {
            throw AccessDeniedException("Platform admin cannot export analytics")
        }
        val export = csvExporter.export(useCase.overview(admin, AnalyticsWindow.fromWire(window)))
        return ResponseEntity
            .ok()
            .contentType(MediaType("text", "csv", StandardCharsets.UTF_8))
            .cacheControl(CacheControl.noStore())
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"${export.filename}\"")
            .body(export.content)
    }
}

data class AdminAnalyticsOverviewResponse(
    val schema: String,
    val generatedAt: String,
    val window: String,
    val kpis: List<AdminAnalyticsKpiCard>,
    val clubBenchmark: AdminAnalyticsBenchmark,
    val series: List<AdminAnalyticsKpiSeries>,
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
