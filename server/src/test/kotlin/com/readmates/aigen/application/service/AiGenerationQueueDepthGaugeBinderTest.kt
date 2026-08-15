package com.readmates.aigen.application.service

import com.readmates.aigen.application.port.`in`.AiGenerationQueueProbeSnapshot
import com.readmates.aigen.application.port.`in`.ReadAiGenerationQueueProbeSnapshotUseCase
import com.readmates.aigen.config.AiGenerationProperties
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant

class AiGenerationQueueDepthGaugeBinderTest {
    @Test
    fun `before first sample all dynamic gauges expose unavailable without probing`() {
        val registry = SimpleMeterRegistry()
        val metrics = AiGenerationMetrics(registry)
        var reads = 0
        val snapshot =
            ReadAiGenerationQueueProbeSnapshotUseCase {
                reads += 1
                AiGenerationQueueProbeSnapshot.unavailableBeforeFirstSample()
            }

        AiGenerationQueueDepthGaugeBinder(metrics, snapshot, AiGenerationProperties()).bind()

        assertThat(registry.find("readmates.aigen.queue.depth").gauge()!!.value()).isNaN()
        assertThat(registry.find("readmates.aigen.queue.probe.available").gauge()!!.value()).isZero()
        assertThat(
            registry.find("readmates.aigen.queue.probe.last.success.timestamp.seconds").gauge()!!.value(),
        ).isNaN()
        assertThat(registry.find("readmates.aigen.queue.probe.sample.interval.seconds").gauge()!!.value())
            .isEqualTo(30.0)
        assertThat(reads).isEqualTo(3)
    }

    @Test
    fun `gauge callbacks read one immutable snapshot and perform no outbound IO`() {
        var snapshotReads = 0
        val expectedAt = Instant.parse("2026-08-10T10:00:30Z")
        val snapshot =
            ReadAiGenerationQueueProbeSnapshotUseCase {
                snapshotReads += 1
                AiGenerationQueueProbeSnapshot(expectedAt, 12.0, true, expectedAt)
            }
        val registry = SimpleMeterRegistry()
        AiGenerationQueueDepthGaugeBinder(AiGenerationMetrics(registry), snapshot, AiGenerationProperties()).bind()

        val gauges =
            listOf(
                registry.find("readmates.aigen.queue.probe.last.success.timestamp.seconds").gauge()!!,
                registry.find("readmates.aigen.queue.depth").gauge()!!,
                registry.find("readmates.aigen.queue.probe.available").gauge()!!,
            )
        assertThat(gauges.map { it.value() })
            .containsExactly(expectedAt.epochSecond.toDouble(), 12.0, 1.0)
        assertThat(gauges.reversed().map { it.value() })
            .containsExactly(1.0, 12.0, expectedAt.epochSecond.toDouble())
        assertThat(snapshotReads).isEqualTo(6)
    }
}
