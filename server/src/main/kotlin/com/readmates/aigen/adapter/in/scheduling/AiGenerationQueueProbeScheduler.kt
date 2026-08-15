@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.scheduling

import com.readmates.aigen.application.port.`in`.SampleAiGenerationQueueProbeUseCase
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "aigen.enabled"], havingValue = "true")
class AiGenerationQueueProbeScheduler(
    private val sampleQueueProbe: SampleAiGenerationQueueProbeUseCase,
) {
    @Scheduled(fixedDelayString = "\${readmates.aigen.job.queue-probe-fixed-delay:30s}")
    fun sample() {
        sampleQueueProbe.sample()
    }
}
