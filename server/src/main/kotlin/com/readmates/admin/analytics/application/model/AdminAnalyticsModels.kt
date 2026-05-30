package com.readmates.admin.analytics.application.model

import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

enum class AnalyticsWindow(val days: Long, val wire: String) {
    LAST_7D(7, "7d"),
    LAST_30D(30, "30d"),
    LAST_90D(90, "90d"),
    ;

    companion object {
        fun fromWire(value: String?): AnalyticsWindow =
            entries.firstOrNull { it.wire == value } ?: LAST_30D
    }
}

enum class KpiKey { ACTIVE_MEMBERS, SESSION_COMPLETION, RSVP_RATE, AI_COST_PER_SESSION, NOTIFICATION_DELIVERY }

enum class KpiUnit { COUNT, PERCENT, USD }

enum class Availability { AVAILABLE, NOT_ENOUGH_DATA }

enum class DeltaDirection { UP, DOWN, FLAT, NONE }

// Raw aggregates from the adapter; the service derives rates/deltas/availability.
data class AdminAnalyticsRawAggregates(
    val sessionsCurrent: Int,
    val sessionsPrior: Int,
    val completedSessionsCurrent: Int,
    val completedSessionsPrior: Int,
    val participantsCurrent: Int,
    val participantsPrior: Int,
    val goingMaybeCurrent: Int,
    val goingMaybePrior: Int,
    val activeMembersCurrent: Int,
    val activeMembersPrior: Int,
    val aiCostCurrent: BigDecimal,
    val aiCostPrior: BigDecimal,
    val notifTerminalCurrent: Int,
    val notifSentCurrent: Int,
    val notifTerminalPrior: Int,
    val notifSentPrior: Int,
    val benchmark: List<AdminAnalyticsBenchmarkRaw>,
)

data class AdminAnalyticsBenchmarkRaw(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val activeMembers: Int,
    val sessions: Int,
    val completedSessions: Int,
    val participants: Int,
    val goingMaybe: Int,
    val aiCost: BigDecimal,
    val notifTerminal: Int,
    val notifSent: Int,
)

data class AdminAnalyticsOverview(
    val schema: String = "admin.analytics_overview.v1",
    val generatedAt: OffsetDateTime,
    val window: AnalyticsWindow,
    val kpis: List<AdminAnalyticsKpiCard>,
    val clubBenchmark: AdminAnalyticsBenchmark,
)

data class AdminAnalyticsKpiCard(
    val key: KpiKey,
    val unit: KpiUnit,
    val availability: Availability,
    val current: Double?,
    val prior: Double?,
    val deltaDirection: DeltaDirection,
)

data class AdminAnalyticsBenchmark(
    val availability: Availability,
    val rows: List<AdminAnalyticsBenchmarkRow>,
)

data class AdminAnalyticsBenchmarkRow(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val activeMembers: Int,
    val sessionCompletionRate: Double?,
    val rsvpRate: Double?,
    val aiCostUsd: String,
    val notificationDeliveryRate: Double?,
)
