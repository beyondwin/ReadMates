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
}
