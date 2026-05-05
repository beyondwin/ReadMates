package com.readmates.notification.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
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
import org.slf4j.LoggerFactory
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class NotificationDeliveryProcessingServiceTest {
    @Test
    fun `processClaimed increments sent metric after sent mark succeeds`() {
        val deliveryPort = ProcessingRecordingDeliveryPort()
        val mailPort = ProcessingRecordingMailPort()
        val registry = SimpleMeterRegistry()
        val service = NotificationDeliveryProcessingService(
            notificationDeliveryPort = deliveryPort,
            mailDeliveryPort = mailPort,
            metrics = ReadmatesOperationalMetrics(registry),
            maxAttempts = 5,
            retryDelayMinutesConfig = listOf(5L, 15L, 60L, 240L),
        )

        captureDeliveryProcessingLogs().use { logs ->
            service.processClaimed(processingClaimedDelivery())

            val event = logs.events.single()
            assertThat(event.level).isEqualTo(Level.INFO)
            assertThat(event.message).isEqualTo("Notification email delivery sent deliveryId={} eventType={}")
            assertThat(event.argumentArray.toList()).containsExactly(
                UUID.fromString("00000000-0000-0000-0000-000000000401"),
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            )
            assertThat(event.formattedMessage)
                .doesNotContain("member@example.com")
                .doesNotContain("ReadMates에서 확인해 주세요.")
        }

        assertThat(mailPort.sent.single().html).contains("피드백 문서")
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
            retryDelayMinutesConfig = listOf(5L, 15L, 60L, 240L),
        )

        captureDeliveryProcessingLogs().use { logs ->
            service.processClaimed(processingClaimedDelivery(attemptCount = 1))

            val event = logs.events.single()
            assertThat(event.level).isEqualTo(Level.WARN)
            assertThat(event.message).isEqualTo("Notification email delivery failed deliveryId={} eventType={} attemptCount={} error={}")
            assertThat(event.argumentArray.toList()).containsExactly(
                UUID.fromString("00000000-0000-0000-0000-000000000401"),
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
                2,
                "smtp rejected",
            )
            assertThat(event.formattedMessage).doesNotContain("member@example.com")
        }

        assertThat(counter(registry, "readmates.notifications.failed")).isEqualTo(1.0)
        assertThat(counter(registry, "readmates.notifications.dead")).isZero()
    }

    @Test
    fun `processClaimed uses configured retry delay when marking retryable failure`() {
        val deliveryPort = ProcessingRecordingDeliveryPort()
        val service = NotificationDeliveryProcessingService(
            notificationDeliveryPort = deliveryPort,
            mailDeliveryPort = FailingMailPort("smtp rejected"),
            metrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
            maxAttempts = 5,
            retryDelayMinutesConfig = listOf(2L, 4L, 8L),
        )

        service.processClaimed(processingClaimedDelivery(attemptCount = 1))

        assertThat(deliveryPort.failed.map { it.delayMinutes }).containsExactly(4L)
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
            retryDelayMinutesConfig = listOf(5L, 15L, 60L, 240L),
        )

        captureDeliveryProcessingLogs().use { logs ->
            service.processClaimed(processingClaimedDelivery(attemptCount = 4))

            val event = logs.events.single()
            assertThat(event.level).isEqualTo(Level.WARN)
            assertThat(event.message).isEqualTo("Notification email delivery dead deliveryId={} eventType={} attemptCount={} error={}")
            assertThat(event.argumentArray.toList()).containsExactly(
                UUID.fromString("00000000-0000-0000-0000-000000000401"),
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
                5,
                "smtp rejected",
            )
            assertThat(event.formattedMessage).doesNotContain("member@example.com")
        }

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
    val sent = mutableListOf<MailDeliveryCommand>()

    override fun send(command: MailDeliveryCommand) {
        sent += command
    }
}

private data class ProcessingFailedMark(
    val id: UUID,
    val lockedAt: OffsetDateTime,
    val error: String,
    val delayMinutes: Long,
)

private class ProcessingRecordingDeliveryPort : NotificationDeliveryPort {
    val failed = mutableListOf<ProcessingFailedMark>()

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
    ): Boolean {
        failed += ProcessingFailedMark(id, lockedAt, error, nextAttemptDelayMinutes)
        return true
    }

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
        bodyHtml = "<html><body>피드백 문서</body></html>",
    )

private class DeliveryProcessingLogCapture(
    private val logger: Logger,
    private val appender: ListAppender<ILoggingEvent>,
) : AutoCloseable {
    val events: List<ILoggingEvent>
        get() = appender.list

    override fun close() {
        logger.detachAppender(appender)
        appender.stop()
    }
}

private fun captureDeliveryProcessingLogs(): DeliveryProcessingLogCapture {
    val logger = LoggerFactory.getLogger(NotificationDeliveryProcessingService::class.java) as Logger
    val appender = ListAppender<ILoggingEvent>().apply { start() }
    logger.addAppender(appender)
    return DeliveryProcessingLogCapture(logger, appender)
}
