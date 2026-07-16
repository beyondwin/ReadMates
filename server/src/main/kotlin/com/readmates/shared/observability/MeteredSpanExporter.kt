package com.readmates.shared.observability

import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import io.opentelemetry.sdk.common.CompletableResultCode
import io.opentelemetry.sdk.trace.data.SpanData
import io.opentelemetry.sdk.trace.export.SpanExporter
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.config.BeanPostProcessor
import org.springframework.stereotype.Component

internal class MeteredSpanExporter(
    private val delegate: SpanExporter,
    private val meterRegistry: () -> MeterRegistry?,
    private val deliveryTracker: OtlpSpanDeliveryTracker? = null,
) : SpanExporter {
    constructor(delegate: SpanExporter, meterRegistry: MeterRegistry) : this(delegate, { meterRegistry })

    override fun export(spans: Collection<SpanData>): CompletableResultCode {
        val result = delegate.export(spans)
        result.whenComplete {
            deliveryTracker?.recordHandled(spans.size)
            val status = if (result.isSuccess) STATUS_EXPORTED else STATUS_FAILED
            meterRegistry()?.let { registry -> counter(registry, status).increment(spans.size.toDouble()) }
        }
        return result
    }

    override fun flush(): CompletableResultCode = delegate.flush()

    override fun shutdown(): CompletableResultCode = delegate.shutdown()

    private fun counter(
        registry: MeterRegistry,
        status: String,
    ): Counter =
        Counter
            .builder(METRIC_NAME)
            .description("Spans handed to the OTLP exporter by bounded outcome")
            .tag(TAG_STATUS, status)
            .register(registry)

    private companion object {
        const val METRIC_NAME = "readmates.observability.otlp.export.spans"
        const val TAG_STATUS = "status"
        const val STATUS_EXPORTED = "exported"
        const val STATUS_FAILED = "failed"
    }
}

/**
 * Decorates Boot-managed exporters after creation, preserving the supported
 * exporter auto-configuration seam and its bounded asynchronous processor.
 */
@Component
internal class MeteredSpanExporterBeanPostProcessor(
    private val meterRegistries: ObjectProvider<MeterRegistry>,
    private val deliveryTrackers: ObjectProvider<OtlpSpanDeliveryTracker>,
) : BeanPostProcessor {
    override fun postProcessAfterInitialization(
        bean: Any,
        beanName: String,
    ): Any =
        if (bean is SpanExporter && bean !is MeteredSpanExporter) {
            MeteredSpanExporter(bean, { meterRegistries.getIfAvailable() }, deliveryTrackers.getIfAvailable())
        } else {
            bean
        }
}
