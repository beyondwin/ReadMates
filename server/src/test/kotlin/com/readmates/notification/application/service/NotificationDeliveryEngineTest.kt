package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryStatusPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class NotificationDeliveryEngineTest {
    @Test
    fun `sendClaimed throws when a required delivery field is missing`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val mailPort = EngineRecordingMailPort()
        val engine = notificationDeliveryEngine(deliveryPort, mailPort)

        assertThatThrownBy {
            engine.sendClaimed(engineClaimedDelivery(recipientEmail = " "))
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("missing recipientEmail")

        assertThat(mailPort.sent).isEmpty()
        assertThat(deliveryPort.sent).isEmpty()
        assertThat(deliveryPort.failed).isEmpty()
        assertThat(deliveryPort.dead).isEmpty()
    }

    @Test
    fun `sendClaimed marks sent and increments sent metric after mail send succeeds`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val mailPort = EngineRecordingMailPort()
        val registry = SimpleMeterRegistry()
        val engine = notificationDeliveryEngine(
            deliveryStatusPort = deliveryPort,
            mailPort = mailPort,
            metrics = ReadmatesOperationalMetrics(registry),
        )

        val result = engine.sendClaimed(engineClaimedDelivery())

        assertThat(result).isEqualTo(DeliveryEngineResult.Sent)
        assertThat(mailPort.sent).containsExactly(
            MailDeliveryCommand(
                to = "member@example.com",
                subject = "Feedback document is ready",
                text = "ReadMates에서 확인해 주세요.",
                html = "<html><body>피드백 문서</body></html>",
            ),
        )
        assertThat(deliveryPort.sent).containsExactly(engineClaimedDelivery().id to engineClaimedDelivery().lockedAt)
        assertThat(engineCounter(registry, "readmates.notifications.sent")).isEqualTo(1.0)
    }

    @Test
    fun `sendClaimed marks failed and returns retryable failure before max attempts`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val registry = SimpleMeterRegistry()
        val engine = notificationDeliveryEngine(
            deliveryStatusPort = deliveryPort,
            mailPort = EngineFailingMailPort("smtp rejected"),
            metrics = ReadmatesOperationalMetrics(registry),
        )

        val result = engine.sendClaimed(engineClaimedDelivery(attemptCount = 1))

        assertThat(result).isInstanceOf(DeliveryEngineResult.RetryableFailure::class.java)
        assertThat((result as DeliveryEngineResult.RetryableFailure).message)
            .contains("smtp rejected")
            .doesNotContain("member@example.com")
        assertThat(deliveryPort.failed.map { it.id }).containsExactly(engineClaimedDelivery().id)
        assertThat(deliveryPort.failed.map { it.delayMinutes }).containsExactly(15L)
        assertThat(deliveryPort.dead).isEmpty()
        assertThat(engineCounter(registry, "readmates.notifications.failed")).isEqualTo(1.0)
    }

    @Test
    fun `sendClaimed marks dead and increments dead metric at max attempts`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val registry = SimpleMeterRegistry()
        val engine = notificationDeliveryEngine(
            deliveryStatusPort = deliveryPort,
            mailPort = EngineFailingMailPort("provider token=raw-secret failed for member@example.com"),
            metrics = ReadmatesOperationalMetrics(registry),
        )

        val result = engine.sendClaimed(engineClaimedDelivery(attemptCount = 4))

        assertThat(result).isEqualTo(DeliveryEngineResult.Dead)
        assertThat(deliveryPort.dead.map { it.id }).containsExactly(engineClaimedDelivery().id)
        assertThat(deliveryPort.dead.single().error)
            .contains("[redacted-secret]", "[redacted-email]")
            .doesNotContain("raw-secret")
            .doesNotContain("member@example.com")
        assertThat(deliveryPort.failed).isEmpty()
        assertThat(engineCounter(registry, "readmates.notifications.dead")).isEqualTo(1.0)
    }

    @Test
    fun `sendClaimed throws stale lease exception when status mark compare and swap fails`() {
        val deliveryPort = EngineRecordingDeliveryPort(markSentResult = false)
        val engine = notificationDeliveryEngine(deliveryPort, EngineRecordingMailPort())

        assertThatThrownBy { engine.sendClaimed(engineClaimedDelivery()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Could not mark email delivery")
            .hasMessageContaining("SENT")

        assertThat(deliveryPort.sent).containsExactly(engineClaimedDelivery().id to engineClaimedDelivery().lockedAt)
    }

    @Test
    fun `sendClaimed uses configured retry delays when marking retryable failure`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val engine = notificationDeliveryEngine(
            deliveryStatusPort = deliveryPort,
            mailPort = EngineFailingMailPort("smtp rejected"),
            retryDelayMinutesConfig = listOf(2L, 4L, 8L),
        )

        val result = engine.sendClaimed(engineClaimedDelivery(attemptCount = 2))

        assertThat(result).isInstanceOf(DeliveryEngineResult.RetryableFailure::class.java)
        assertThat(deliveryPort.failed.map { it.delayMinutes }).containsExactly(8L)
    }

    private fun notificationDeliveryEngine(
        deliveryStatusPort: NotificationDeliveryStatusPort,
        mailPort: MailDeliveryPort,
        metrics: ReadmatesOperationalMetrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
        maxAttempts: Int = 5,
        retryDelayMinutesConfig: List<Long> = listOf(5L, 15L, 60L, 240L),
    ): NotificationDeliveryEngine =
        NotificationDeliveryEngine(
            deliveryStatusPort = deliveryStatusPort,
            mailDeliveryPort = mailPort,
            metrics = metrics,
            maxAttempts = maxAttempts,
            retryDelayMinutesConfig = retryDelayMinutesConfig,
        )

    private fun engineCounter(registry: SimpleMeterRegistry, name: String): Double =
        registry.find(name)
            .tag("event_type", NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED.name)
            .counter()
            ?.count()
            ?: 0.0
}

private class EngineRecordingMailPort : MailDeliveryPort {
    val sent = mutableListOf<MailDeliveryCommand>()

    override fun send(command: MailDeliveryCommand) {
        sent += command
    }
}

private class EngineFailingMailPort(private val message: String) : MailDeliveryPort {
    override fun send(command: MailDeliveryCommand) {
        throw IllegalStateException(message)
    }
}

private data class EngineFailedMark(
    val id: UUID,
    val lockedAt: OffsetDateTime,
    val error: String,
    val delayMinutes: Long,
)

private data class EngineDeadMark(
    val id: UUID,
    val lockedAt: OffsetDateTime,
    val error: String,
)

private class EngineRecordingDeliveryPort(
    private val markSentResult: Boolean = true,
    private val markFailedResult: Boolean = true,
    private val markDeadResult: Boolean = true,
) : NotificationDeliveryStatusPort {
    val sent = mutableListOf<Pair<UUID, OffsetDateTime>>()
    val failed = mutableListOf<EngineFailedMark>()
    val dead = mutableListOf<EngineDeadMark>()

    override fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus? = error("unused")

    override fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime): Boolean {
        sent += id to lockedAt
        return markSentResult
    }

    override fun markDeliveryFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean {
        failed += EngineFailedMark(id, lockedAt, error, nextAttemptDelayMinutes)
        return markFailedResult
    }

    override fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean {
        dead += EngineDeadMark(id, lockedAt, error)
        return markDeadResult
    }

    override fun restoreDeadEmailDeliveryForClub(clubId: UUID, id: UUID): Boolean = error("unused")
}

private fun engineClaimedDelivery(
    attemptCount: Int = 0,
    recipientEmail: String? = "member@example.com",
    subject: String? = "Feedback document is ready",
    bodyText: String? = "ReadMates에서 확인해 주세요.",
): ClaimedNotificationDeliveryItem =
    ClaimedNotificationDeliveryItem(
        id = UUID.fromString("00000000-0000-0000-0000-000000000401"),
        eventId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
        eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        recipientMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000501"),
        channel = NotificationChannel.EMAIL,
        status = NotificationDeliveryStatus.SENDING,
        attemptCount = attemptCount,
        lockedAt = OffsetDateTime.of(2026, 4, 29, 1, 2, 3, 0, ZoneOffset.UTC),
        recipientEmail = recipientEmail,
        subject = subject,
        bodyText = bodyText,
        bodyHtml = "<html><body>피드백 문서</body></html>",
    )
