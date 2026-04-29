package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationOutboxBacklog
import com.readmates.notification.application.port.out.NotificationOutboxPort
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
    private val notificationOutboxPort: NotificationOutboxPort? = null,
) {
    init {
        registerOutboxBacklogGauges()
    }

    fun sent(eventType: NotificationEventType) {
        Counter.builder("readmates.notifications.sent")
            .tag("event_type", eventType.name)
            .register(meterRegistry)
            .increment()
    }

    fun failed(eventType: NotificationEventType) {
        Counter.builder("readmates.notifications.failed")
            .tag("event_type", eventType.name)
            .register(meterRegistry)
            .increment()
    }

    fun dead(eventType: NotificationEventType) {
        Counter.builder("readmates.notifications.dead")
            .tag("event_type", eventType.name)
            .register(meterRegistry)
            .increment()
    }

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

    fun feedbackUploadFailed() {
        incrementFeedbackUpload("failure")
    }

    private fun incrementFeedbackUpload(result: String) {
        meterRegistry.counter("readmates.feedback.uploads", "result", result).increment()
    }

    private fun registerOutboxBacklogGauges() {
        val port = notificationOutboxPort ?: return
        OutboxBacklogStatus.entries.forEach { status ->
            Gauge.builder("readmates.notifications.outbox.backlog") {
                port.outboxBacklog().count(status).toDouble()
            }
                .description("Current notification outbox rows by delivery status")
                .tag("status", status.tag)
                .register(meterRegistry)
        }
    }
}

private enum class OutboxBacklogStatus(val tag: String) {
    PENDING("pending"),
    FAILED("failed"),
    DEAD("dead"),
    SENDING("sending"),
}

private fun NotificationOutboxBacklog.count(status: OutboxBacklogStatus): Int =
    when (status) {
        OutboxBacklogStatus.PENDING -> pending
        OutboxBacklogStatus.FAILED -> failed
        OutboxBacklogStatus.DEAD -> dead
        OutboxBacklogStatus.SENDING -> sending
    }
