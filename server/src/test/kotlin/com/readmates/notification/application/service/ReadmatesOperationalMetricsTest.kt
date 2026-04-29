package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.OffsetDateTime
import java.util.UUID

class ReadmatesOperationalMetricsTest {
    @Test
    fun `sent metric increments with event type tag`() {
        val registry = SimpleMeterRegistry()
        val metrics = ReadmatesOperationalMetrics(registry)

        metrics.sent(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED)

        assertThat(
            registry.counter(
                "readmates.notifications.sent",
                "event_type",
                "FEEDBACK_DOCUMENT_PUBLISHED",
            ).count(),
        ).isEqualTo(1.0)
    }

    @Test
    fun `failed metric increments with event type tag`() {
        val registry = SimpleMeterRegistry()
        val metrics = ReadmatesOperationalMetrics(registry)

        metrics.failed(NotificationEventType.NEXT_BOOK_PUBLISHED)

        assertThat(
            registry.counter(
                "readmates.notifications.failed",
                "event_type",
                "NEXT_BOOK_PUBLISHED",
            ).count(),
        ).isEqualTo(1.0)
    }

    @Test
    fun `dead metric increments with event type tag`() {
        val registry = SimpleMeterRegistry()
        val metrics = ReadmatesOperationalMetrics(registry)

        metrics.dead(NotificationEventType.SESSION_REMINDER_DUE)

        assertThat(
            registry.counter(
                "readmates.notifications.dead",
                "event_type",
                "SESSION_REMINDER_DUE",
            ).count(),
        ).isEqualTo(1.0)
    }

    @Test
    fun `feedback upload metrics increment by result`() {
        val registry = SimpleMeterRegistry()
        val metrics = ReadmatesOperationalMetrics(registry)

        metrics.feedbackUploadSucceeded()
        metrics.feedbackUploadFailed()

        assertThat(registry.counter("readmates.feedback.uploads", "result", "success").count()).isEqualTo(1.0)
        assertThat(registry.counter("readmates.feedback.uploads", "result", "failure").count()).isEqualTo(1.0)
    }

    @Test
    fun `feedback upload success metric waits for transaction commit when transaction synchronization is active`() {
        val registry = SimpleMeterRegistry()
        val metrics = ReadmatesOperationalMetrics(registry)

        TransactionSynchronizationManager.initSynchronization()
        TransactionSynchronizationManager.setActualTransactionActive(true)
        try {
            metrics.feedbackUploadSucceeded()

            assertThat(registry.counter("readmates.feedback.uploads", "result", "success").count()).isZero()

            TransactionSynchronizationManager.getSynchronizations().forEach { it.afterCommit() }
        } finally {
            TransactionSynchronizationManager.setActualTransactionActive(false)
            TransactionSynchronizationManager.clearSynchronization()
        }

        assertThat(registry.counter("readmates.feedback.uploads", "result", "success").count()).isEqualTo(1.0)
    }

    @Test
    fun `notification delivery backlog gauges expose only status counts`() {
        val registry = SimpleMeterRegistry()
        val deliveryPort = FixedBacklogNotificationDeliveryPort(
            NotificationDeliveryBacklog(
                pending = 2,
                failed = 3,
                dead = 5,
                sending = 7,
            ),
        )

        ReadmatesOperationalMetrics(registry, deliveryPort)

        assertThat(registry.find("readmates.notifications.outbox.backlog").tag("status", "pending").gauge()?.value()).isEqualTo(2.0)
        assertThat(registry.find("readmates.notifications.outbox.backlog").tag("status", "failed").gauge()?.value()).isEqualTo(3.0)
        assertThat(registry.find("readmates.notifications.outbox.backlog").tag("status", "dead").gauge()?.value()).isEqualTo(5.0)
        assertThat(registry.find("readmates.notifications.outbox.backlog").tag("status", "sending").gauge()?.value()).isEqualTo(7.0)
        assertThat(deliveryPort.backlogReads).isGreaterThan(0)
        assertThat(
            registry.find("readmates.notifications.outbox.backlog")
                .meters()
                .flatMap { meter -> meter.id.tags.map { it.key } },
        ).containsOnly("status")
    }
}

private class FixedBacklogNotificationDeliveryPort(
    private val backlog: NotificationDeliveryBacklog,
) : NotificationDeliveryPort {
    var backlogReads = 0

    override fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> =
        emptyList()

    override fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? = null

    override fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> = emptyList()

    override fun claimEmailDeliveriesForClub(clubId: UUID, limit: Int): List<ClaimedNotificationDeliveryItem> =
        emptyList()

    override fun claimHostEmailDelivery(clubId: UUID, id: UUID): ClaimedNotificationDeliveryItem? = null

    override fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus? = null

    override fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime): Boolean = false

    override fun markDeliveryFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean =
        false

    override fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean = false

    override fun restoreDeadEmailDeliveryForClub(clubId: UUID, id: UUID): Boolean = false

    override fun hostSummary(clubId: UUID): HostNotificationSummary =
        HostNotificationSummary(
            pending = 0,
            failed = 0,
            dead = 0,
            sentLast24h = 0,
            latestFailures = emptyList(),
        )

    override fun listHostEmailItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList =
        HostNotificationItemList(emptyList())

    override fun hostEmailDetail(clubId: UUID, id: UUID): HostNotificationDetail? = null

    override fun deliveryBacklog(): NotificationDeliveryBacklog {
        backlogReads += 1
        return backlog
    }

    override fun countByStatus(
        clubId: UUID,
        channel: NotificationChannel?,
        status: NotificationDeliveryStatus,
    ): Int = 0

    override fun listHostDeliveries(
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        limit: Int,
    ): List<HostNotificationDelivery> = emptyList()
}
