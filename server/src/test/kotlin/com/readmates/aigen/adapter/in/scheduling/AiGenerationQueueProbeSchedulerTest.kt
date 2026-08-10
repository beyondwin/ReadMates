@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.scheduling

import com.readmates.aigen.application.port.`in`.SampleAiGenerationQueueProbeUseCase
import com.readmates.aigen.config.AiGenerationProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.assertj.AssertableApplicationContext
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Import
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor
import org.springframework.scheduling.config.FixedDelayTask
import java.time.Duration

class AiGenerationQueueProbeSchedulerTest {
    @Test
    fun `scheduled queue probe calls only the sample input port once`() {
        var calls = 0
        val scheduler = AiGenerationQueueProbeScheduler(SampleAiGenerationQueueProbeUseCase { calls += 1 })

        scheduler.sample()

        assertThat(calls).isEqualTo(1)
        assertThat(
            AiGenerationQueueProbeScheduler::class.java.declaredConstructors
                .single()
                .parameterTypes,
        ).containsExactly(SampleAiGenerationQueueProbeUseCase::class.java)
    }

    @Test
    fun `scheduled annotation uses the typed queue probe delay property`() {
        val scheduled =
            AiGenerationQueueProbeScheduler::class.java
                .getDeclaredMethod("sample")
                .getAnnotation(Scheduled::class.java)

        assertThat(scheduled.fixedDelayString)
            .isEqualTo("\${readmates.aigen.job.queue-probe-fixed-delay:30s}")
    }

    @Test
    fun `configured typed probe delay reaches the actual scheduled task`() {
        ApplicationContextRunner()
            .withUserConfiguration(QueueProbeSchedulerContextConfiguration::class.java)
            .withBean(SampleAiGenerationQueueProbeUseCase::class.java, {
                SampleAiGenerationQueueProbeUseCase {}
            })
            .withPropertyValues(
                "readmates.redis.enabled=true",
                "readmates.aigen.enabled=true",
                "readmates.aigen.job.queue-probe-fixed-delay=7s",
            ).run { context ->
                assertThat(context).hasNotFailed()
                assertThat(context.getBean(AiGenerationProperties::class.java).job.queueProbeFixedDelay)
                    .isEqualTo(Duration.ofSeconds(7))
                assertThat(fixedDelay(context)).isEqualTo(Duration.ofSeconds(7))
            }
    }

    private fun fixedDelay(context: AssertableApplicationContext): Duration {
        val tasks = context.getBean(ScheduledAnnotationBeanPostProcessor::class.java).scheduledTasks
        assertThat(tasks).hasSize(1)
        return (tasks.single().task as FixedDelayTask).intervalDuration
    }
}

@TestConfiguration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(AiGenerationProperties::class)
@Import(AiGenerationQueueProbeScheduler::class)
private class QueueProbeSchedulerContextConfiguration
