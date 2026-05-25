package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStatus
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AiGenerationQueueDepthGaugeBinderTest {
    @Test
    fun `gauge reflects PENDING plus RUNNING job count from job store`() {
        val registry = SimpleMeterRegistry()
        val metrics = AiGenerationMetrics(registry)
        val store = FakeJobStore()
        store.save(AiGenerationTestFixtures.jobRecord(status = JobStatus.PENDING))
        store.save(AiGenerationTestFixtures.jobRecord(status = JobStatus.PENDING))
        store.save(AiGenerationTestFixtures.jobRecord(status = JobStatus.RUNNING))
        store.save(AiGenerationTestFixtures.jobRecord(status = JobStatus.SUCCEEDED))

        AiGenerationQueueDepthGaugeBinder(metrics, store).bind()

        val gauge = registry.find("readmates.aigen.queue.depth").gauge()
        assertThat(gauge).isNotNull
        assertThat(gauge!!.value()).isEqualTo(3.0)
    }
}
