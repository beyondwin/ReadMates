package com.readmates.notification.application.service

import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationOutboxBacklog
import com.readmates.notification.application.model.NotificationOutboxItem
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationOutboxPort
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import com.readmates.shared.security.CurrentMember
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
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
        val service = NotificationOutboxService(port, mail, testMetrics(), maxAttempts = 5)

        val processed = service.processPending(limit = 10)

        assertThat(processed).isEqualTo(1)
        assertThat(mail.sentSubjects).containsExactly("피드백 문서가 올라왔습니다")
        assertThat(port.sentIds).containsExactly(item.id)
        assertThat(port.failedIds).isEmpty()
        assertThat(port.deadIds).isEmpty()
    }

    @Test
    fun `processPending does not increment sent metric when sent mark misses lease`() {
        val item = sampleItem()
        val port = FakeNotificationOutboxPort(items = listOf(item), markSentUpdatesRow = false)
        val mail = RecordingMailDeliveryPort()
        val registry = SimpleMeterRegistry()
        val service = NotificationOutboxService(port, mail, ReadmatesOperationalMetrics(registry), maxAttempts = 5)

        val processed = service.processPending(limit = 10)

        assertThat(processed).isEqualTo(1)
        assertThat(mail.sentSubjects).containsExactly("피드백 문서가 올라왔습니다")
        assertThat(port.sentIds).isEmpty()
        assertThat(
            registry.counter(
                "readmates.notifications.sent",
                "event_type",
                "FEEDBACK_DOCUMENT_PUBLISHED",
            ).count(),
        ).isZero()
    }

    @Test
    fun `processPending marks dead after max attempts`() {
        val item = sampleItem(attemptCount = 4)
        val port = FakeNotificationOutboxPort(items = listOf(item))
        val mail = FailingMailDeliveryPort("smtp rejected")
        val service = NotificationOutboxService(port, mail, testMetrics(), maxAttempts = 5)

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
        val service = NotificationOutboxService(port, mail, testMetrics(), maxAttempts = 5, deliveryEnabled = false)

        val processed = service.processPending(limit = 10)

        assertThat(processed).isZero()
        assertThat(port.claimRequests).isEmpty()
        assertThat(mail.sentSubjects).isEmpty()
        assertThat(port.sentIds).isEmpty()
        assertThat(port.failedIds).isEmpty()
        assertThat(port.deadIds).isEmpty()
    }

    @Test
    fun `processPendingForClub claims only rows for the requested club`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val item = sampleItem()
        val port = FakeNotificationOutboxPort(items = listOf(item))
        val mail = RecordingMailDeliveryPort()
        val service = NotificationOutboxService(port, mail, testMetrics(), maxAttempts = 5)

        val processed = service.processPendingForClub(clubId, limit = 10)

        assertThat(processed).isEqualTo(1)
        assertThat(port.clubClaimRequests).containsExactly(clubId to 10)
        assertThat(port.claimRequests).isEmpty()
        assertThat(port.sentIds).containsExactly(item.id)
    }

    @Test
    fun `processPending marks failed with configured retry delay before max attempts`() {
        val item = sampleItem(attemptCount = 2)
        val port = FakeNotificationOutboxPort(items = listOf(item))
        val mail = FailingMailDeliveryPort("temporary failure")
        val service = NotificationOutboxService(port, mail, testMetrics(), maxAttempts = 5)

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
        val service = NotificationOutboxService(port, mail, testMetrics(), maxAttempts = 5)

        val processed = service.processPending(limit = 10)

        assertThat(processed).isEqualTo(1)
        assertThat(port.deadErrors.single()).hasSize(500)
    }

    @Test
    fun `recordSessionReminderDue enqueues reminder notifications for target date`() {
        val port = FakeNotificationOutboxPort(items = emptyList())
        val service = NotificationOutboxService(port, RecordingMailDeliveryPort(), testMetrics(), maxAttempts = 5)
        val targetDate = LocalDate.of(2026, 4, 30)

        service.recordSessionReminderDue(targetDate)

        assertThat(port.reminderDates).containsExactly(targetDate)
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

private fun testMetrics(): ReadmatesOperationalMetrics =
    ReadmatesOperationalMetrics(SimpleMeterRegistry())

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
    private val markSentUpdatesRow: Boolean = true,
) : NotificationOutboxPort {
    val sentIds = mutableListOf<UUID>()
    val claimRequests = mutableListOf<Int>()
    val clubClaimRequests = mutableListOf<Pair<UUID, Int>>()
    val failedIds = mutableListOf<UUID>()
    val failedErrors = mutableListOf<String>()
    val failedDelays = mutableListOf<Long>()
    val deadIds = mutableListOf<UUID>()
    val deadErrors = mutableListOf<String>()
    val reminderDates = mutableListOf<LocalDate>()

    override fun enqueueFeedbackDocumentPublished(clubId: UUID, sessionId: UUID): Int = 0

    override fun enqueueNextBookPublished(clubId: UUID, sessionId: UUID): Int = 0

    override fun enqueueSessionReminderDue(targetDate: LocalDate): Int {
        reminderDates += targetDate
        return 1
    }

    override fun claimPending(limit: Int): List<NotificationOutboxItem> {
        claimRequests += limit
        return items.take(limit)
    }

    override fun claimPendingForClub(clubId: UUID, limit: Int): List<NotificationOutboxItem> {
        clubClaimRequests += clubId to limit
        return items.filter { it.clubId == clubId }.take(limit)
    }

    override fun markSent(id: UUID, lockedAt: OffsetDateTime): Boolean {
        return if (markSentUpdatesRow) {
            sentIds += id
            true
        } else {
            false
        }
    }

    override fun markFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean {
        failedIds += id
        failedErrors += error
        failedDelays += nextAttemptDelayMinutes
        return true
    }

    override fun markDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean {
        deadIds += id
        deadErrors += error
        return true
    }

    override fun hostSummary(clubId: UUID): HostNotificationSummary =
        HostNotificationSummary(
            pending = 0,
            failed = 0,
            dead = 0,
            sentLast24h = 0,
            latestFailures = emptyList(),
        )

    override fun outboxBacklog(): NotificationOutboxBacklog =
        NotificationOutboxBacklog(
            pending = 0,
            failed = 0,
            dead = 0,
            sending = 0,
        )

    override fun getPreferences(member: CurrentMember): NotificationPreferences =
        NotificationPreferences.defaults()

    override fun savePreferences(
        member: CurrentMember,
        preferences: NotificationPreferences,
    ): NotificationPreferences = preferences
}
