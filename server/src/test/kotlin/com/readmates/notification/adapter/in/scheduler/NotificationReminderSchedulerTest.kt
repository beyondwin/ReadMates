package com.readmates.notification.adapter.`in`.scheduler

import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID

class NotificationReminderSchedulerTest {
    @Test
    fun `scheduler uses tomorrow in Asia Seoul`() {
        val events = RecordingNotificationEvents()
        val clock = Clock.fixed(Instant.parse("2026-07-23T15:30:00Z"), ZoneOffset.UTC)

        NotificationReminderScheduler(events, clock, "Asia/Seoul").enqueueTomorrow()

        assertThat(events.reminderDates).containsExactly(LocalDate.of(2026, 7, 25))
    }
}

private class RecordingNotificationEvents : RecordNotificationEventUseCase {
    val reminderDates = mutableListOf<LocalDate>()

    override fun recordFeedbackDocumentPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        documentVersion: Int,
    ) = Unit

    override fun recordNextBookPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
    ) = Unit

    override fun recordReviewPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        authorMembershipId: UUID,
    ) = Unit

    override fun recordSessionReminderDue(targetDate: LocalDate) {
        reminderDates += targetDate
    }

    override fun recordAiGenerationReady(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    ) = Unit
}
