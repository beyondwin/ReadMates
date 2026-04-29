package com.readmates.notification.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationEvent
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
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

class HostNotificationOperationsServiceTest {
    @Test
    fun `retry returns eligible detail without claiming or sending when delivery is disabled`() {
        val detail = hostDetail(status = NotificationOutboxStatus.PENDING)
        val deliveryPort = RecordingDeliveryPort(
            claimedDelivery = claimedDelivery(),
            details = mapOf(detail.id to detail),
        )
        val mailPort = RecordingMailPort()
        val processingService = NotificationDeliveryProcessingService(
            notificationDeliveryPort = deliveryPort,
            mailDeliveryPort = mailPort,
            metrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
            maxAttempts = 5,
            deliveryEnabled = false,
        )
        val service = HostNotificationOperationsService(
            notificationEventOutboxPort = EmptyEventOutboxPort,
            notificationDeliveryPort = deliveryPort,
            notificationDeliveryProcessingService = processingService,
            deliveryEnabled = false,
        )

        val result = service.retry(host(), detail.id)

        assertThat(result).isEqualTo(detail)
        assertThat(deliveryPort.claimHostRequests).isEmpty()
        assertThat(deliveryPort.sent).isEmpty()
        assertThat(deliveryPort.failed).isEmpty()
        assertThat(deliveryPort.dead).isEmpty()
        assertThat(mailPort.sent).isEmpty()
    }

    private fun host(): CurrentMember =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = CLUB_ID,
            email = "host@example.com",
            displayName = "Host",
            accountName = "Host",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private fun hostDetail(status: NotificationOutboxStatus): HostNotificationDetail =
        HostNotificationDetail(
            id = DELIVERY_ID,
            eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            status = status,
            recipientEmail = "member@example.com",
            subject = "Feedback document is ready",
            deepLinkPath = "/feedback-documents",
            metadata = emptyMap(),
            attemptCount = 1,
            lastError = null,
            createdAt = TIMESTAMP,
            updatedAt = TIMESTAMP,
        )
}

private object EmptyEventOutboxPort : NotificationEventOutboxPort {
    override fun enqueueEvent(
        clubId: UUID,
        eventType: NotificationEventType,
        aggregateType: String,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        dedupeKey: String,
    ): Boolean = error("unused")

    override fun enqueueSessionReminderDue(targetDate: LocalDate): Int =
        error("unused")

    override fun claimPublishable(limit: Int): List<NotificationEventOutboxItem> =
        error("unused")

    override fun markPublished(id: UUID, lockedAt: OffsetDateTime): Boolean = error("unused")

    override fun markPublishFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean =
        error("unused")

    override fun markPublishDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean = error("unused")

    override fun loadMessage(eventId: UUID): NotificationEventMessage? = error("unused")

    override fun listHostEvents(
        clubId: UUID,
        status: NotificationEventOutboxStatus?,
        limit: Int,
    ): List<HostNotificationEvent> = emptyList()
}

private class RecordingDeliveryPort(
    private val claimedDelivery: ClaimedNotificationDeliveryItem? = null,
    private val details: Map<UUID, HostNotificationDetail> = emptyMap(),
) : NotificationDeliveryPort {
    val claimHostRequests = mutableListOf<Pair<UUID, UUID>>()
    val sent = mutableListOf<Pair<UUID, OffsetDateTime>>()
    val failed = mutableListOf<UUID>()
    val dead = mutableListOf<UUID>()

    override fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> = error("unused")

    override fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? = error("unused")

    override fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> = error("unused")

    override fun claimEmailDeliveriesForClub(clubId: UUID, limit: Int): List<ClaimedNotificationDeliveryItem> = error("unused")

    override fun claimHostEmailDelivery(clubId: UUID, id: UUID): ClaimedNotificationDeliveryItem? {
        claimHostRequests += clubId to id
        return claimedDelivery?.takeIf { it.clubId == clubId && it.id == id }
    }

    override fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus? = error("unused")

    override fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime): Boolean {
        sent += id to lockedAt
        return true
    }

    override fun markDeliveryFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean {
        failed += id
        return true
    }

    override fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean {
        dead += id
        return true
    }

    override fun restoreDeadEmailDeliveryForClub(clubId: UUID, id: UUID): Boolean = error("unused")

    override fun deliveryBacklog(): NotificationDeliveryBacklog =
        NotificationDeliveryBacklog(pending = 0, failed = 0, dead = 0, sending = 0)

    override fun countByStatus(clubId: UUID, channel: NotificationChannel?, status: NotificationDeliveryStatus): Int = 0

    override fun hostSummary(clubId: UUID): HostNotificationSummary = error("unused")

    override fun listHostEmailItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList =
        error("unused")

    override fun hostEmailDetail(clubId: UUID, id: UUID): HostNotificationDetail? =
        details[id]?.takeIf { clubId == CLUB_ID }

    override fun listHostDeliveries(
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        limit: Int,
    ): List<HostNotificationDelivery> = error("unused")
}

private class RecordingMailPort : MailDeliveryPort {
    val sent = mutableListOf<MailDeliveryCommand>()

    override fun send(command: MailDeliveryCommand) {
        sent += command
    }
}

private fun claimedDelivery(
    attemptCount: Int = 0,
    eventType: NotificationEventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
): ClaimedNotificationDeliveryItem =
    ClaimedNotificationDeliveryItem(
        id = DELIVERY_ID,
        eventId = EVENT_ID,
        eventType = eventType,
        clubId = CLUB_ID,
        recipientMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000501"),
        channel = NotificationChannel.EMAIL,
        status = NotificationDeliveryStatus.SENDING,
        attemptCount = attemptCount,
        lockedAt = TIMESTAMP,
        recipientEmail = "member@example.com",
        subject = "Feedback document is ready",
        bodyText = "ReadMates에서 확인해 주세요.",
    )

private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val EVENT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")
private val DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000401")
private val TIMESTAMP: OffsetDateTime = OffsetDateTime.of(2026, 4, 29, 1, 2, 3, 0, ZoneOffset.UTC)
