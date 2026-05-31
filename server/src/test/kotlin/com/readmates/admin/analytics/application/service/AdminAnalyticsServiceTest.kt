package com.readmates.admin.analytics.application.service

import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRaw
import com.readmates.admin.analytics.application.model.AdminAnalyticsRawAggregates
import com.readmates.admin.analytics.application.model.AdminAnalyticsSeriesRawPoint
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.model.Availability
import com.readmates.admin.analytics.application.model.DeltaDirection
import com.readmates.admin.analytics.application.model.KpiKey
import com.readmates.admin.analytics.application.model.KpiUnit
import com.readmates.admin.analytics.application.port.out.AdminAnalyticsAggregatePort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID

class AdminAnalyticsServiceTest {
    private val clock = Clock.fixed(Instant.parse("2026-05-30T00:00:00Z"), ZoneOffset.UTC)
    private val admin = CurrentPlatformAdmin(UUID.randomUUID(), "owner@example.com", PlatformAdminRole.OWNER)

    private fun service(raw: AdminAnalyticsRawAggregates) =
        AdminAnalyticsService(
            port =
                object : AdminAnalyticsAggregatePort {
                    override fun loadAggregates(window: AnalyticsWindow) = raw
                },
            clock = clock,
        )

    @Test
    fun `derives completion percent and upward delta`() {
        val raw = sample(sessionsCurrent = 10, completedCurrent = 8, sessionsPrior = 10, completedPrior = 5)
        val card =
            service(raw)
                .overview(admin, AnalyticsWindow.LAST_30D)
                .kpis
                .first { it.key == KpiKey.SESSION_COMPLETION }

        assertThat(card.availability).isEqualTo(Availability.AVAILABLE)
        assertThat(card.current).isEqualTo(80.0)
        assertThat(card.prior).isEqualTo(50.0)
        assertThat(card.deltaDirection).isEqualTo(DeltaDirection.UP)
    }

    @Test
    fun `marks not enough data when window has no sessions`() {
        val raw = sample(sessionsCurrent = 0, completedCurrent = 0, sessionsPrior = 0, completedPrior = 0)
        val card =
            service(raw)
                .overview(admin, AnalyticsWindow.LAST_7D)
                .kpis
                .first { it.key == KpiKey.SESSION_COMPLETION }

        assertThat(card.availability).isEqualTo(Availability.NOT_ENOUGH_DATA)
        assertThat(card.current).isNull()
        assertThat(card.deltaDirection).isEqualTo(DeltaDirection.NONE)
    }

    @Test
    fun `benchmark is not enough data when no rows`() {
        val overview = service(sample().copy(benchmark = emptyList())).overview(admin, AnalyticsWindow.LAST_30D)
        assertThat(overview.clubBenchmark.availability).isEqualTo(Availability.NOT_ENOUGH_DATA)
    }

    @Test
    fun `derives KPI series with unavailable buckets kept honest`() {
        val raw =
            sample().copy(
                series =
                    listOf(
                        AdminAnalyticsSeriesRawPoint(
                            bucketStart = LocalDate.parse("2026-05-01"),
                            sessions = 0,
                            completedSessions = 0,
                            participants = 0,
                            goingMaybe = 0,
                            activeMembers = 0,
                            aiCost = BigDecimal.ZERO,
                            notifTerminal = 0,
                            notifSent = 0,
                        ),
                        AdminAnalyticsSeriesRawPoint(
                            bucketStart = LocalDate.parse("2026-05-08"),
                            sessions = 4,
                            completedSessions = 3,
                            participants = 8,
                            goingMaybe = 6,
                            activeMembers = 5,
                            aiCost = BigDecimal("2.0000"),
                            notifTerminal = 10,
                            notifSent = 9,
                        ),
                    ),
            )

        val overview = service(raw).overview(admin, AnalyticsWindow.LAST_30D)

        assertThat(overview.series).hasSize(5)
        val completionSeries = overview.series.first { it.key == KpiKey.SESSION_COMPLETION }
        assertThat(completionSeries.unit).isEqualTo(KpiUnit.PERCENT)
        assertThat(completionSeries.points.map { it.bucketStart.toString() })
            .containsExactly("2026-05-01", "2026-05-08")
        assertThat(completionSeries.points[0].availability).isEqualTo(Availability.NOT_ENOUGH_DATA)
        assertThat(completionSeries.points[0].value).isNull()
        assertThat(completionSeries.points[1].availability).isEqualTo(Availability.AVAILABLE)
        assertThat(completionSeries.points[1].value).isEqualTo(75.0)

        val costSeries = overview.series.first { it.key == KpiKey.AI_COST_PER_SESSION }
        assertThat(costSeries.points[1].value).isEqualTo(0.5)
    }

    private fun sample(
        sessionsCurrent: Int = 4,
        completedCurrent: Int = 2,
        sessionsPrior: Int = 4,
        completedPrior: Int = 2,
    ) = AdminAnalyticsRawAggregates(
        sessionsCurrent = sessionsCurrent,
        sessionsPrior = sessionsPrior,
        completedSessionsCurrent = completedCurrent,
        completedSessionsPrior = completedPrior,
        participantsCurrent = 10,
        participantsPrior = 10,
        goingMaybeCurrent = 7,
        goingMaybePrior = 7,
        activeMembersCurrent = 5,
        activeMembersPrior = 5,
        aiCostCurrent = BigDecimal("2.0000"),
        aiCostPrior = BigDecimal("2.0000"),
        notifTerminalCurrent = 20,
        notifSentCurrent = 19,
        notifTerminalPrior = 20,
        notifSentPrior = 18,
        benchmark =
            listOf(
                AdminAnalyticsBenchmarkRaw(
                    clubId = UUID.randomUUID(),
                    slug = "club-a",
                    name = "Club A",
                    activeMembers = 5,
                    sessions = 4,
                    completedSessions = 2,
                    participants = 10,
                    goingMaybe = 7,
                    aiCost = BigDecimal("2.0000"),
                    notifTerminal = 20,
                    notifSent = 19,
                ),
            ),
    )
}
