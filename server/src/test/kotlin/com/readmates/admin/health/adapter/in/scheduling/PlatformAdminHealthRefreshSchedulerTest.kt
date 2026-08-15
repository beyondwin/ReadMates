@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.health.adapter.`in`.scheduling

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import com.readmates.admin.health.application.model.PlatformHealthView
import com.readmates.admin.health.application.port.`in`.RefreshPlatformAdminHealthUseCase
import com.readmates.admin.health.config.PlatformAdminHealthProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.assertj.AssertableApplicationContext
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor
import org.springframework.scheduling.config.FixedDelayTask
import java.time.Duration
import java.util.concurrent.CompletableFuture

class PlatformAdminHealthRefreshSchedulerTest {
    @Test
    fun `scheduled trigger starts refresh and returns without waiting for completion`() {
        val refreshFuture = CompletableFuture<PlatformHealthView>()
        val triggers = mutableListOf<PlatformHealthRefreshTrigger>()
        val scheduler =
            PlatformAdminHealthRefreshScheduler(
                RefreshPlatformAdminHealthUseCase { trigger ->
                    triggers += trigger
                    refreshFuture
                },
            )

        assertThatCode(scheduler::refresh).doesNotThrowAnyException()

        assertThat(triggers).containsExactly(PlatformHealthRefreshTrigger.SCHEDULED)
        assertThat(refreshFuture).isNotDone()
    }

    @Test
    fun `completion failure is observed with a fixed safe warning and does not escape scheduler thread`() {
        val refreshFuture = CompletableFuture<PlatformHealthView>()
        val scheduler = PlatformAdminHealthRefreshScheduler(RefreshPlatformAdminHealthUseCase { refreshFuture })

        captureSchedulerLogs().use { logs ->
            assertThatCode(scheduler::refresh).doesNotThrowAnyException()
            assertThatCode {
                check(refreshFuture.completeExceptionally(IllegalStateException("private provider detail")))
            }.doesNotThrowAnyException()

            val event = logs.events.single()
            assertThat(event.level).isEqualTo(Level.WARN)
            assertThat(event.formattedMessage).isEqualTo("Scheduled admin health refresh failed")
            assertThat(event.formattedMessage).doesNotContain("private provider detail")
            assertThat(event.throwableProxy).isNull()
        }
    }

    @Test
    fun `scheduler depends only on refresh input port and uses the typed refresh interval property`() {
        val constructor = PlatformAdminHealthRefreshScheduler::class.java.declaredConstructors.single()
        assertThat(constructor.parameterTypes).containsExactly(RefreshPlatformAdminHealthUseCase::class.java)
        val scheduled =
            PlatformAdminHealthRefreshScheduler::class.java
                .getDeclaredMethod("refresh")
                .getAnnotation(Scheduled::class.java)

        assertThat(scheduled.fixedDelayString).isEqualTo("\${readmates.admin.health.refresh-interval:10s}")
    }
}

class PlatformAdminHealthRefreshSchedulerContextTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(SchedulerContextTestConfiguration::class.java)

    @Test
    fun `missing refresh interval starts scheduling with the approved typed default`() {
        contextRunner.run { context ->
            assertThat(context).hasNotFailed()
            assertThat(context.getBean(PlatformAdminHealthProperties::class.java).refreshInterval)
                .isEqualTo(Duration.ofSeconds(10))
            assertThat(fixedDelay(context)).isEqualTo(Duration.ofSeconds(10))
        }
    }

    @Test
    fun `configured refresh interval controls the scheduled fixed delay`() {
        contextRunner
            .withPropertyValues("readmates.admin.health.refresh-interval=2s")
            .run { context ->
                assertThat(context).hasNotFailed()
                assertThat(context.getBean(PlatformAdminHealthProperties::class.java).refreshInterval)
                    .isEqualTo(Duration.ofSeconds(2))
                assertThat(fixedDelay(context)).isEqualTo(Duration.ofSeconds(2))
            }
    }

    @Test
    fun `scheduler fallback does not bypass typed property validation`() {
        contextRunner
            .withPropertyValues("readmates.admin.health.refresh-interval=0s")
            .run { context -> assertThat(context).hasFailed() }
    }

    private fun fixedDelay(context: AssertableApplicationContext): Duration {
        val tasks = context.getBean(ScheduledAnnotationBeanPostProcessor::class.java).scheduledTasks
        assertThat(tasks).hasSize(1)
        return (tasks.single().task as FixedDelayTask).intervalDuration
    }
}

@TestConfiguration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(PlatformAdminHealthProperties::class)
@Import(PlatformAdminHealthRefreshScheduler::class)
private class SchedulerContextTestConfiguration {
    @Bean
    fun refreshUseCase(): RefreshPlatformAdminHealthUseCase = RefreshPlatformAdminHealthUseCase { CompletableFuture() }
}

private class SchedulerLogCapture(
    private val logger: Logger,
    private val appender: ListAppender<ILoggingEvent>,
) : AutoCloseable {
    val events: List<ILoggingEvent>
        get() = appender.list

    override fun close() {
        logger.detachAppender(appender)
        appender.stop()
    }
}

private fun captureSchedulerLogs(): SchedulerLogCapture {
    val logger = LoggerFactory.getLogger(PlatformAdminHealthRefreshScheduler::class.java) as Logger
    val appender = ListAppender<ILoggingEvent>().apply { start() }
    logger.addAppender(appender)
    return SchedulerLogCapture(logger, appender)
}
