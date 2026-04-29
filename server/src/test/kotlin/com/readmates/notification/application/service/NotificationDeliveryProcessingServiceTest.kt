package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class NotificationDeliveryProcessingServiceTest {
    @Test
    fun `processClaimed increments sent metric after sent mark succeeds`() {
        val deliveryPort = ProcessingRecordingDeliveryPort()
        val registry = SimpleMeterRegistry()
        val service = NotificationDeliveryProcessingService(
            notificationDeliveryPort = deliveryPort,
            mailDeliveryPort = ProcessingRecordingMailPort(),
            metrics = ReadmatesOperationalMetrics(registry),
            maxAttempts = 5,
        )

        service.processClaimed(processingClaimedDelivery())

        assertThat(counter(registry, "readmates.notifications.sent")).isEqualTo(1.0)
    }

    @Test
    fun `processClaimed increments failed metric after retryable failure mark succeeds`() {
        val deliveryPort = ProcessingRecordingDeliveryPort()
        val registry = SimpleMeterRegistry()
        val service = NotificationDeliveryProcessingService(
            notificationDeliveryPort = deliveryPort,
            mailDeliveryPort = FailingMailPort("smtp rejected"),
            metrics = ReadmatesOperationalMetrics(registry),
            maxAttempts = 5,
        )

        service.processClaimed(processingClaimedDelivery(attemptCount = 1))

        assertThat(counter(registry, "readmates.notifications.failed")).isEqualTo(1.0)
        assertThat(counter(registry, "readmates.notifications.dead")).isZero()
    }

    @Test
    fun `processClaimed increments dead metric after exhausted failure mark succeeds`() {
        val deliveryPort = ProcessingRecordingDeliveryPort()
        val registry = SimpleMeterRegistry()
        val service = NotificationDeliveryProcessingService(
            notificationDeliveryPort = deliveryPort,
            mailDeliveryPort = FailingMailPort("smtp rejected"),
            metrics = ReadmatesOperationalMetrics(registry),
            maxAttempts = 5,
        )

        service.processClaimed(processingClaimedDelivery(attemptCount = 4))

        assertThat(counter(registry, "readmates.notifications.dead")).isEqualTo(1.0)
        assertThat(counter(registry, "readmates.notifications.failed")).isZero()
    }

    private fun counter(registry: SimpleMeterRegistry, name: String): Double =
        registry.find(name)
            .tag("event_type", NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED.name)
            .counter()
            ?.count()
            ?: 0.0
}

private class FailingMailPort(private val message: String) : com.readmates.notification.application.port.out.MailDeliveryPort {
    override fun send(command: MailDeliveryCommand) {
        error(message)
    }
}

private class ProcessingRecordingMailPort : com.readmates.notification.application.port.out.MailDeliveryPort {
    override fun send(command: MailDeliveryCommand) = Unit
}

private class ProcessingRecordingDeliveryPort : NotificationDeliveryPort {
    override fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> = error("unused")

    override fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? = error("unused")

    override fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> = error("unused")

    override fun claimEmailDeliveriesForClub(clubId: UUID, limit: Int): List<ClaimedNotificationDeliveryItem> =
        error("unused")

    override fun claimHostEmailDelivery(clubId: UUID, id: UUID): ClaimedNotificationDeliveryItem? = error("unused")

    override fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus? = error("unused")

    override fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime): Boolean = true

    override fun markDeliveryFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean = true

    override fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean = true

    override fun restoreDeadEmailDeliveryForClub(clubId: UUID, id: UUID): Boolean = error("unused")

    override fun deliveryBacklog(): NotificationDeliveryBacklog =
        NotificationDeliveryBacklog(pending = 0, failed = 0, dead = 0, sending = 0)

    override fun countByStatus(clubId: UUID, channel: NotificationChannel?, status: NotificationDeliveryStatus): Int = 0

    override fun hostSummary(clubId: UUID): HostNotificationSummary = error("unused")

    override fun listHostEmailItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList =
        error("unused")

    override fun hostEmailDetail(clubId: UUID, id: UUID): HostNotificationDetail? = error("unused")

    override fun listHostDeliveries(
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        limit: Int,
    ): List<HostNotificationDelivery> = error("unused")
}

private fun processingClaimedDelivery(
    attemptCount: Int = 0,
    eventType: NotificationEventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
): ClaimedNotificationDeliveryItem =
    ClaimedNotificationDeliveryItem(
        id = UUID.fromString("00000000-0000-0000-0000-000000000401"),
        eventId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
        eventType = eventType,
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        recipientMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000501"),
        channel = NotificationChannel.EMAIL,
        status = NotificationDeliveryStatus.SENDING,
        attemptCount = attemptCount,
        lockedAt = OffsetDateTime.of(2026, 4, 29, 1, 2, 3, 0, ZoneOffset.UTC),
        recipientEmail = "member@example.com",
        subject = "Feedback document is ready",
        bodyText = "ReadMates에서 확인해 주세요.",
    )
