@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.health.adapter.`in`.scheduling

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import com.readmates.admin.health.application.model.PlatformHealthView
import com.readmates.admin.health.application.port.`in`.RefreshPlatformAdminHealthUseCase
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
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

        assertThat(scheduled.fixedDelayString).isEqualTo("\${readmates.admin.health.refresh-interval}")
    }
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
