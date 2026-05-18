package com.readmates.notification.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryClaimPort
import com.readmates.notification.application.port.out.NotificationDeliveryPlanningPort
import com.readmates.notification.application.port.out.NotificationDeliveryStatusPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.ResourceLock
import org.slf4j.LoggerFactory
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@ResourceLock("NotificationDeliveryEngineLogger")
class NotificationDeliveryProcessingServiceTest {
    @Test
    fun `processClaimed increments sent metric after sent mark succeeds`() {
        val deliveryPort = ProcessingRecordingDeliveryPort()
        val mailPort = ProcessingRecordingMailPort()
        val registry = SimpleMeterRegistry()
        val service =
            notificationDeliveryProcessingService(
                deliveryStatusPort = deliveryPort,
                mailPort = mailPort,
                metrics = ReadmatesOperationalMetrics(registry),
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
        val service =
            notificationDeliveryProcessingService(
                deliveryStatusPort = deliveryPort,
                mailPort = FailingMailPort("smtp rejected"),
                metrics = ReadmatesOperationalMetrics(registry),
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
        val service =
            notificationDeliveryProcessingService(
                deliveryStatusPort = deliveryPort,
                mailPort = FailingMailPort("smtp rejected"),
                retryDelayMinutesConfig = listOf(2L, 4L, 8L),
            )

        service.processClaimed(processingClaimedDelivery(attemptCount = 1))

        assertThat(deliveryPort.failed.map { it.delayMinutes }).containsExactly(4L)
    }

    @Test
    fun `processClaimed increments dead metric after exhausted failure mark succeeds`() {
        val deliveryPort = ProcessingRecordingDeliveryPort()
        val registry = SimpleMeterRegistry()
        val service =
            notificationDeliveryProcessingService(
                deliveryStatusPort = deliveryPort,
                mailPort = FailingMailPort("smtp rejected"),
                metrics = ReadmatesOperationalMetrics(registry),
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

    private fun counter(
        registry: SimpleMeterRegistry,
        name: String,
    ): Double =
        registry
            .find(name)
            .tag("event_type", NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED.name)
            .counter()
            ?.count()
            ?: 0.0

    private fun notificationDeliveryProcessingService(
        deliveryStatusPort: NotificationDeliveryStatusPort,
        mailPort: MailDeliveryPort,
        metrics: ReadmatesOperationalMetrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
        maxAttempts: Int = 5,
        retryDelayMinutesConfig: List<Long> = listOf(5L, 15L, 60L, 240L),
    ): NotificationDeliveryProcessingService =
        NotificationDeliveryProcessingService(
            deliveryEngine =
                NotificationDeliveryEngine(
                    deliveryStatusPort = deliveryStatusPort,
                    mailDeliveryPort = mailPort,
                    metrics = metrics,
                    maxAttempts = maxAttempts,
                    retryDelayMinutesConfig = retryDelayMinutesConfig,
                ),
            transactionalOps = NotificationDeliveryTransactionalOperations(NoopDeliveryTransactionPort, NoopDeliveryTransactionPort),
            deliveryEnabled = true,
        )
}

private object NoopDeliveryTransactionPort : NotificationDeliveryPlanningPort, NotificationDeliveryClaimPort {
    override fun persistPlannedDeliveries(message: NotificationEventMessage) = error("unused")

    override fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? = error("unused")

    override fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> = error("unused")

    override fun claimEmailDeliveriesForClub(
        clubId: UUID,
        limit: Int,
    ): List<ClaimedNotificationDeliveryItem> = error("unused")

    override fun claimHostEmailDelivery(
        clubId: UUID,
        id: UUID,
    ): ClaimedNotificationDeliveryItem? = error("unused")
}

private class FailingMailPort(
    private val message: String,
) : MailDeliveryPort {
    override fun send(command: MailDeliveryCommand) {
        error(message)
    }
}

private class ProcessingRecordingMailPort : MailDeliveryPort {
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

private class ProcessingRecordingDeliveryPort : NotificationDeliveryStatusPort {
    val failed = mutableListOf<ProcessingFailedMark>()

    override fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus? = error("unused")

    override fun markDeliverySent(
        id: UUID,
        lockedAt: OffsetDateTime,
    ): Boolean = true

    override fun markDeliveryFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean {
        failed += ProcessingFailedMark(id, lockedAt, error, nextAttemptDelayMinutes)
        return true
    }

    override fun markDeliveryDead(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
    ): Boolean = true

    override fun restoreDeadEmailDeliveryForClub(
        clubId: UUID,
        id: UUID,
    ): Boolean = error("unused")
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
    val logger = LoggerFactory.getLogger(NotificationDeliveryEngine::class.java) as Logger
    val appender = ListAppender<ILoggingEvent>().apply { start() }
    logger.addAppender(appender)
    return DeliveryProcessingLogCapture(logger, appender)
}
