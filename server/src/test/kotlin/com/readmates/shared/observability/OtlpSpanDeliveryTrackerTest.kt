package com.readmates.shared.observability

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import io.opentelemetry.api.trace.SpanContext
import io.opentelemetry.api.trace.TraceFlags
import io.opentelemetry.api.trace.TraceState
import io.opentelemetry.sdk.trace.ReadableSpan
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`

class OtlpSpanDeliveryTrackerTest {
    @Test
    fun `queue overflow lower bound is exported without span attributes`() {
        val registry = SimpleMeterRegistry()
        val tracker = OtlpSpanDeliveryTracker(registry, maxQueueSize = 2, maxBatchSize = 1)
        val span = mock(ReadableSpan::class.java)
        `when`(span.spanContext).thenReturn(
            SpanContext.create(
                "00000000000000000000000000000001",
                "0000000000000001",
                TraceFlags.getSampled(),
                TraceState.getDefault(),
            ),
        )

        repeat(5) { tracker.onEnd(span) }

        assertThat(registry.get("readmates.observability.otlp.queue.dropped.spans").counter().count())
            .isEqualTo(2.0)
    }
}
