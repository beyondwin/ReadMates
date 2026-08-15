package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.PlatformHealthProvider
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class DbPoolHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `status is OK when hikari pending is zero`() {
        val provider = DbPoolHealthCardProvider(localReadings(dbPoolPending = 0.0), clock)
        val card = provider.compute()

        assertThat(provider.identity).isEqualTo(PlatformHealthProvider.DB_POOL)
        assertThat(card.id).isEqualTo("db_pool")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.0)
        assertThat(card.thresholds?.warn).isEqualTo(1.0)
        assertThat(card.thresholds?.crit).isEqualTo(5.0)
        assertThat(card.reason).isNull()
    }

    @Test
    fun `status is WARN when hikari pending is between warn and crit`() {
        val card = DbPoolHealthCardProvider(localReadings(dbPoolPending = 2.0), clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.WARN)
    }

    @Test
    fun `status is CRIT when hikari pending is at or above crit`() {
        assertThat(DbPoolHealthCardProvider(localReadings(dbPoolPending = 5.0), clock).compute().status)
            .isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status is UNKNOWN when hikari gauge is absent`() {
        val card = DbPoolHealthCardProvider(localReadings(), clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("hikari_gauge_unavailable")
    }
}
