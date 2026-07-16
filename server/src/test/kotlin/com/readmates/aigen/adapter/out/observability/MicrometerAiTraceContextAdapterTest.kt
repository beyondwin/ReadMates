package com.readmates.aigen.adapter.out.observability

import io.micrometer.tracing.Span
import io.micrometer.tracing.TraceContext
import io.micrometer.tracing.Tracer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`

class MicrometerAiTraceContextAdapterTest {
    @Test
    fun `returns the current span trace id without starting a span`() {
        val tracer = mock(Tracer::class.java)
        val span = mock(Span::class.java)
        val context = mock(TraceContext::class.java)
        `when`(tracer.currentSpan()).thenReturn(span)
        `when`(span.context()).thenReturn(context)
        `when`(context.traceId()).thenReturn("0123456789abcdef0123456789abcdef")

        val traceId = MicrometerAiTraceContextAdapter(tracer).currentTraceId()

        assertThat(traceId).isEqualTo("0123456789abcdef0123456789abcdef")
        verify(tracer, never()).nextSpan()
        verify(tracer, never()).startScopedSpan(org.mockito.ArgumentMatchers.anyString())
    }

    @Test
    fun `returns null outside a trace without starting a span`() {
        val tracer = mock(Tracer::class.java)
        `when`(tracer.currentSpan()).thenReturn(null)

        val traceId = MicrometerAiTraceContextAdapter(tracer).currentTraceId()

        assertThat(traceId).isNull()
        verify(tracer, never()).nextSpan()
        verify(tracer, never()).startScopedSpan(org.mockito.ArgumentMatchers.anyString())
    }
}
