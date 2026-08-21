package com.readmates.observability.application.service

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration
import java.util.concurrent.TimeUnit

class FrontendObservabilityMetricsTest {
    @Test
    fun `route load records timer with safe labels only`() {
        val registry = SimpleMeterRegistry()
        val metrics = FrontendObservabilityMetrics(registry)

        metrics.recordRouteLoad("/clubs/:slug/app", "success", "LOAD", Duration.ofMillis(1250))

        val timer =
            registry
                .find("readmates.frontend.route_load")
                .tag("route_pattern", "/clubs/:slug/app")
                .tag("result", "success")
                .tag("navigation_type", "LOAD")
                .timer()

        assertThat(timer).isNotNull
        assertThat(timer!!.count()).isEqualTo(1)
        assertThat(timer.totalTime(TimeUnit.MILLISECONDS)).isEqualTo(1250.0)
        assertThat(timer.id.tags.map { it.key })
            .containsExactlyInAnyOrder("route_pattern", "result", "navigation_type")
    }

    @Test
    fun `runtime api and dropped counters use allowlisted tag names`() {
        val registry = SimpleMeterRegistry()
        val metrics = FrontendObservabilityMetrics(registry)

        metrics.recordRuntimeError("/admin", "render", "REACT_ROUTE_ERROR", "error")
        metrics.recordApiFailure("/clubs/:slug/app", "host-session", "5xx", "INTERNAL_ERROR")
        metrics.recordDropped("invalid_route_pattern")

        assertThat(
            registry
                .counter(
                    "readmates.frontend.runtime_errors",
                    "route_pattern",
                    "/admin",
                    "error_kind",
                    "render",
                    "error_code",
                    "REACT_ROUTE_ERROR",
                    "severity",
                    "error",
                ).count(),
        ).isEqualTo(1.0)
        assertThat(
            registry
                .counter(
                    "readmates.frontend.api_failures",
                    "route_pattern",
                    "/clubs/:slug/app",
                    "api_group",
                    "host-session",
                    "status_class",
                    "5xx",
                    "error_code",
                    "INTERNAL_ERROR",
                ).count(),
        ).isEqualTo(1.0)
        assertThat(
            registry.counter("readmates.frontend.observability.dropped", "reason", "invalid_route_pattern").count(),
        ).isEqualTo(1.0)
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { it.key } })
            .doesNotContain("email", "user_id", "club_id", "session_id", "url", "message", "stack")
    }

    @Test
    fun `host operation meters use approved enums and outcomes only`() {
        val registry = SimpleMeterRegistry()
        val metrics = FrontendObservabilityMetrics(registry)

        metrics.recordHostScheduleDefaults("legacy_404")
        metrics.recordHostOperationsCardLoad("notifications", "error", Duration.ofMillis(250))
        metrics.recordHostAttentionResult(7)

        assertThat(registry.counter("host.schedule.defaults", "outcome", "legacy_404").count()).isEqualTo(1.0)
        assertThat(
            registry
                .counter(
                    "host.operations.card.load",
                    "card",
                    "notifications",
                    "outcome",
                    "error",
                ).count(),
        ).isEqualTo(1.0)
        val timer =
            registry
                .find("host.operations.card.load.duration")
                .tag("card", "notifications")
                .tag("outcome", "error")
                .timer()
        assertThat(timer).isNotNull
        assertThat(timer!!.count()).isEqualTo(1)
        assertThat(timer.totalTime(TimeUnit.MILLISECONDS)).isEqualTo(250.0)
        assertThat(registry.find("host.attention.result.size").summary()?.count()).isEqualTo(1)
        assertThat(registry.find("host.attention.result.size").summary()?.totalAmount()).isEqualTo(7.0)
        assertThat(registry.meters.map { it.id.name })
            .contains(
                "host.schedule.defaults",
                "host.operations.card.load",
                "host.operations.card.load.duration",
                "host.attention.result.size",
            )
        assertThat(registry.meters.flatMap { meter -> meter.id.tags.map { it.key } }.toSet())
            .doesNotContain(
                "club_id",
                "session_id",
                "membership_id",
                "request_id",
                "note",
                "passcode",
                "has_passcode",
                "url",
            )
        assertThat(
            registry
                .find("host.schedule.defaults")
                .counter()!!
                .id.tags
                .map { it.key },
        ).containsExactly("outcome")
        assertThat(
            registry
                .find("host.operations.card.load")
                .counter()!!
                .id.tags
                .map { it.key }
                .toSet(),
        ).containsExactlyInAnyOrder("card", "outcome")
    }
}
