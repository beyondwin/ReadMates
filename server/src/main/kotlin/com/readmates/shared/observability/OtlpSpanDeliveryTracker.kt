package com.readmates.shared.observability

import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import io.opentelemetry.context.Context
import io.opentelemetry.sdk.trace.ReadWriteSpan
import io.opentelemetry.sdk.trace.ReadableSpan
import io.opentelemetry.sdk.trace.SpanProcessor
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicLong

/**
 * Exposes a conservative lower bound for spans dropped before reaching the exporter.
 * Boot still owns the bounded BatchSpanProcessor; this supported extra processor counts sampled
 * span completions, while the exporter decorator acknowledges every exported or failed batch.
 */
@Component
internal class OtlpSpanDeliveryTracker(
    meterRegistry: MeterRegistry,
    @Value("\${management.opentelemetry.tracing.export.max-queue-size:2048}") maxQueueSize: Long,
    @Value("\${management.opentelemetry.tracing.export.max-batch-size:512}") maxBatchSize: Long,
) : SpanProcessor {
    private val boundedInFlightCapacity = maxQueueSize + maxBatchSize
    private val completed = AtomicLong()
    private val handled = AtomicLong()
    private val reportedDrops = AtomicLong()
    private val droppedCounter: Counter =
        Counter
            .builder(DROPPED_METRIC)
            .description("Lower bound of sampled spans dropped before OTLP export")
            .register(meterRegistry)

    override fun onStart(
        parentContext: Context,
        span: ReadWriteSpan,
    ) = Unit

    override fun isStartRequired(): Boolean = false

    override fun onEnd(span: ReadableSpan) {
        if (span.spanContext.isSampled) {
            completed.incrementAndGet()
            updateDroppedLowerBound()
        }
    }

    override fun isEndRequired(): Boolean = true

    fun recordHandled(spanCount: Int) {
        handled.addAndGet(spanCount.toLong())
        updateDroppedLowerBound()
    }

    private fun updateDroppedLowerBound() {
        val lowerBound = (completed.get() - handled.get() - boundedInFlightCapacity).coerceAtLeast(0)
        while (true) {
            val previous = reportedDrops.get()
            if (lowerBound <= previous) return
            if (reportedDrops.compareAndSet(previous, lowerBound)) {
                droppedCounter.increment((lowerBound - previous).toDouble())
                return
            }
        }
    }

    private companion object {
        const val DROPPED_METRIC = "readmates.observability.otlp.queue.dropped.spans"
    }
}
