@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.scheduling

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.aigen.application.model.AiGenerationRecoveryResult
import com.readmates.aigen.application.port.`in`.RecoverStalledAiGenerationJobsUseCase
import com.readmates.aigen.config.AiGenerationProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
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

class AiGenerationFailureRecoverySchedulerTest {
    @Test
    fun `scheduled recovery calls only the recovery input port once`() {
        var calls = 0
        val scheduler =
            AiGenerationFailureRecoveryScheduler(
                object : RecoverStalledAiGenerationJobsUseCase {
                    override fun recoverStalledBatch(): List<AiGenerationRecoveryResult> {
                        calls += 1
                        return listOf(AiGenerationRecoveryResult.RECOVERED_PENDING)
                    }
                },
            )

        scheduler.recover()

        assertThat(calls).isEqualTo(1)
        assertThat(
            AiGenerationFailureRecoveryScheduler::class.java.declaredConstructors
                .single()
                .parameterTypes,
        ).containsExactly(RecoverStalledAiGenerationJobsUseCase::class.java)
    }

    @Test
    fun `unexpected wave failure logs one fixed safe result and a later invocation still runs`() {
        var calls = 0
        val scheduler =
            AiGenerationFailureRecoveryScheduler(
                object : RecoverStalledAiGenerationJobsUseCase {
                    override fun recoverStalledBatch(): List<AiGenerationRecoveryResult> {
                        calls += 1
                        if (calls == 1) throw IllegalStateException("private redis endpoint")
                        return emptyList()
                    }
                },
            )
        val logger = LoggerFactory.getLogger(AiGenerationFailureRecoveryScheduler::class.java) as Logger
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(appender)
        try {
            assertThatCode(scheduler::recover).doesNotThrowAnyException()
            assertThatCode(scheduler::recover).doesNotThrowAnyException()
        } finally {
            logger.detachAppender(appender)
            appender.stop()
        }

        assertThat(calls).isEqualTo(2)
        assertThat(appender.list).hasSize(1)
        assertThat(appender.list.single().level).isEqualTo(Level.WARN)
        assertThat(appender.list.single().formattedMessage)
            .isEqualTo("Scheduled AI generation recovery failed result=failed")
        assertThat(appender.list.single().formattedMessage).doesNotContain("private redis endpoint")
        assertThat(appender.list.single().throwableProxy).isNull()
    }

    @Test
    fun `scheduled annotation uses the typed recovery delay property`() {
        val scheduled =
            AiGenerationFailureRecoveryScheduler::class.java
                .getDeclaredMethod("recover")
                .getAnnotation(Scheduled::class.java)

        assertThat(scheduled.fixedDelayString)
            .isEqualTo("\${readmates.aigen.job.recovery-fixed-delay:1m}")
    }

    @Test
    fun `configured typed recovery delay reaches the actual scheduled task`() {
        ApplicationContextRunner()
            .withUserConfiguration(FailureRecoverySchedulerContextConfiguration::class.java)
            .withBean(RecoverStalledAiGenerationJobsUseCase::class.java, {
                object : RecoverStalledAiGenerationJobsUseCase {
                    override fun recoverStalledBatch(): List<AiGenerationRecoveryResult> = emptyList()
                }
            })
            .withPropertyValues(
                "readmates.redis.enabled=true",
                "readmates.aigen.enabled=true",
                "readmates.aigen.job.recovery-fixed-delay=2s",
            ).run { context ->
                assertThat(context).hasNotFailed()
                assertThat(context.getBean(AiGenerationProperties::class.java).job.recoveryFixedDelay)
                    .isEqualTo(Duration.ofSeconds(2))
                assertThat(fixedDelay(context)).isEqualTo(Duration.ofSeconds(2))
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
@Import(AiGenerationFailureRecoveryScheduler::class)
private class FailureRecoverySchedulerContextConfiguration
