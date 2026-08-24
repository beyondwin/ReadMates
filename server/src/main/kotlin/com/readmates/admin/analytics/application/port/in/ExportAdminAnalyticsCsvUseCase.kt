@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.analytics.application.port.`in`

import com.readmates.admin.analytics.application.model.AdminAnalyticsOverview

data class AdminAnalyticsCsvExport(
    val filename: String,
    val content: String,
)

fun interface ExportAdminAnalyticsCsvUseCase {
    fun export(overview: AdminAnalyticsOverview): AdminAnalyticsCsvExport
}
