@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.adapter.`in`.scheduler

import com.readmates.notification.application.config.NotificationWorkerConfiguration
import com.readmates.notification.application.port.`in`.PublishNotificationEventsUseCase
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.TaskScheduler
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ScheduledFuture

class NotificationEventRelaySchedulerTest {
    @Test
    fun `typed worker settings drive the scheduled delay and relay batch`() {
        ApplicationContextRunner()
            .withUserConfiguration(
                NotificationWorkerConfiguration::class.java,
                NotificationEventRelayScheduler::class.java,
                NotificationEventRelaySchedulingConfig::class.java,
                SchedulerTestConfiguration::class.java,
            ).withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.sender-email=no-reply@example.test",
                "readmates.notifications.sender-name=ReadMates",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
                "readmates.notifications.worker.fixed-delay=73s",
                "readmates.notifications.worker.relay-batch-size=37",
            ).run { context ->
                assertThat(context).hasNotFailed()
                val taskScheduler = context.getBean(TaskScheduler::class.java)
                val runnable = ArgumentCaptor.forClass(Runnable::class.java)
                Mockito.verify(taskScheduler).scheduleWithFixedDelay(
                    runnable.capture(),
                    Mockito.any(Instant::class.java),
                    Mockito.eq(Duration.ofSeconds(73)),
                )

                runnable.value.run()

                Mockito.verify(context.getBean(PublishNotificationEventsUseCase::class.java)).publishPending(37)
            }
    }

    @Test
    fun `one millisecond fixed delay reaches the actual scheduler exactly`() {
        ApplicationContextRunner()
            .withUserConfiguration(
                NotificationWorkerConfiguration::class.java,
                NotificationEventRelayScheduler::class.java,
                NotificationEventRelaySchedulingConfig::class.java,
                SchedulerTestConfiguration::class.java,
            ).withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.sender-email=no-reply@example.test",
                "readmates.notifications.sender-name=ReadMates",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
                "readmates.notifications.worker.fixed-delay=1ms",
            ).run { context ->
                assertThat(context).hasNotFailed()
                Mockito.verify(context.getBean(TaskScheduler::class.java)).scheduleWithFixedDelay(
                    Mockito.any(Runnable::class.java),
                    Mockito.any(Instant::class.java),
                    Mockito.eq(Duration.ofMillis(1)),
                )
            }
    }

    @Test
    fun `worker disabled keeps relay scheduling inactive`() {
        ApplicationContextRunner()
            .withUserConfiguration(
                NotificationWorkerConfiguration::class.java,
                NotificationEventRelayScheduler::class.java,
                NotificationEventRelaySchedulingConfig::class.java,
                SchedulerTestConfiguration::class.java,
            ).withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.sender-email=no-reply@example.test",
                "readmates.notifications.sender-name=ReadMates",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
                "readmates.notifications.worker.enabled=false",
            ).run { context ->
                assertThat(context).hasNotFailed()
                assertThat(context).doesNotHaveBean(NotificationEventRelayScheduler::class.java)
                Mockito.verifyNoInteractions(context.getBean(TaskScheduler::class.java))
            }
    }
}

@Configuration(proxyBeanMethods = false)
private class SchedulerTestConfiguration {
    @Bean
    fun publishNotificationEventsUseCase() = Mockito.mock(PublishNotificationEventsUseCase::class.java)

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
