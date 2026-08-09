package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.PlatformAdminHealthLocalReadingsPort
import com.readmates.admin.health.application.port.out.PlatformHealthProvider
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class RedisHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `status is OK when redis operation errors counter is zero`() {
        val provider = RedisHealthCardProvider(localReadings(redisErrors = 0.0), clock)
        val card = provider.compute()
        assertThat(provider.identity).isEqualTo(PlatformHealthProvider.REDIS)
        assertThat(card.id).isEqualTo("redis")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.0)
        assertThat(card.metric?.label).isEqualTo("process lifetime")
    }

    @Test
    fun `status is WARN when error count is moderately positive`() {
        val card = RedisHealthCardProvider(localReadings(redisErrors = 5.0), clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.WARN)
    }

    @Test
    fun `status is CRIT when error count is at or above crit threshold`() {
        val card = RedisHealthCardProvider(localReadings(redisErrors = 100.0), clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status is UNKNOWN when counter is absent`() {
        val card = RedisHealthCardProvider(localReadings(), clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("redis_metrics_unavailable")
    }
}

internal fun localReadings(
    redisErrors: Double? = null,
    dbPoolPending: Double? = null,
    outboxPending: Double? = null,
): PlatformAdminHealthLocalReadingsPort =
    object : PlatformAdminHealthLocalReadingsPort {
        override fun redisOperationErrorCount(): Double? = redisErrors

        override fun dbPoolPendingConnections(): Double? = dbPoolPending

        override fun outboxPendingBacklog(): Double? = outboxPending
    }
