package com.readmates.observability.application.service

import com.readmates.observability.application.model.FrontendApiFailureEvent
import com.readmates.observability.application.model.FrontendRouteLoadEvent
import com.readmates.observability.application.model.FrontendRuntimeErrorEvent
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration

class FrontendObservabilityServiceTest {
    @Test
    fun `records every supported frontend event and returns accepted count`() {
        val registry = SimpleMeterRegistry()
        val service = FrontendObservabilityService(FrontendObservabilityMetrics(registry))

        val result =
            service.record(
                listOf(
                    FrontendRouteLoadEvent("/app", Duration.ofMillis(80), "LOAD", "success"),
                    FrontendRuntimeErrorEvent("/admin", "render", "REACT_ROUTE_ERROR", "error"),
                    FrontendApiFailureEvent("/clubs/:slug/app", "host-session", "5xx", "INTERNAL_ERROR"),
                ),
            )

        assertThat(result.accepted).isEqualTo(3)
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
    }
}
