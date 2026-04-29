package com.readmates.notification.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
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
import org.assertj.core.api.Assertions.assertThatThrownBy
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

    @Test
    fun `listItems clamps host query limit to one hundred`() {
        val port = FakeNotificationOutboxPort(items = emptyList())
        val service = NotificationOutboxService(port, RecordingMailDeliveryPort(), testMetrics(), maxAttempts = 5)

        service.listItems(
            host(),
            HostNotificationItemQuery(
                status = NotificationOutboxStatus.PENDING,
                eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
                limit = 250,
            ),
        )

        assertThat(port.listRequests).containsExactly(
            HostNotificationItemQuery(
                status = NotificationOutboxStatus.PENDING,
                eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
                limit = 100,
            ),
        )
    }

    @Test
    fun `retry claims one eligible host club notification and returns detail`() {
        val item = sampleItem()
        val detail = sampleDetail(id = item.id, status = NotificationOutboxStatus.SENT)
        val port = FakeNotificationOutboxPort(
            items = emptyList(),
            claimOneItems = mapOf(item.id to item),
            itemDetails = mapOf(item.id to detail),
        )
        val mail = RecordingMailDeliveryPort()
        val service = NotificationOutboxService(port, mail, testMetrics(), maxAttempts = 5)

        val result = service.retry(host(), item.id)

        assertThat(port.claimOneRequests).containsExactly(item.clubId to item.id)
        assertThat(mail.sentSubjects).containsExactly("피드백 문서가 올라왔습니다")
        assertThat(port.sentIds).containsExactly(item.id)
        assertThat(result).isEqualTo(detail)
    }

    @Test
    fun `retry denies when no eligible row can be claimed`() {
        val itemId = UUID.fromString("00000000-0000-0000-0000-000000000701")
        val port = FakeNotificationOutboxPort(items = emptyList())
        val service = NotificationOutboxService(port, RecordingMailDeliveryPort(), testMetrics(), maxAttempts = 5)

        assertThatThrownBy { service.retry(host(), itemId) }
            .hasMessageContaining("Notification not found")

        assertThat(port.claimOneRequests).containsExactly(host().clubId to itemId)
    }

    @Test
    fun `restore only restores dead host club notifications and returns pending detail`() {
        val itemId = UUID.fromString("00000000-0000-0000-0000-000000000701")
        val detail = sampleDetail(id = itemId, status = NotificationOutboxStatus.PENDING)
        val port = FakeNotificationOutboxPort(
            items = emptyList(),
            restoreResults = mapOf(itemId to true),
            itemDetails = mapOf(itemId to detail),
        )
        val service = NotificationOutboxService(port, RecordingMailDeliveryPort(), testMetrics(), maxAttempts = 5)

        val result = service.restore(host(), itemId)

        assertThat(port.restoreRequests).containsExactly(host().clubId to itemId)
        assertThat(result).isEqualTo(detail)
    }

    @Test
    fun `host notification operations reject non host members`() {
        val port = FakeNotificationOutboxPort(items = emptyList())
        val service = NotificationOutboxService(port, RecordingMailDeliveryPort(), testMetrics(), maxAttempts = 5)

        assertThatThrownBy {
            service.listItems(
                host(role = MembershipRole.MEMBER),
                HostNotificationItemQuery(status = null, eventType = null, limit = 50),
            )
        }.hasMessageContaining("Host role required")
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

    private fun sampleDetail(
        id: UUID,
        status: NotificationOutboxStatus,
    ): HostNotificationDetail =
        HostNotificationDetail(
            id = id,
            eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            status = status,
            recipientEmail = "member@example.com",
            subject = "피드백 문서가 올라왔습니다",
            deepLinkPath = "/feedback-documents",
            metadata = mapOf("sessionNumber" to 3, "bookTitle" to "메타데이터 테스트 책"),
            attemptCount = 1,
            lastError = null,
            createdAt = OffsetDateTime.of(2026, 4, 29, 0, 0, 0, 123456000, ZoneOffset.UTC),
            updatedAt = OffsetDateTime.of(2026, 4, 29, 0, 1, 0, 123456000, ZoneOffset.UTC),
        )

    private fun host(role: MembershipRole = MembershipRole.HOST): CurrentMember =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            email = "host@example.com",
            displayName = "호스트",
            accountName = "김호스트",
            role = role,
            membershipStatus = MembershipStatus.ACTIVE,
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
    private val claimOneItems: Map<UUID, NotificationOutboxItem> = emptyMap(),
    private val itemDetails: Map<UUID, HostNotificationDetail> = emptyMap(),
    private val restoreResults: Map<UUID, Boolean> = emptyMap(),
) : NotificationOutboxPort {
    val sentIds = mutableListOf<UUID>()
    val claimRequests = mutableListOf<Int>()
    val clubClaimRequests = mutableListOf<Pair<UUID, Int>>()
    val claimOneRequests = mutableListOf<Pair<UUID, UUID>>()
    val listRequests = mutableListOf<HostNotificationItemQuery>()
    val restoreRequests = mutableListOf<Pair<UUID, UUID>>()
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

    override fun listHostItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList {
        listRequests += query
        return HostNotificationItemList(emptyList())
    }

    override fun hostItemDetail(clubId: UUID, id: UUID): HostNotificationDetail? =
        itemDetails[id]

    override fun claimOneForClub(clubId: UUID, id: UUID): NotificationOutboxItem? {
        claimOneRequests += clubId to id
        return claimOneItems[id]?.takeIf { it.clubId == clubId }
    }

    override fun restoreDeadForClub(clubId: UUID, id: UUID): Boolean {
        restoreRequests += clubId to id
        return restoreResults[id] == true
    }

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
