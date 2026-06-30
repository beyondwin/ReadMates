package com.readmates.shared.observability.slo

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class SloCatalogLoaderTest {
    @Test
    fun `loads valid catalog with eight SLOs`() {
        val catalog = SloCatalogLoader().loadFromClasspath("/slo/slos.yaml")
        assertEquals(1, catalog.version)
        assertEquals(8, catalog.slos.size)
        val ids = catalog.slos.map { it.id }.toSet()
        assertEquals(
            setOf(
                "api_availability",
                "api_read_latency_p95",
                "bff_api_p95",
                "frontend_route_load_p95",
                "frontend_runtime_error_ratio",
                "login_success_ratio",
                "notification_dispatch_success_ratio",
                "notification_delivery_latency_p95",
            ),
            ids,
        )
    }

    @Test
    fun `fails when ratio objective is out of range`() {
        val yaml =
            """
            version: 1
            slos:
              - id: bad_ratio
                description: invalid
                objective: 1.5
                window: 7d
                sli:
                  type: prometheus
                  query_good: sum(x)
                  query_total: sum(y)
            """.trimIndent()
        assertThrows<IllegalStateException> { SloCatalogLoader().loadFromString(yaml) }
    }

    @Test
    fun `fails when required field is missing`() {
        val yaml =
            """
            version: 1
            slos:
              - id: no_sli
                description: missing sli
                objective: 0.99
                window: 7d
            """.trimIndent()
        assertThrows<IllegalStateException> { SloCatalogLoader().loadFromString(yaml) }
    }
}
