package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import jakarta.annotation.PostConstruct
import org.springframework.stereotype.Component

/**
 * Binds the `readmates.aigen.queue.depth` gauge to a live supplier backed by
 * `AiGenerationJobStore.loadActiveJobs()`. The gauge reports the count of jobs
 * whose status is PENDING or RUNNING — i.e. the AI generation pipeline backlog
 * the operator cares about for `AiGenQueueLagHigh`.
 *
 * The supplier is invoked each time Prometheus scrapes (~30s). `loadActiveJobs`
 * caps at 200 to keep the call O(1) on cardinality; if the real backlog ever
 * exceeds 200 the gauge under-reports — the alert threshold (50) fires far
 * earlier so this is safe in practice.
 */
@Component
class AiGenerationQueueDepthGaugeBinder(
    private val metrics: AiGenerationMetrics,
    private val jobStore: AiGenerationJobStore,
) {
    @PostConstruct
    fun bind() {
        metrics.registerQueueDepthGauge {
            jobStore
                .loadActiveJobs(QUEUE_DEPTH_PROBE_LIMIT)
                .count { it.status == JobStatus.PENDING || it.status == JobStatus.RUNNING }
        }
    }

    companion object {
        private const val QUEUE_DEPTH_PROBE_LIMIT = 200
    }
}
