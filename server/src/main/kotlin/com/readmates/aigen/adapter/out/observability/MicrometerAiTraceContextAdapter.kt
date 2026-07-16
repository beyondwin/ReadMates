package com.readmates.aigen.adapter.out.observability

import com.readmates.aigen.application.port.out.AiTraceContextPort
import io.micrometer.tracing.Tracer
import org.springframework.stereotype.Component

@Component
class MicrometerAiTraceContextAdapter(
    private val tracer: Tracer,
) : AiTraceContextPort {
    override fun currentTraceId(): String? = tracer.currentSpan()?.context()?.traceId()
}
