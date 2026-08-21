package com.readmates.observability.application.service

import com.readmates.observability.application.model.FrontendApiFailureEvent
import com.readmates.observability.application.model.FrontendRouteLoadEvent
import com.readmates.observability.application.model.FrontendRuntimeErrorEvent
import com.readmates.observability.application.model.HostAttentionResultEvent
import com.readmates.observability.application.model.HostOperationsCardLoadEvent
import com.readmates.observability.application.model.HostScheduleDefaultsEvent
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration

class FrontendObservabilityServiceTest {
    @Test
    fun `records every supported frontend event and returns accepted count`() {
        val registry = SimpleMeterRegistry()
        val service = FrontendObservabilityService(FrontendObservabilityMetrics(registry))

        val result = service.record(supportedFrontendEvents())

        assertThat(result.accepted).isEqualTo(6)
        assertThat(result.dropped).isZero()
        assertThat(registry.find("readmates.frontend.route_load").timer()?.count()).isEqualTo(1)
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
        assertThat(registry.counter("host.schedule.defaults", "outcome", "success").count()).isEqualTo(1.0)
        assertThat(
            registry
                .counter(
                    "host.operations.card.load",
                    "card",
                    "club_readiness",
                    "outcome",
                    "error",
                ).count(),
        ).isEqualTo(1.0)
        assertThat(registry.find("host.attention.result.size").summary()?.totalAmount()).isEqualTo(3.0)
    }

    private fun supportedFrontendEvents() =
        listOf(
            FrontendRouteLoadEvent("/app", Duration.ofMillis(80), "LOAD", "success"),
            FrontendRuntimeErrorEvent("/admin", "render", "REACT_ROUTE_ERROR", "error"),
            FrontendApiFailureEvent("/clubs/:slug/app", "host-session", "5xx", "INTERNAL_ERROR"),
            HostScheduleDefaultsEvent("/app/host/sessions/new", "success"),
            HostOperationsCardLoadEvent(
                "/app/host/operations",
                "club_readiness",
                "error",
                Duration.ofMillis(40),
            ),
            HostAttentionResultEvent("/app/host/operations", 3),
        )

    @Test
    fun `records dropped frontend observability events`() {
        val registry = SimpleMeterRegistry()
        val service = FrontendObservabilityService(FrontendObservabilityMetrics(registry))

        service.recordDropped("invalid_route_pattern")

        assertThat(
            registry
                .counter(
                    "readmates.frontend.observability.dropped",
                    "reason",
                    "invalid_route_pattern",
                ).count(),
        ).isEqualTo(1.0)
    }
}
