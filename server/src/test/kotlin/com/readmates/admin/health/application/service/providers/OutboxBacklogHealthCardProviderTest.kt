package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardStatus
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.atomic.AtomicLong

class OutboxBacklogHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `status is OK and drill to admin notifications when backlog under warn`() {
        val registry = SimpleMeterRegistry()
        val backlog = AtomicLong(42L)
        Gauge
            .builder("readmates.notifications.outbox.backlog", backlog) { it.get().toDouble() }
            .tag("status", "pending")
            .register(registry)

        val card = OutboxBacklogHealthCardProvider(registry, clock).compute()

        assertThat(card.id).isEqualTo("outbox_backlog")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(42.0)
        assertThat(card.drill).isEqualTo(HealthCardDrill.AdminRoute("/admin/notifications?focus=outbox_backlog"))
    }

    @Test
    fun `status is WARN at warn threshold and CRIT at crit threshold`() {
        val registry = SimpleMeterRegistry()
        val backlog = AtomicLong(0L)
        Gauge
            .builder("readmates.notifications.outbox.backlog", backlog) { it.get().toDouble() }
            .tag("status", "pending")
            .register(registry)

        backlog.set(150L)
        assertThat(OutboxBacklogHealthCardProvider(registry, clock).compute().status)
            .isEqualTo(HealthCardStatus.WARN)

        backlog.set(1500L)
        assertThat(OutboxBacklogHealthCardProvider(registry, clock).compute().status)
            .isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status is UNKNOWN when pending gauge missing`() {
        val registry = SimpleMeterRegistry()
        val card = OutboxBacklogHealthCardProvider(registry, clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("outbox_gauge_unavailable")
    }
}
