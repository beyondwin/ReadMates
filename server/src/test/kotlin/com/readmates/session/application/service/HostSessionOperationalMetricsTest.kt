package com.readmates.session.application.service

import com.readmates.session.application.model.HostSessionLifecycleAction
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class HostSessionOperationalMetricsTest {
    @Test
    fun `lifecycle counters use action and outcome labels only`() {
        val registry = SimpleMeterRegistry()
        val metrics = HostSessionOperationalMetrics(registry)

        metrics.lifecycle(HostSessionLifecycleAction.OPENED, "changed")
        metrics.lifecycle(HostSessionLifecycleAction.REOPENED, "unchanged")
        metrics.lifecycle(HostSessionLifecycleAction.UNPUBLISHED, "failure")

        assertThat(
            registry
                .counter("session.lifecycle.transition", "action", "OPENED", "outcome", "changed")
                .count(),
        ).isEqualTo(1.0)
        assertThat(
            registry
                .counter("session.lifecycle.transition", "action", "REOPENED", "outcome", "unchanged")
                .count(),
        ).isEqualTo(1.0)
        assertThat(
            registry
                .counter("session.lifecycle.transition", "action", "UNPUBLISHED", "outcome", "failure")
                .count(),
        ).isEqualTo(1.0)
        assertThat(registry.meters.map { it.id.name }.distinct()).containsExactly("session.lifecycle.transition")
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { it.key } }.toSet())
            .containsExactlyInAnyOrder("action", "outcome")
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { it.value } }.toSet())
            .containsExactlyInAnyOrder("OPENED", "changed", "REOPENED", "unchanged", "UNPUBLISHED", "failure")
    }

    @Test
    fun `legacy reason counter has no labels`() {
        val registry = SimpleMeterRegistry()
        val metrics = HostSessionOperationalMetrics(registry)

        metrics.legacyReason()
        metrics.legacyReason()

        assertThat(registry.counter("session.lifecycle.legacy.reason").count()).isEqualTo(2.0)
        assertThat(
            registry
                .get("session.lifecycle.legacy.reason")
                .counter()
                .id.tags,
        ).isEmpty()
    }
}
