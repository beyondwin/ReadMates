package com.readmates.notification.application.service

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryFailure
import com.readmates.notification.application.port.out.MailDeliveryFailureKind
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryStatusPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.ResourceLock
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID

@ResourceLock("NotificationDeliveryEngineLogger")
class NotificationDeliveryEngineTest {
    @Test
    fun `constructor rejects retry schedules that cannot cover every nonterminal delivery attempt`() {
        assertThatThrownBy {
            notificationDeliveryEngine(
                deliveryStatusPort = EngineRecordingDeliveryPort(),
                mailPort = EngineRecordingMailPort(),
                maxAttempts = 6,
                retryDelayMinutesConfig = listOf(5L, 15L, 60L, 240L),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("retry-delays")
            .hasMessageContaining("delivery attempt")
    }

    @Test
    fun `sendClaimed marks invalid persisted content dead without invoking mail`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val mailPort = EngineRecordingMailPort()
        val engine = notificationDeliveryEngine(deliveryPort, mailPort)

        val result = engine.sendClaimed(engineClaimedDelivery(recipientEmail = " "))

        assertThat(result).isEqualTo(DeliveryEngineResult.Dead)
        assertThat(mailPort.sent).isEmpty()
        assertThat(deliveryPort.sent).isEmpty()
        assertThat(deliveryPort.failed).isEmpty()
        assertThat(deliveryPort.dead.single().error).isEqualTo("DELIVERY_CONTENT_INVALID")
    }

    @Test
    fun `sendClaimed marks sent and increments sent metric after mail send succeeds`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val mailPort = EngineRecordingMailPort()
        val registry = SimpleMeterRegistry()
        val engine =
            notificationDeliveryEngine(
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
    fun `sendClaimed marks permanent mail failure dead on first attempt`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val registry = SimpleMeterRegistry()
        val engine =
            notificationDeliveryEngine(
                deliveryStatusPort = deliveryPort,
                mailPort = EngineFailingMailPort(MailDeliveryFailureKind.PERMANENT),
                metrics = ReadmatesOperationalMetrics(registry),
            )

        val result = engine.sendClaimed(engineClaimedDelivery(attemptCount = 0))

        assertThat(result).isEqualTo(DeliveryEngineResult.Dead)
        assertThat(deliveryPort.dead.single().error).isEqualTo("MAIL_PERMANENT")
        assertThat(deliveryPort.failed).isEmpty()
        assertThat(engineCounter(registry, "readmates.notifications.dead")).isEqualTo(1.0)
    }

    @Test
    fun `sendClaimed marks retryable mail failure failed before max attempts`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val registry = SimpleMeterRegistry()
        val engine =
            notificationDeliveryEngine(
                deliveryStatusPort = deliveryPort,
                mailPort = EngineFailingMailPort(MailDeliveryFailureKind.RETRYABLE),
                metrics = ReadmatesOperationalMetrics(registry),
            )

        val result = engine.sendClaimed(engineClaimedDelivery(attemptCount = 1))

        assertThat(result).isInstanceOf(DeliveryEngineResult.RetryableFailure::class.java)
        assertThat((result as DeliveryEngineResult.RetryableFailure).message).isEqualTo("MAIL_RETRYABLE")
        assertThat(deliveryPort.failed.map { it.id }).containsExactly(engineClaimedDelivery().id)
        assertThat(deliveryPort.failed.single().error).isEqualTo("MAIL_RETRYABLE")
        assertThat(deliveryPort.failed.map { it.delayMinutes }).containsExactly(15L)
        assertThat(deliveryPort.dead).isEmpty()
        assertThat(engineCounter(registry, "readmates.notifications.failed")).isEqualTo(1.0)
    }

    @Test
    fun `sendClaimed retries ambiguous mail failure then marks it dead at exact attempt ceiling`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val registry = SimpleMeterRegistry()
        val engine =
            notificationDeliveryEngine(
                deliveryStatusPort = deliveryPort,
                mailPort = EngineFailingMailPort(MailDeliveryFailureKind.AMBIGUOUS),
                metrics = ReadmatesOperationalMetrics(registry),
            )

        val retry = engine.sendClaimed(engineClaimedDelivery(attemptCount = 1))
        val exhausted = engine.sendClaimed(engineClaimedDelivery(attemptCount = 4))

        assertThat(retry).isEqualTo(DeliveryEngineResult.RetryableFailure("MAIL_AMBIGUOUS"))
        assertThat(exhausted).isEqualTo(DeliveryEngineResult.Dead)
        assertThat(deliveryPort.failed.single().error).isEqualTo("MAIL_AMBIGUOUS")
        assertThat(deliveryPort.dead.map { it.id }).containsExactly(engineClaimedDelivery().id)
        assertThat(deliveryPort.dead.single().error).isEqualTo("MAIL_AMBIGUOUS")
        assertThat(engineCounter(registry, "readmates.notifications.dead")).isEqualTo(1.0)
    }

    @Test
    fun `sendClaimed throws stale lease exception when status mark compare and swap fails`() {
        val deliveryPort = EngineRecordingDeliveryPort(markSentResult = false)
        val registry = SimpleMeterRegistry()
        val engine =
            notificationDeliveryEngine(
                deliveryStatusPort = deliveryPort,
                mailPort = EngineRecordingMailPort(),
                metrics = ReadmatesOperationalMetrics(registry),
            )

        assertThatThrownBy { engine.sendClaimed(engineClaimedDelivery()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Could not mark email delivery")
            .hasMessageContaining("SENT")

        assertThat(deliveryPort.sent).containsExactly(engineClaimedDelivery().id to engineClaimedDelivery().lockedAt)
        assertThat(engineCounter(registry, "readmates.notifications.sent")).isZero()
    }

    @Test
    fun `sendClaimed uses configured retry delays when marking retryable failure`() {
        val deliveryPort = EngineRecordingDeliveryPort()
        val engine =
            notificationDeliveryEngine(
                deliveryStatusPort = deliveryPort,
                mailPort = EngineFailingMailPort(MailDeliveryFailureKind.RETRYABLE),
                retryDelayMinutesConfig = listOf(2L, 4L, 8L, 16L),
            )

        val result = engine.sendClaimed(engineClaimedDelivery(attemptCount = 2))

        assertThat(result).isInstanceOf(DeliveryEngineResult.RetryableFailure::class.java)
        assertThat(deliveryPort.failed.map { it.delayMinutes }).containsExactly(8L)
    }

    @Test
    fun `sendClaimed permits one nanosecond before deadline and expires at exact deadline`() {
        val createdAt = OffsetDateTime.of(2026, 4, 29, 1, 2, 3, 0, ZoneOffset.UTC)
        val deadline = createdAt.toInstant().plus(Duration.ofHours(24))
        val beforeMail = EngineRecordingMailPort()
        val beforePort = EngineRecordingDeliveryPort()
        val beforeEngine =
            notificationDeliveryEngine(
                beforePort,
                beforeMail,
                clock = Clock.fixed(deadline.minusNanos(1), ZoneOffset.UTC),
            )

        assertThat(beforeEngine.sendClaimed(engineClaimedDelivery(createdAt = createdAt)))
            .isEqualTo(DeliveryEngineResult.Sent)
        assertThat(beforeMail.sent).hasSize(1)

        val deadlineMail = EngineRecordingMailPort()
        val deadlinePort = EngineRecordingDeliveryPort()
        val deadlineRegistry = SimpleMeterRegistry()
        val deadlineEngine =
            notificationDeliveryEngine(
                deliveryStatusPort = deadlinePort,
                mailPort = deadlineMail,
                metrics = ReadmatesOperationalMetrics(deadlineRegistry),
                clock = Clock.fixed(deadline, ZoneOffset.UTC),
            )

        assertThat(deadlineEngine.sendClaimed(engineClaimedDelivery(createdAt = createdAt)))
            .isEqualTo(DeliveryEngineResult.Dead)
        assertThat(deadlineMail.sent).isEmpty()
        assertThat(deadlinePort.dead.single().error).isEqualTo("DELIVERY_EXPIRED")
        assertThat(engineCounter(deadlineRegistry, "readmates.notifications.dead")).isEqualTo(1.0)
    }

    @Test
    fun `sendClaimed reads the clock once and records no committed metric when failure CAS loses`() {
        val deliveryPort = EngineRecordingDeliveryPort(markFailedResult = false)
        val registry = SimpleMeterRegistry()
        val clock = DeliveryCountingClock(Instant.parse("2026-04-29T02:00:00Z"))
        val engine =
            notificationDeliveryEngine(
                deliveryStatusPort = deliveryPort,
                mailPort = EngineFailingMailPort(MailDeliveryFailureKind.RETRYABLE),
                metrics = ReadmatesOperationalMetrics(registry),
                clock = clock,
            )

        assertThatThrownBy { engine.sendClaimed(engineClaimedDelivery()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("FAILED")

        assertThat(clock.calls).isEqualTo(1)
        assertThat(engineCounter(registry, "readmates.notifications.failed")).isZero()
        assertThat(engineCounter(registry, "readmates.notifications.dead")).isZero()
    }

    @Test
    fun `sendClaimed records no dead metric when permanent or expired CAS loses`() {
        val permanentRegistry = SimpleMeterRegistry()
        val permanentEngine =
            notificationDeliveryEngine(
                deliveryStatusPort = EngineRecordingDeliveryPort(markDeadResult = false),
                mailPort = EngineFailingMailPort(MailDeliveryFailureKind.PERMANENT),
                metrics = ReadmatesOperationalMetrics(permanentRegistry),
            )

        assertThatThrownBy { permanentEngine.sendClaimed(engineClaimedDelivery()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("DEAD")
        assertThat(engineCounter(permanentRegistry, "readmates.notifications.dead")).isZero()

        val expiredRegistry = SimpleMeterRegistry()
        val expiredAt = Instant.parse("2026-04-30T01:02:03Z")
        val expiredEngine =
            notificationDeliveryEngine(
                deliveryStatusPort = EngineRecordingDeliveryPort(markDeadResult = false),
                mailPort = EngineRecordingMailPort(),
                metrics = ReadmatesOperationalMetrics(expiredRegistry),
                clock = Clock.fixed(expiredAt, ZoneOffset.UTC),
            )

        assertThatThrownBy { expiredEngine.sendClaimed(engineClaimedDelivery()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("DEAD")
        assertThat(engineCounter(expiredRegistry, "readmates.notifications.dead")).isZero()
    }

    private fun notificationDeliveryEngine(
        deliveryStatusPort: NotificationDeliveryStatusPort,
        mailPort: MailDeliveryPort,
        metrics: ReadmatesOperationalMetrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
        maxAttempts: Int = 5,
        retryDelayMinutesConfig: List<Long> = listOf(5L, 15L, 60L, 240L),
        deliveryMaxAge: Duration = Duration.ofHours(24),
        clock: Clock = Clock.fixed(Instant.parse("2026-04-29T02:00:00Z"), ZoneOffset.UTC),
    ): NotificationDeliveryEngine =
        NotificationDeliveryEngine(
            deliveryStatusPort = deliveryStatusPort,
            mailDeliveryPort = mailPort,
            metrics = metrics,
            runtimeProperties =
                NotificationRuntimeProperties(
                    worker =
                        NotificationRuntimeProperties.Worker(
                            deliveryMaxAge = deliveryMaxAge,
                            retryDelays = retryDelayMinutesConfig.map(Duration::ofMinutes),
                        ),
                    kafka = NotificationRuntimeProperties.Kafka(maxDeliveryAttempts = maxAttempts),
                ),
            clock = clock,
        )

    private fun engineCounter(
        registry: SimpleMeterRegistry,
        name: String,
    ): Double =
        registry
            .find(name)
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

private class EngineFailingMailPort(
    private val kind: MailDeliveryFailureKind,
) : MailDeliveryPort {
    override fun send(command: MailDeliveryCommand): Unit = throw MailDeliveryFailure(kind)
}

private class DeliveryCountingClock(
    private val fixedInstant: Instant,
) : Clock() {
    var calls: Int = 0
        private set

    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId): Clock = this

    override fun instant(): Instant {
        calls += 1
        return fixedInstant
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

    override fun markDeliverySent(
        id: UUID,
        lockedAt: OffsetDateTime,
    ): Boolean {
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

    override fun markDeliveryDead(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
    ): Boolean {
        dead += EngineDeadMark(id, lockedAt, error)
        return markDeadResult
    }

    override fun restoreDeadEmailDeliveryForClub(
        clubId: UUID,
        id: UUID,
    ): Boolean = error("unused")
}

private fun engineClaimedDelivery(
    attemptCount: Int = 0,
    recipientEmail: String? = "member@example.com",
    subject: String? = "Feedback document is ready",
    bodyText: String? = "ReadMates에서 확인해 주세요.",
    createdAt: OffsetDateTime = OffsetDateTime.of(2026, 4, 29, 1, 2, 3, 0, ZoneOffset.UTC),
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
        createdAt = createdAt,
        recipientEmail = recipientEmail,
        subject = subject,
        bodyText = bodyText,
        bodyHtml = "<html><body>피드백 문서</body></html>",
    )
