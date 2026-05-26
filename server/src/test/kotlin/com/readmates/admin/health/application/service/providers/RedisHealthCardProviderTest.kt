package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardStatus
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class RedisHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `status is OK when redis operation errors counter is zero`() {
        val registry = SimpleMeterRegistry()
        Counter.builder("readmates.redis.operation.errors").register(registry)
        val card = RedisHealthCardProvider(registry, clock).compute()
        assertThat(card.id).isEqualTo("redis")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.0)
        assertThat(card.metric?.label).isEqualTo("process lifetime")
    }

    @Test
    fun `status is WARN when error count is moderately positive`() {
        val registry = SimpleMeterRegistry()
        val counter = Counter.builder("readmates.redis.operation.errors").register(registry)
        repeat(5) { counter.increment() }
        val card = RedisHealthCardProvider(registry, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.WARN)
    }

    @Test
    fun `status is CRIT when error count is at or above crit threshold`() {
        val registry = SimpleMeterRegistry()
        val counter = Counter.builder("readmates.redis.operation.errors").register(registry)
        repeat(100) { counter.increment() }
        val card = RedisHealthCardProvider(registry, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status is UNKNOWN when counter is absent`() {
        val registry = SimpleMeterRegistry()
        val card = RedisHealthCardProvider(registry, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("redis_metrics_unavailable")
    }
}
