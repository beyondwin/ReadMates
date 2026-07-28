package com.readmates.shared.observability

import io.opentelemetry.proto.collector.metrics.v1.ExportMetricsServiceRequest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ProtobufJava25CompatibilityTest {
    @Test
    fun `OTLP protobuf serialization falls back when Unsafe memory access is denied`() {
        val payload =
            ExportMetricsServiceRequest
                .newBuilder()
                .build()
                .toByteArray()

        assertThat(payload).isEmpty()
    }
}
