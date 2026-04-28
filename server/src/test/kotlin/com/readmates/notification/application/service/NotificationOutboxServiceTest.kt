package com.readmates.notification.application.service

import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationOutboxItem
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationOutboxPort
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class NotificationOutboxServiceTest {
    @Test
    fun `processPending marks sent when mail delivery succeeds`() {
        val item = sampleItem()
        val port = FakeNotificationOutboxPort(items = listOf(item))
        val mail = RecordingMailDeliveryPort()
        val service = NotificationOutboxService(port, mail, maxAttempts = 5)

        val processed = service.processPending(limit = 10)

        assertThat(processed).isEqualTo(1)
        assertThat(mail.sentSubjects).containsExactly("피드백 문서가 올라왔습니다")
        assertThat(port.sentIds).containsExactly(item.id)
        assertThat(port.failedIds).isEmpty()
        assertThat(port.deadIds).isEmpty()
    }

    @Test
    fun `processPending marks dead after max attempts`() {
        val item = sampleItem(attemptCount = 4)
        val port = FakeNotificationOutboxPort(items = listOf(item))
        val mail = FailingMailDeliveryPort("smtp rejected")
        val service = NotificationOutboxService(port, mail, maxAttempts = 5)

        val processed = service.processPending(limit = 10)

        assertThat(processed).isEqualTo(1)
        assertThat(port.deadIds).containsExactly(item.id)
        assertThat(port.deadErrors.single()).contains("smtp rejected")
        assertThat(port.sentIds).isEmpty()
        assertThat(port.failedIds).isEmpty()
    }

    @Test
    fun `processPending does not claim rows when delivery is disabled`() {
        val item = sampleItem()
        val port = FakeNotificationOutboxPort(items = listOf(item))
        val mail = RecordingMailDeliveryPort()
        val service = NotificationOutboxService(port, mail, maxAttempts = 5, deliveryEnabled = false)

        val processed = service.processPending(limit = 10)

        assertThat(processed).isZero()
        assertThat(port.claimRequests).isEmpty()
        assertThat(mail.sentSubjects).isEmpty()
        assertThat(port.sentIds).isEmpty()
        assertThat(port.failedIds).isEmpty()
        assertThat(port.deadIds).isEmpty()
    }

    @Test
    fun `processPending marks failed with configured retry delay before max attempts`() {
        val item = sampleItem(attemptCount = 2)
        val port = FakeNotificationOutboxPort(items = listOf(item))
        val mail = FailingMailDeliveryPort("temporary failure")
        val service = NotificationOutboxService(port, mail, maxAttempts = 5)

        val processed = service.processPending(limit = 10)

        assertThat(processed).isEqualTo(1)
        assertThat(port.failedIds).containsExactly(item.id)
        assertThat(port.failedDelays).containsExactly(60L)
        assertThat(port.deadIds).isEmpty()
    }

    @Test
    fun `processPending truncates stored delivery errors to 500 characters`() {
        val item = sampleItem(attemptCount = 4)
        val port = FakeNotificationOutboxPort(items = listOf(item))
        val mail = FailingMailDeliveryPort("x".repeat(600))
        val service = NotificationOutboxService(port, mail, maxAttempts = 5)

        val processed = service.processPending(limit = 10)

        assertThat(processed).isEqualTo(1)
        assertThat(port.deadErrors.single()).hasSize(500)
    }

    private fun sampleItem(attemptCount: Int = 0): NotificationOutboxItem =
        NotificationOutboxItem(
            id = UUID.fromString("00000000-0000-0000-0000-000000000701"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            recipientEmail = "member@example.com",
            subject = "피드백 문서가 올라왔습니다",
            bodyText = "Feedback document is ready.",
            deepLinkPath = "/feedback-documents",
            status = NotificationOutboxStatus.SENDING,
            attemptCount = attemptCount,
            lockedAt = OffsetDateTime.of(2026, 4, 29, 0, 0, 0, 123456000, ZoneOffset.UTC),
        )
}

private class RecordingMailDeliveryPort : MailDeliveryPort {
    val sentSubjects = mutableListOf<String>()

    override fun send(command: MailDeliveryCommand) {
        sentSubjects += command.subject
    }
}

private class FailingMailDeliveryPort(
    private val message: String,
) : MailDeliveryPort {
    override fun send(command: MailDeliveryCommand) {
        error(message)
    }
}

private class FakeNotificationOutboxPort(
    private val items: List<NotificationOutboxItem>,
) : NotificationOutboxPort {
    val sentIds = mutableListOf<UUID>()
    val claimRequests = mutableListOf<Int>()
    val failedIds = mutableListOf<UUID>()
    val failedErrors = mutableListOf<String>()
    val failedDelays = mutableListOf<Long>()
    val deadIds = mutableListOf<UUID>()
    val deadErrors = mutableListOf<String>()

    override fun enqueueFeedbackDocumentPublished(clubId: UUID, sessionId: UUID): Int = 0

    override fun enqueueNextBookPublished(clubId: UUID, sessionId: UUID): Int = 0

    override fun enqueueSessionReminderDue(targetDate: LocalDate): Int = 0

    override fun claimPending(limit: Int): List<NotificationOutboxItem> {
        claimRequests += limit
        return items.take(limit)
    }

    override fun markSent(id: UUID, lockedAt: OffsetDateTime) {
        sentIds += id
    }

    override fun markFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long) {
        failedIds += id
        failedErrors += error
        failedDelays += nextAttemptDelayMinutes
    }

    override fun markDead(id: UUID, lockedAt: OffsetDateTime, error: String) {
        deadIds += id
        deadErrors += error
    }

    override fun hostSummary(clubId: UUID): HostNotificationSummary =
        HostNotificationSummary(
            pending = 0,
            failed = 0,
            dead = 0,
            sentLast24h = 0,
            latestFailures = emptyList(),
        )
}
