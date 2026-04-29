package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class NotificationDispatchServiceTest {
    @Test
    fun `dispatch persists planned deliveries sends claimed email and marks sent`() {
        val deliveryPort = FakeDeliveryPort(deliveries = listOf(emailDelivery()))
        val mailPort = RecordingMailPort()
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        service.dispatch(message())

        assertThat(deliveryPort.persistedMessages).containsExactly(message())
        assertThat(deliveryPort.claimedIds).containsExactly(emailDelivery().id)
        assertThat(mailPort.sent).containsExactly(
            MailDeliveryCommand(
                to = "member@example.com",
                subject = "다음 책이 공개되었습니다",
                text = "다음 책을 확인해 주세요.",
            ),
        )
        assertThat(deliveryPort.sent).containsExactly(emailDelivery().id to claimedEmailDelivery().lockedAt)
    }

    @Test
    fun `dispatch does not send in app deliveries`() {
        val deliveryPort = FakeDeliveryPort(deliveries = listOf(inAppDelivery()))
        val mailPort = RecordingMailPort()
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        service.dispatch(message())

        assertThat(deliveryPort.persistedMessages).containsExactly(message())
        assertThat(deliveryPort.claimedIds).isEmpty()
        assertThat(mailPort.sent).isEmpty()
        assertThat(deliveryPort.sent).isEmpty()
    }

    @Test
    fun `dispatch marks failed and throws retryable exception before max attempts`() {
        val deliveryPort = FakeDeliveryPort(deliveries = listOf(emailDelivery(attemptCount = 1)))
        val mailPort = FailingMailPort("smtp rejected")
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        assertThatThrownBy { service.dispatch(message()) }
            .isInstanceOf(NotificationDeliveryRetryableException::class.java)
            .hasMessageContaining("smtp rejected")
            .hasCauseInstanceOf(IllegalStateException::class.java)

        assertThat(deliveryPort.failed.map { it.id }).containsExactly(emailDelivery().id)
        assertThat(deliveryPort.failed.map { it.delayMinutes }).containsExactly(15L)
        assertThat(deliveryPort.failed.single().error).contains("smtp rejected")
        assertThat(deliveryPort.dead).isEmpty()
    }

    @Test
    fun `dispatch marks dead and completes when attempts are exhausted`() {
        val deliveryPort = FakeDeliveryPort(deliveries = listOf(emailDelivery(attemptCount = 4)))
        val mailPort = FailingMailPort("token=secret member@example.com " + "x".repeat(600))
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        assertThatCode { service.dispatch(message()) }
            .doesNotThrowAnyException()

        assertThat(deliveryPort.dead.map { it.id }).containsExactly(emailDelivery().id)
        assertThat(deliveryPort.dead.single().error).hasSize(500)
        assertThat(deliveryPort.dead.single().error).contains("[redacted-secret]", "[redacted-email]")
        assertThat(deliveryPort.failed).isEmpty()
    }

    @Test
    fun `dispatch throws when mark sent lease compare and swap fails`() {
        val deliveryPort = FakeDeliveryPort(
            deliveries = listOf(emailDelivery()),
            markSentResult = false,
        )
        val mailPort = RecordingMailPort()
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        assertThatThrownBy { service.dispatch(message()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Could not mark email delivery")
            .hasMessageContaining("SENT")

        assertThat(mailPort.sent).hasSize(1)
        assertThat(deliveryPort.sent).containsExactly(emailDelivery().id to claimedEmailDelivery().lockedAt)
    }

    @Test
    fun `dispatch throws when mark failed lease compare and swap fails`() {
        val deliveryPort = FakeDeliveryPort(
            deliveries = listOf(emailDelivery(attemptCount = 1)),
            markFailedResult = false,
        )
        val mailPort = FailingMailPort("smtp rejected")
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        assertThatThrownBy { service.dispatch(message()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Could not mark email delivery")
            .hasMessageContaining("FAILED")

        assertThat(deliveryPort.failed.map { it.id }).containsExactly(emailDelivery().id)
        assertThat(deliveryPort.dead).isEmpty()
    }

    @Test
    fun `dispatch throws when mark dead lease compare and swap fails`() {
        val deliveryPort = FakeDeliveryPort(
            deliveries = listOf(emailDelivery(attemptCount = 4)),
            markDeadResult = false,
        )
        val mailPort = FailingMailPort("smtp rejected")
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        assertThatThrownBy { service.dispatch(message()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Could not mark email delivery")
            .hasMessageContaining("DEAD")

        assertThat(deliveryPort.dead.map { it.id }).containsExactly(emailDelivery().id)
        assertThat(deliveryPort.failed).isEmpty()
    }

    @Test
    fun `dispatch throws when failed email delivery is not claimable yet`() {
        val deliveryPort = FakeDeliveryPort(
            deliveries = listOf(emailDelivery(status = NotificationDeliveryStatus.FAILED)),
            claimable = false,
        )
        val mailPort = RecordingMailPort()
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        assertThatThrownBy { service.dispatch(message()) }
            .isInstanceOf(NotificationDeliveryRetryableException::class.java)
            .hasMessageContaining("not claimable")

        assertThat(deliveryPort.claimedIds).containsExactly(emailDelivery().id)
        assertThat(mailPort.sent).isEmpty()
        assertThat(deliveryPort.sent).isEmpty()
        assertThat(deliveryPort.failed).isEmpty()
        assertThat(deliveryPort.dead).isEmpty()
    }

    @Test
    fun `dispatch skips already sent email delivery when row cannot be claimed`() {
        val deliveryPort = FakeDeliveryPort(
            deliveries = listOf(emailDelivery(status = NotificationDeliveryStatus.SENT)),
            claimable = false,
        )
        val mailPort = RecordingMailPort()
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        service.dispatch(message())

        assertThat(deliveryPort.claimedIds).containsExactly(emailDelivery().id)
        assertThat(mailPort.sent).isEmpty()
        assertThat(deliveryPort.sent).isEmpty()
        assertThat(deliveryPort.failed).isEmpty()
        assertThat(deliveryPort.dead).isEmpty()
    }

    @Test
    fun `dispatch skips already skipped email delivery when row cannot be claimed`() {
        val deliveryPort = FakeDeliveryPort(
            deliveries = listOf(emailDelivery(status = NotificationDeliveryStatus.SKIPPED)),
            claimable = false,
        )
        val mailPort = RecordingMailPort()
        val service = NotificationDispatchService(deliveryPort, mailPort, maxAttempts = 5)

        service.dispatch(message())

        assertThat(deliveryPort.claimedIds).containsExactly(emailDelivery().id)
        assertThat(mailPort.sent).isEmpty()
        assertThat(deliveryPort.sent).isEmpty()
        assertThat(deliveryPort.failed).isEmpty()
        assertThat(deliveryPort.dead).isEmpty()
    }

    private fun message(): NotificationEventMessage =
        NotificationEventMessage(
            eventId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
            occurredAt = OffsetDateTime.of(2026, 4, 29, 1, 2, 3, 0, ZoneOffset.UTC),
            payload = NotificationEventPayload(
                sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
                sessionNumber = 8,
                bookTitle = "Distributed Systems",
            ),
        )

    private fun emailDelivery(
        attemptCount: Int = 0,
        status: NotificationDeliveryStatus = NotificationDeliveryStatus.PENDING,
    ): NotificationDeliveryItem =
        NotificationDeliveryItem(
            id = UUID.fromString("00000000-0000-0000-0000-000000000401"),
            eventId = message().eventId,
            clubId = message().clubId,
            recipientMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000501"),
            channel = NotificationChannel.EMAIL,
            status = status,
            attemptCount = attemptCount,
            lockedAt = null,
            recipientEmail = "member@example.com",
            subject = "다음 책이 공개되었습니다",
            bodyText = "다음 책을 확인해 주세요.",
        )

    private fun inAppDelivery(): NotificationDeliveryItem =
        emailDelivery().copy(
            id = UUID.fromString("00000000-0000-0000-0000-000000000402"),
            channel = NotificationChannel.IN_APP,
            status = NotificationDeliveryStatus.SENT,
            recipientEmail = null,
            subject = null,
            bodyText = null,
        )

    private fun claimedEmailDelivery(): ClaimedNotificationDeliveryItem =
        emailDelivery().let {
            ClaimedNotificationDeliveryItem(
                id = it.id,
                eventId = it.eventId,
                clubId = it.clubId,
                recipientMembershipId = it.recipientMembershipId,
                channel = it.channel,
                status = NotificationDeliveryStatus.SENDING,
                attemptCount = it.attemptCount,
                lockedAt = OffsetDateTime.of(2026, 4, 29, 1, 3, 0, 0, ZoneOffset.UTC),
                recipientEmail = it.recipientEmail,
                subject = it.subject,
                bodyText = it.bodyText,
            )
        }

    private data class FailedMark(
        val id: UUID,
        val lockedAt: OffsetDateTime,
        val error: String,
        val delayMinutes: Long,
    )

    private data class DeadMark(
        val id: UUID,
        val lockedAt: OffsetDateTime,
        val error: String,
    )

    private class FakeDeliveryPort(
        private val deliveries: List<NotificationDeliveryItem>,
        private val claimable: Boolean = true,
        private val markSentResult: Boolean = true,
        private val markFailedResult: Boolean = true,
        private val markDeadResult: Boolean = true,
    ) : NotificationDeliveryPort {
        val persistedMessages = mutableListOf<NotificationEventMessage>()
        val claimedIds = mutableListOf<UUID>()
        val sent = mutableListOf<Pair<UUID, OffsetDateTime>>()
        val failed = mutableListOf<FailedMark>()
        val dead = mutableListOf<DeadMark>()

        override fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> {
            persistedMessages += message
            return deliveries
        }

        override fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? {
            claimedIds += id
            if (!claimable) {
                return null
            }
            val planned = deliveries.firstOrNull { it.id == id } ?: return null
            return ClaimedNotificationDeliveryItem(
                id = planned.id,
                eventId = planned.eventId,
                clubId = planned.clubId,
                recipientMembershipId = planned.recipientMembershipId,
                channel = planned.channel,
                status = NotificationDeliveryStatus.SENDING,
                attemptCount = planned.attemptCount,
                lockedAt = OffsetDateTime.of(2026, 4, 29, 1, 3, 0, 0, ZoneOffset.UTC),
                recipientEmail = planned.recipientEmail,
                subject = planned.subject,
                bodyText = planned.bodyText,
            )
        }

        override fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> =
            deliveries
                .filter { it.channel == NotificationChannel.EMAIL }
                .take(limit.coerceAtLeast(0))
                .mapNotNull { claimEmailDelivery(it.id) }

        override fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus? =
            deliveries.firstOrNull { it.id == id }?.status

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
            failed += FailedMark(id, lockedAt, error, nextAttemptDelayMinutes)
            return markFailedResult
        }

        override fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean {
            dead += DeadMark(id, lockedAt, error)
            return markDeadResult
        }

        override fun countByStatus(
            clubId: UUID,
            channel: NotificationChannel?,
            status: NotificationDeliveryStatus,
        ): Int = 0
    }

    private class RecordingMailPort : MailDeliveryPort {
        val sent = mutableListOf<MailDeliveryCommand>()

        override fun send(command: MailDeliveryCommand) {
            sent += command
        }
    }

    private class FailingMailPort(private val message: String) : MailDeliveryPort {
        override fun send(command: MailDeliveryCommand) {
            throw IllegalStateException(message)
        }
    }
}
