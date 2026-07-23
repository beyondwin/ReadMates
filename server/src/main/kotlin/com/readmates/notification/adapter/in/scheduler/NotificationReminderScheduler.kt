package com.readmates.notification.adapter.`in`.scheduler

import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

@Component
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
class NotificationReminderScheduler(
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
    private val clock: Clock,
    @param:Value("\${readmates.notifications.reminder-zone:Asia/Seoul}") private val reminderZone: String,
) {
    @Scheduled(
        cron = "\${readmates.notifications.reminder-cron:0 0 0 * * *}",
        zone = "\${readmates.notifications.reminder-zone:Asia/Seoul}",
    )
    fun enqueueTomorrow() {
        val targetDate = LocalDate.now(clock.withZone(ZoneId.of(reminderZone))).plusDays(1)
        recordNotificationEventUseCase.recordSessionReminderDue(targetDate)
    }
}
