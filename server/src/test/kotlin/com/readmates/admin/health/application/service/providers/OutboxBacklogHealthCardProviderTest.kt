package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.PlatformHealthProvider
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class OutboxBacklogHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `status is OK and drill to admin notifications when backlog under warn`() {
        val provider = OutboxBacklogHealthCardProvider(localReadings(outboxPending = 42.0), clock)
        val card = provider.compute()

        assertThat(provider.identity).isEqualTo(PlatformHealthProvider.OUTBOX_BACKLOG)
        assertThat(card.id).isEqualTo("outbox_backlog")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(42.0)
        assertThat(card.drill).isEqualTo(HealthCardDrill.AdminRoute("/admin/notifications?focus=outbox_backlog"))
    }

    @Test
    fun `status is WARN at warn threshold and CRIT at crit threshold`() {
        assertThat(OutboxBacklogHealthCardProvider(localReadings(outboxPending = 150.0), clock).compute().status)
            .isEqualTo(HealthCardStatus.WARN)

        assertThat(OutboxBacklogHealthCardProvider(localReadings(outboxPending = 1500.0), clock).compute().status)
            .isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status is UNKNOWN when pending gauge missing`() {
        val card = OutboxBacklogHealthCardProvider(localReadings(), clock).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("outbox_gauge_unavailable")
    }
}
