package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.domain.NotificationEventType
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager

@Service
class ReadmatesOperationalMetrics(
    private val meterRegistry: MeterRegistry,
    private val cachedBacklogProvider: CachedNotificationBacklogProvider? = null,
) {
    init {
        registerOutboxBacklogGauges()
    }

    /**
     * Increments the `readmates.notifications.sent` counter for the given [eventType].
     *
     * **Metric tag policy:** only enum / low-cardinality values are permitted as tag values.
     * Never add high-cardinality identifiers such as `club_id`, `user_id`, `membership_id`,
     * `recipient_email`, `event_id`, `delivery_id`, or `session_id` as tags — each unique
     * combination creates a separate Prometheus time series and will rapidly exhaust storage.
     * For row-level audit queries use the `notification_deliveries` table instead.
     *
     * @see <a href="../../../../../../../../../../../docs/development/technical-decisions.md">technical-decisions.md — Prometheus metric tag에는 enum/low-cardinality 값만 사용한다</a>
     */
    fun sent(eventType: NotificationEventType) {
        Counter
            .builder("readmates.notifications.sent")
            .tag("event_type", eventType.name)
            .register(meterRegistry)
            .increment()
    }

    /**
     * Increments the `readmates.notifications.failed` counter for the given [eventType].
     *
     * **Metric tag policy:** only enum / low-cardinality values are permitted as tag values.
     * Never add high-cardinality identifiers such as `club_id`, `user_id`, `membership_id`,
     * `recipient_email`, `event_id`, `delivery_id`, or `session_id` as tags — each unique
     * combination creates a separate Prometheus time series and will rapidly exhaust storage.
     * For row-level audit queries use the `notification_deliveries` table instead.
     *
     * @see <a href="../../../../../../../../../../../docs/development/technical-decisions.md">technical-decisions.md — Prometheus metric tag에는 enum/low-cardinality 값만 사용한다</a>
     */
    fun failed(eventType: NotificationEventType) {
        Counter
            .builder("readmates.notifications.failed")
            .tag("event_type", eventType.name)
            .register(meterRegistry)
            .increment()
    }

    /**
     * Increments the `readmates.notifications.dead` counter for the given [eventType].
     *
     * **Metric tag policy:** only enum / low-cardinality values are permitted as tag values.
     * Never add high-cardinality identifiers such as `club_id`, `user_id`, `membership_id`,
     * `recipient_email`, `event_id`, `delivery_id`, or `session_id` as tags — each unique
     * combination creates a separate Prometheus time series and will rapidly exhaust storage.
     * For row-level audit queries use the `notification_deliveries` table instead.
     *
     * @see <a href="../../../../../../../../../../../docs/development/technical-decisions.md">technical-decisions.md — Prometheus metric tag에는 enum/low-cardinality 값만 사용한다</a>
     */
    fun dead(eventType: NotificationEventType) {
        Counter
            .builder("readmates.notifications.dead")
            .tag("event_type", eventType.name)
            .register(meterRegistry)
            .increment()
    }

    /**
     * Increments the `readmates.feedback.uploads` counter with `result=success` after the
     * current transaction commits. If no active transaction is present the counter is
     * incremented immediately.
     *
     * **Metric tag policy:** only enum / low-cardinality values are permitted as tag values.
     * Never add high-cardinality identifiers such as `club_id`, `user_id`, `membership_id`,
     * `recipient_email`, `event_id`, `delivery_id`, or `session_id` as tags — each unique
     * combination creates a separate Prometheus time series and will rapidly exhaust storage.
     * For row-level audit queries use the `notification_deliveries` table instead.
     *
     * @see <a href="../../../../../../../../../../../docs/development/technical-decisions.md">technical-decisions.md — Prometheus metric tag에는 enum/low-cardinality 값만 사용한다</a>
     */
    fun feedbackUploadSucceeded() {
        if (
            TransactionSynchronizationManager.isSynchronizationActive() &&
            TransactionSynchronizationManager.isActualTransactionActive()
        ) {
            TransactionSynchronizationManager.registerSynchronization(
                object : TransactionSynchronization {
                    override fun afterCommit() {
                        incrementFeedbackUpload("success")
                    }
                },
            )
        } else {
            incrementFeedbackUpload("success")
        }
    }

    /**
     * Increments the `readmates.feedback.uploads` counter with `result=failure`.
     *
     * **Metric tag policy:** only enum / low-cardinality values are permitted as tag values.
     * Never add high-cardinality identifiers such as `club_id`, `user_id`, `membership_id`,
     * `recipient_email`, `event_id`, `delivery_id`, or `session_id` as tags — each unique
     * combination creates a separate Prometheus time series and will rapidly exhaust storage.
     * For row-level audit queries use the `notification_deliveries` table instead.
     *
     * @see <a href="../../../../../../../../../../../docs/development/technical-decisions.md">technical-decisions.md — Prometheus metric tag에는 enum/low-cardinality 값만 사용한다</a>
     */
    fun feedbackUploadFailed() {
        incrementFeedbackUpload("failure")
    }

    private fun incrementFeedbackUpload(result: String) {
        meterRegistry.counter("readmates.feedback.uploads", "result", result).increment()
    }

    private fun registerOutboxBacklogGauges() {
        val provider = cachedBacklogProvider ?: return
        OutboxBacklogStatus.entries.forEach { status ->
            Gauge
                .builder("readmates.notifications.outbox.backlog") {
                    provider.snapshot().count(status).toDouble()
                }.description("Current email notification delivery rows by status")
                .tag("status", status.tag)
                .register(meterRegistry)
        }
    }
}

private enum class OutboxBacklogStatus(
    val tag: String,
) {
    PENDING("pending"),
    FAILED("failed"),
    DEAD("dead"),
    SENDING("sending"),
}

private fun NotificationDeliveryBacklog.count(status: OutboxBacklogStatus): Int =
    when (status) {
        OutboxBacklogStatus.PENDING -> pending
        OutboxBacklogStatus.FAILED -> failed
        OutboxBacklogStatus.DEAD -> dead
        OutboxBacklogStatus.SENDING -> sending
    }
