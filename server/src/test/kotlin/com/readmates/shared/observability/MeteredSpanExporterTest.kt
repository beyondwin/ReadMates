package com.readmates.shared.observability

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import io.opentelemetry.sdk.common.CompletableResultCode
import io.opentelemetry.sdk.trace.data.SpanData
import io.opentelemetry.sdk.trace.export.SpanExporter
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.ObjectProvider

class MeteredSpanExporterTest {
    @Test
    fun `counts exported and failed spans without content or identifier labels`() {
        val registry = SimpleMeterRegistry()
        val success = MeteredSpanExporter(StubSpanExporter(succeeds = true), registry)
        val failure = MeteredSpanExporter(StubSpanExporter(succeeds = false), registry)
        val spans = List(3) { mock(SpanData::class.java) }

        success.export(spans)
        failure.export(spans)

        assertThat(
            registry
                .find("readmates.observability.otlp.export.spans")
                .tag("status", "exported")
                .counter()
                ?.count(),
        ).isEqualTo(3.0)
        assertThat(
            registry
                .find("readmates.observability.otlp.export.spans")
                .tag("status", "failed")
                .counter()
                ?.count(),
        ).isEqualTo(3.0)
        registry.meters.forEach { meter ->
            assertThat(meter.id.tags.map { it.key }).containsExactly("status")
        }
    }

    @Test
    fun `post processor leaves contexts without exporters untouched and lazily decorates exporters`() {
        @Suppress("UNCHECKED_CAST")
        val provider = mock(ObjectProvider::class.java) as ObjectProvider<io.micrometer.core.instrument.MeterRegistry>
        val registry = SimpleMeterRegistry()
        `when`(provider.getIfAvailable()).thenReturn(registry)
        @Suppress("UNCHECKED_CAST")
        val trackers = mock(ObjectProvider::class.java) as ObjectProvider<OtlpSpanDeliveryTracker>
        `when`(trackers.getIfAvailable()).thenReturn(null)
        val processor = MeteredSpanExporterBeanPostProcessor(provider, trackers)
        val unrelated = Any()

        assertThat(processor.postProcessAfterInitialization(unrelated, "unrelated")).isSameAs(unrelated)

        val delegate = StubSpanExporter(succeeds = true)
        val decorated = processor.postProcessAfterInitialization(delegate, "otlpExporter")
        assertThat(decorated).isInstanceOf(MeteredSpanExporter::class.java)
        assertThat(decorated).isNotSameAs(delegate)
    }

    private class StubSpanExporter(
        private val succeeds: Boolean,
    ) : SpanExporter {
        override fun export(spans: Collection<SpanData>): CompletableResultCode =
            if (succeeds) CompletableResultCode.ofSuccess() else CompletableResultCode.ofFailure()

        override fun flush(): CompletableResultCode = CompletableResultCode.ofSuccess()

        override fun shutdown(): CompletableResultCode = CompletableResultCode.ofSuccess()
    }
}
