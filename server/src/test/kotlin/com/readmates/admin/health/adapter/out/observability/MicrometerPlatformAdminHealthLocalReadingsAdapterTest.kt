package com.readmates.admin.health.adapter.out.observability

import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.concurrent.atomic.AtomicLong

class MicrometerPlatformAdminHealthLocalReadingsAdapterTest {
    @Test
    fun `reads the three existing local health metrics without changing their names or tags`() {
        val registry = SimpleMeterRegistry()
        val redisErrors = Counter.builder("readmates.redis.operation.errors").register(registry)
        redisErrors.increment(3.0)
        registry.gauge("hikaricp.connections.pending", 2.0)
        val backlog = AtomicLong(42)
        Gauge
            .builder("readmates.notifications.outbox.backlog", backlog) { value -> value.get().toDouble() }
            .tag("status", "pending")
            .register(registry)
        val adapter = MicrometerPlatformAdminHealthLocalReadingsAdapter(registry)

        assertThat(adapter.redisOperationErrorCount()).isEqualTo(3.0)
        assertThat(adapter.dbPoolPendingConnections()).isEqualTo(2.0)
        assertThat(adapter.outboxPendingBacklog()).isEqualTo(42.0)
    }

    @Test
    fun `returns null for every unavailable local health metric`() {
        val adapter = MicrometerPlatformAdminHealthLocalReadingsAdapter(SimpleMeterRegistry())

        assertThat(adapter.redisOperationErrorCount()).isNull()
        assertThat(adapter.dbPoolPendingConnections()).isNull()
        assertThat(adapter.outboxPendingBacklog()).isNull()
    }

    @Test
    fun `treats nonfinite event outbox backlog as unavailable instead of healthy zero`() {
        val registry = SimpleMeterRegistry()
        val backlog = doubleArrayOf(Double.NaN)
        Gauge
            .builder("readmates.notifications.outbox.backlog", backlog) { values -> values.single() }
            .tag("status", "pending")
            .register(registry)
        val adapter = MicrometerPlatformAdminHealthLocalReadingsAdapter(registry)

        assertThat(adapter.outboxPendingBacklog()).isNull()

        backlog[0] = Double.POSITIVE_INFINITY
        assertThat(adapter.outboxPendingBacklog()).isNull()
    }
}
