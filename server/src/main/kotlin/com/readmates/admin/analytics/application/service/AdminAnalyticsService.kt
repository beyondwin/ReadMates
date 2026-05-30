package com.readmates.admin.analytics.application.service

import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmark
import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRaw
import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRow
import com.readmates.admin.analytics.application.model.AdminAnalyticsKpiCard
import com.readmates.admin.analytics.application.model.AdminAnalyticsOverview
import com.readmates.admin.analytics.application.model.AdminAnalyticsRawAggregates
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.model.Availability
import com.readmates.admin.analytics.application.model.DeltaDirection
import com.readmates.admin.analytics.application.model.KpiKey
import com.readmates.admin.analytics.application.model.KpiUnit
import com.readmates.admin.analytics.application.port.`in`.GetAdminAnalyticsOverviewUseCase
import com.readmates.admin.analytics.application.port.out.AdminAnalyticsAggregatePort
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Clock
import java.time.OffsetDateTime

@Service
class AdminAnalyticsService(
    private val port: AdminAnalyticsAggregatePort,
    private val clock: Clock,
) : GetAdminAnalyticsOverviewUseCase {
    override fun overview(
        admin: CurrentPlatformAdmin,
        window: AnalyticsWindow,
    ): AdminAnalyticsOverview {
        val raw = port.loadAggregates(window)
        return AdminAnalyticsOverview(
            generatedAt = OffsetDateTime.now(clock),
            window = window,
            kpis = kpis(raw),
            clubBenchmark = benchmark(raw),
        )
    }

    private fun kpis(raw: AdminAnalyticsRawAggregates): List<AdminAnalyticsKpiCard> =
        listOf(
            count(
                KpiKey.ACTIVE_MEMBERS,
                hasCurrent = raw.sessionsCurrent > 0, hasPrior = raw.sessionsPrior > 0,
                current = raw.activeMembersCurrent, prior = raw.activeMembersPrior,
            ),
            percent(
                KpiKey.SESSION_COMPLETION,
                numCurrent = raw.completedSessionsCurrent, denCurrent = raw.sessionsCurrent,
                numPrior = raw.completedSessionsPrior, denPrior = raw.sessionsPrior,
            ),
            percent(
                KpiKey.RSVP_RATE,
                numCurrent = raw.goingMaybeCurrent, denCurrent = raw.participantsCurrent,
                numPrior = raw.goingMaybePrior, denPrior = raw.participantsPrior,
            ),
            costPerSession(raw),
            percent(
                KpiKey.NOTIFICATION_DELIVERY,
                numCurrent = raw.notifSentCurrent, denCurrent = raw.notifTerminalCurrent,
                numPrior = raw.notifSentPrior, denPrior = raw.notifTerminalPrior,
            ),
        )

    private fun count(key: KpiKey, hasCurrent: Boolean, hasPrior: Boolean, current: Int, prior: Int): AdminAnalyticsKpiCard {
        val cur = if (hasCurrent) current.toDouble() else null
        val pri = if (hasPrior) prior.toDouble() else null
        return AdminAnalyticsKpiCard(key, KpiUnit.COUNT, availability(hasCurrent), cur, pri, direction(cur, pri))
    }

    private fun percent(key: KpiKey, numCurrent: Int, denCurrent: Int, numPrior: Int, denPrior: Int): AdminAnalyticsKpiCard {
        val cur = ratePercent(numCurrent, denCurrent)
        val pri = ratePercent(numPrior, denPrior)
        return AdminAnalyticsKpiCard(key, KpiUnit.PERCENT, availability(denCurrent > 0), cur, pri, direction(cur, pri))
    }

    private fun costPerSession(raw: AdminAnalyticsRawAggregates): AdminAnalyticsKpiCard {
        val cur = perSession(raw.aiCostCurrent, raw.sessionsCurrent)
        val pri = perSession(raw.aiCostPrior, raw.sessionsPrior)
        return AdminAnalyticsKpiCard(KpiKey.AI_COST_PER_SESSION, KpiUnit.USD, availability(raw.sessionsCurrent > 0), cur, pri, direction(cur, pri))
    }

    private fun benchmark(raw: AdminAnalyticsRawAggregates): AdminAnalyticsBenchmark =
        AdminAnalyticsBenchmark(
            availability = if (raw.benchmark.isEmpty()) Availability.NOT_ENOUGH_DATA else Availability.AVAILABLE,
            rows = raw.benchmark.map(::benchmarkRow),
        )

    private fun benchmarkRow(r: AdminAnalyticsBenchmarkRaw) =
        AdminAnalyticsBenchmarkRow(
            clubId = r.clubId,
            slug = r.slug,
            name = r.name,
            activeMembers = r.activeMembers,
            sessionCompletionRate = ratePercent(r.completedSessions, r.sessions),
            rsvpRate = ratePercent(r.goingMaybe, r.participants),
            aiCostUsd = r.aiCost.setScale(COST_SCALE, RoundingMode.HALF_UP).toPlainString(),
            notificationDeliveryRate = ratePercent(r.notifSent, r.notifTerminal),
        )

    private fun availability(hasData: Boolean): Availability =
        if (hasData) Availability.AVAILABLE else Availability.NOT_ENOUGH_DATA

    private fun ratePercent(numerator: Int, denominator: Int): Double? =
        if (denominator <= 0) {
            null
        } else {
            BigDecimal(numerator * 100.0 / denominator).setScale(1, RoundingMode.HALF_UP).toDouble()
        }

    private fun perSession(cost: BigDecimal, sessions: Int): Double? =
        if (sessions <= 0) {
            null
        } else {
            cost.divide(BigDecimal(sessions), COST_SCALE, RoundingMode.HALF_UP).toDouble()
        }

    private fun direction(current: Double?, prior: Double?): DeltaDirection =
        when {
            current == null || prior == null -> DeltaDirection.NONE
            current > prior -> DeltaDirection.UP
            current < prior -> DeltaDirection.DOWN
            else -> DeltaDirection.FLAT
        }

    private companion object {
        const val COST_SCALE = 4
    }
}
