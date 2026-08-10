package com.readmates.aigen.application.service

import com.readmates.aigen.application.port.`in`.ReadAiGenerationQueueProbeSnapshotUseCase
import com.readmates.aigen.config.AiGenerationProperties
import jakarta.annotation.PostConstruct
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * Binds I/O-free gauges to the application-owned immutable queue-probe snapshot.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "aigen.enabled"], havingValue = "true")
class AiGenerationQueueDepthGaugeBinder(
    private val metrics: AiGenerationMetrics,
    private val snapshots: ReadAiGenerationQueueProbeSnapshotUseCase,
    private val properties: AiGenerationProperties,
) {
    @PostConstruct
    fun bind() {
        metrics.registerQueueProbeGauges(snapshots::readSnapshot, properties.job.queueProbeFixedDelay)
    }
}
