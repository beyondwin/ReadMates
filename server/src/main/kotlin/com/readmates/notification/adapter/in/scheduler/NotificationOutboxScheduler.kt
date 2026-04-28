package com.readmates.notification.adapter.`in`.scheduler

import com.readmates.notification.application.port.`in`.ProcessNotificationOutboxUseCase
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.ZoneId

@Component
@ConditionalOnProperty(prefix = "readmates.notifications.worker", name = ["enabled"], havingValue = "true")
class NotificationOutboxScheduler(
    private val processNotificationOutboxUseCase: ProcessNotificationOutboxUseCase,
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
    @param:Value("\${readmates.notifications.worker.batch-size}") private val batchSize: Int,
    @param:Value("\${readmates.notifications.reminder-zone:Asia/Seoul}") private val reminderZone: String,
) {
    @Scheduled(fixedDelayString = "\${readmates.notifications.worker.fixed-delay-ms}")
    fun process() {
        processNotificationOutboxUseCase.processPending(batchSize)
    }

    @Scheduled(
        cron = "\${readmates.notifications.reminder-cron:0 0 0 * * *}",
        zone = "\${readmates.notifications.reminder-zone:Asia/Seoul}",
    )
    fun enqueueTomorrowReminders() {
        val targetDate = LocalDate.now(ZoneId.of(reminderZone)).plusDays(1)
        recordNotificationEventUseCase.recordSessionReminderDue(targetDate)
    }
}

@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "readmates.notifications.worker", name = ["enabled"], havingValue = "true")
class NotificationSchedulingConfig
