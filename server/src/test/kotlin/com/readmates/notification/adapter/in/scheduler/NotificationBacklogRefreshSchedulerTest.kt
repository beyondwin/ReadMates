@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.adapter.`in`.scheduler

import com.readmates.notification.application.config.NotificationWorkerConfiguration
import com.readmates.notification.application.model.NotificationBacklogRefreshResult
import com.readmates.notification.application.port.`in`.RefreshNotificationBacklogUseCase
import com.readmates.notification.application.port.out.NotificationBacklogObservationPort
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.scheduling.TaskScheduler
import org.springframework.scheduling.annotation.EnableScheduling
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ScheduledFuture

class NotificationBacklogRefreshSchedulerTest {
    @Test
    fun `typed worker settings drive the refresh interval and initial delay`() {
        val earliestStart = Instant.now().plusSeconds(17)
        ApplicationContextRunner()
            .withUserConfiguration(
                NotificationWorkerConfiguration::class.java,
                NotificationBacklogRefreshScheduler::class.java,
                BacklogSchedulerTestConfiguration::class.java,
            ).withPropertyValues(
                "readmates.notifications.worker.backlog-refresh-interval=71s",
                "readmates.notifications.worker.backlog-initial-delay=17s",
            ).run { context ->
                assertThat(context).hasNotFailed()
                val taskScheduler = context.getBean(TaskScheduler::class.java)
                val runnable = ArgumentCaptor.forClass(Runnable::class.java)
                val start = ArgumentCaptor.forClass(Instant::class.java)
                Mockito.verify(taskScheduler).scheduleWithFixedDelay(
                    runnable.capture(),
                    start.capture(),
                    Mockito.eq(Duration.ofSeconds(71)),
                )
                assertThat(start.value).isBetween(earliestStart, Instant.now().plusSeconds(17))

                runnable.value.run()

                val refreshUseCase = context.getBean(RefreshNotificationBacklogUseCase::class.java)
                val observationPort = context.getBean(NotificationBacklogObservationPort::class.java)
                Mockito.verify(refreshUseCase).refresh()
                Mockito.verify(observationPort).recordBacklogRefresh(NotificationBacklogRefreshResult.SUCCESS)
            }
    }

    @Test
    fun `observation failure does not escape the scheduler or repeat refresh`() {
        val refreshUseCase = Mockito.mock(RefreshNotificationBacklogUseCase::class.java)
        val observationPort = Mockito.mock(NotificationBacklogObservationPort::class.java)
        Mockito.`when`(refreshUseCase.refresh()).thenReturn(NotificationBacklogRefreshResult.PARTIAL)
        Mockito
            .doThrow(IllegalStateException("metrics registry detail"))
            .`when`(observationPort)
            .recordBacklogRefresh(NotificationBacklogRefreshResult.PARTIAL)
        val scheduler = NotificationBacklogRefreshScheduler(refreshUseCase, observationPort)

        assertThatCode(scheduler::refresh).doesNotThrowAnyException()
        Mockito.verify(refreshUseCase).refresh()
        Mockito.verifyNoMoreInteractions(refreshUseCase)
    }
}

@TestConfiguration(proxyBeanMethods = false)
@EnableScheduling
private class BacklogSchedulerTestConfiguration {
    @Bean
    fun refreshNotificationBacklogUseCase(): RefreshNotificationBacklogUseCase =
        Mockito.mock(RefreshNotificationBacklogUseCase::class.java).also { useCase ->
            Mockito.`when`(useCase.refresh()).thenReturn(NotificationBacklogRefreshResult.SUCCESS)
        }

    @Bean
    fun notificationBacklogObservationPort(): NotificationBacklogObservationPort =
        Mockito.mock(NotificationBacklogObservationPort::class.java)

    @Bean
    fun taskScheduler(): TaskScheduler =
        Mockito.mock(TaskScheduler::class.java).also { scheduler ->
            val scheduledFuture = Mockito.mock(ScheduledFuture::class.java)
            Mockito
                .`when`(
                    scheduler.scheduleWithFixedDelay(
                        Mockito.any(Runnable::class.java),
                        Mockito.any(Instant::class.java),
                        Mockito.any(Duration::class.java),
                    ),
                ).thenReturn(scheduledFuture)
        }
}
