package com.readmates.notification.adapter.`in`.scheduler

import com.readmates.notification.application.port.`in`.ProcessNotificationOutboxUseCase
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID

class NotificationOutboxSchedulerTest {
    @Test
    fun `enqueueTomorrowReminders calculates target date in configured reminder zone`() {
        val recorder = RecordingNotificationEvents()
        val scheduler = NotificationOutboxScheduler(
            processNotificationOutboxUseCase = RecordingNotificationProcessor(),
            recordNotificationEventUseCase = recorder,
            batchSize = 10,
            reminderZone = "Asia/Seoul",
            clock = Clock.fixed(Instant.parse("2026-04-28T15:30:00Z"), ZoneOffset.UTC),
        )

        scheduler.enqueueTomorrowReminders()

        assertThat(recorder.reminderDates).containsExactly(LocalDate.of(2026, 4, 30))
    }
}

private class RecordingNotificationProcessor : ProcessNotificationOutboxUseCase {
    override fun processPending(limit: Int): Int = 0

    override fun processPendingForClub(clubId: UUID, limit: Int): Int = 0
}

private class RecordingNotificationEvents : RecordNotificationEventUseCase {
    val reminderDates = mutableListOf<LocalDate>()

    override fun recordFeedbackDocumentPublished(clubId: UUID, sessionId: UUID) = Unit

    override fun recordNextBookPublished(clubId: UUID, sessionId: UUID) = Unit

    override fun recordSessionReminderDue(targetDate: LocalDate) {
        reminderDates += targetDate
    }
}
