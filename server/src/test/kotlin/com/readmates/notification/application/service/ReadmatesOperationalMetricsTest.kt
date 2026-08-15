package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationBacklogRefreshResult
import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.model.NotificationEventOutboxBacklog
import com.readmates.notification.application.port.out.NotificationDeliveryBacklogPort
import com.readmates.notification.application.port.out.NotificationEventOutboxBacklogPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.data.Offset
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.Duration
import java.util.UUID
import java.util.concurrent.TimeUnit

class ReadmatesOperationalMetricsTest {
    @Test
    fun `outbox publish metric exposes exactly the fixed result tags`() {
        val registry = SimpleMeterRegistry()
        val metrics = ReadmatesOperationalMetrics(registry)

        NotificationEventPublishResult.entries.forEach(metrics::recordOutboxPublish)

        assertThat(
            registry
                .find("readmates.outbox.publish")
                .counters()
                .map { counter -> counter.id.getTag("result") },
        ).containsExactlyInAnyOrder(
            "success",
            "failure",
            "dead",
            "missing_payload",
            "expired",
            "stale_lease",
        )
        assertThat(
            registry
                .find("readmates.outbox.publish")
                .meters()
                .flatMap { meter -> meter.id.tags.map { it.key } },
        ).containsOnly("result")
        assertThat(registry.find("readmates.outbox.publish").counters())
            .allSatisfy { counter -> assertThat(counter.count()).isEqualTo(1.0) }
    }

    @Test
    fun `sent metric increments with event type tag`() {
        val registry = SimpleMeterRegistry()
        val metrics = ReadmatesOperationalMetrics(registry)

        metrics.sent(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED)

        assertThat(
            registry
                .counter(
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
            registry
                .counter(
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
            registry
                .counter(
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
    fun `recordDeliveryLatency emits histogram bucket for event_type`() {
        val registry = SimpleMeterRegistry()
        val metrics = ReadmatesOperationalMetrics(registry, cachedBacklogProvider = null)

        metrics.recordDeliveryLatency(
            NotificationEventType.NEXT_BOOK_PUBLISHED,
            Duration.ofSeconds(42),
        )

        val timer =
            registry
                .find("readmates.notifications.delivery.latency")
                .tag("event_type", "NEXT_BOOK_PUBLISHED")
                .timer()
        assertThat(timer).isNotNull
        assertThat(timer!!.count()).isEqualTo(1L)
        assertThat(timer.totalTime(TimeUnit.SECONDS)).isCloseTo(42.0, Offset.offset(0.001))
    }

    @Test
    fun `backlog gauges are unavailable before their sources first succeed`() {
        val registry = SimpleMeterRegistry()
        val provider =
            CachedNotificationBacklogProvider(
                FixedEventBacklogPort(NotificationEventOutboxBacklog(2, 3, 5, 7)),
                FixedDeliveryBacklogPort(NotificationDeliveryBacklog(11, 13, 17, 19)),
            )

        ReadmatesOperationalMetrics(registry, provider)

        assertThat(backlogGaugeValues(registry, "readmates.notifications.outbox.backlog").values)
            .allMatch(Double::isNaN)
        assertThat(backlogGaugeValues(registry, "readmates.notifications.delivery.backlog").values)
            .allMatch(Double::isNaN)
    }

    @Test
    fun `event outbox and delivery gauges expose separate exact statuses`() {
        val registry = SimpleMeterRegistry()
        val provider =
            CachedNotificationBacklogProvider(
                FixedEventBacklogPort(NotificationEventOutboxBacklog(2, 3, 5, 7)),
                FixedDeliveryBacklogPort(NotificationDeliveryBacklog(11, 13, 17, 19)),
            )
        assertThat(provider.refresh()).isEqualTo(NotificationBacklogRefreshResult.SUCCESS)

        ReadmatesOperationalMetrics(registry, provider)

        assertThat(backlogGaugeValues(registry, "readmates.notifications.outbox.backlog"))
            .containsExactlyInAnyOrderEntriesOf(
                mapOf("pending" to 2.0, "failed" to 3.0, "dead" to 5.0, "publishing" to 7.0),
            )
        assertThat(backlogGaugeValues(registry, "readmates.notifications.delivery.backlog"))
            .containsExactlyInAnyOrderEntriesOf(
                mapOf("pending" to 11.0, "failed" to 13.0, "dead" to 17.0, "sending" to 19.0),
            )
        assertThat(
            registry
                .find("readmates.notifications.outbox.backlog")
                .meters()
                .flatMap { meter -> meter.id.tags.map { it.key } },
        ).containsOnly("status")
        assertThat(
            registry
                .find("readmates.notifications.delivery.backlog")
                .meters()
                .flatMap { meter -> meter.id.tags.map { it.key } },
        ).containsOnly("status")
    }

    @Test
    fun `backlog refresh metric exposes exactly the fixed results`() {
        val registry = SimpleMeterRegistry()
        val metrics = ReadmatesOperationalMetrics(registry)

        NotificationBacklogRefreshResult.entries.forEach(metrics::recordBacklogRefresh)

        assertThat(
            registry
                .find("readmates.notifications.backlog.refresh")
                .counters()
                .associate { counter -> counter.id.getTag("result") to counter.count() },
        ).containsExactlyInAnyOrderEntriesOf(
            mapOf("success" to 1.0, "partial" to 1.0, "failure" to 1.0),
        )
        assertThat(
            registry
                .find("readmates.notifications.backlog.refresh")
                .meters()
                .flatMap { meter -> meter.id.tags.map { tag -> tag.key } },
        ).containsOnly("result")
    }
}

private fun backlogGaugeValues(
    registry: SimpleMeterRegistry,
    name: String,
): Map<String, Double> =
    registry
        .find(name)
        .gauges()
        .associate { gauge -> requireNotNull(gauge.id.getTag("status")) to gauge.value() }

private class FixedEventBacklogPort(
    private val backlog: NotificationEventOutboxBacklog,
) : NotificationEventOutboxBacklogPort {
    override fun eventOutboxBacklog(): NotificationEventOutboxBacklog = backlog
}

private class FixedDeliveryBacklogPort(
    private val backlog: NotificationDeliveryBacklog,
) : NotificationDeliveryBacklogPort {
    override fun deliveryBacklog(): NotificationDeliveryBacklog = backlog

    override fun countByStatus(
        clubId: UUID,
        channel: NotificationChannel?,
        status: NotificationDeliveryStatus,
    ): Int = 0
}
