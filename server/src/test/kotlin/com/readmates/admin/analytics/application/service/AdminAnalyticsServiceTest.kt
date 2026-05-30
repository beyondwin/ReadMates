package com.readmates.admin.analytics.application.service

import com.readmates.admin.analytics.application.model.AdminAnalyticsBenchmarkRaw
import com.readmates.admin.analytics.application.model.AdminAnalyticsRawAggregates
import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.admin.analytics.application.model.Availability
import com.readmates.admin.analytics.application.model.DeltaDirection
import com.readmates.admin.analytics.application.model.KpiKey
import com.readmates.admin.analytics.application.port.out.AdminAnalyticsAggregatePort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class AdminAnalyticsServiceTest {
    private val clock = Clock.fixed(Instant.parse("2026-05-30T00:00:00Z"), ZoneOffset.UTC)
    private val admin = CurrentPlatformAdmin(UUID.randomUUID(), "owner@example.com", PlatformAdminRole.OWNER)

    private fun service(raw: AdminAnalyticsRawAggregates) =
        AdminAnalyticsService(
            port = object : AdminAnalyticsAggregatePort {
                override fun loadAggregates(window: AnalyticsWindow) = raw
            },
            clock = clock,
        )

    @Test
    fun `derives completion percent and upward delta`() {
        val raw = sample(sessionsCurrent = 10, completedCurrent = 8, sessionsPrior = 10, completedPrior = 5)
        val card = service(raw).overview(admin, AnalyticsWindow.LAST_30D)
            .kpis.first { it.key == KpiKey.SESSION_COMPLETION }

        assertThat(card.availability).isEqualTo(Availability.AVAILABLE)
        assertThat(card.current).isEqualTo(80.0)
        assertThat(card.prior).isEqualTo(50.0)
        assertThat(card.deltaDirection).isEqualTo(DeltaDirection.UP)
    }

    @Test
    fun `marks not enough data when window has no sessions`() {
        val raw = sample(sessionsCurrent = 0, completedCurrent = 0, sessionsPrior = 0, completedPrior = 0)
        val card = service(raw).overview(admin, AnalyticsWindow.LAST_7D)
            .kpis.first { it.key == KpiKey.SESSION_COMPLETION }

        assertThat(card.availability).isEqualTo(Availability.NOT_ENOUGH_DATA)
        assertThat(card.current).isNull()
        assertThat(card.deltaDirection).isEqualTo(DeltaDirection.NONE)
    }

    @Test
    fun `benchmark is not enough data when no rows`() {
        val overview = service(sample().copy(benchmark = emptyList())).overview(admin, AnalyticsWindow.LAST_30D)
        assertThat(overview.clubBenchmark.availability).isEqualTo(Availability.NOT_ENOUGH_DATA)
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
        benchmark = listOf(
            AdminAnalyticsBenchmarkRaw(
                clubId = UUID.randomUUID(), slug = "club-a", name = "Club A",
                activeMembers = 5, sessions = 4, completedSessions = 2,
                participants = 10, goingMaybe = 7, aiCost = BigDecimal("2.0000"),
                notifTerminal = 20, notifSent = 19,
            ),
        ),
    )
}
