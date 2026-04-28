package com.readmates.notification.application.service

import com.readmates.notification.domain.NotificationEventType
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager

@Service
class ReadmatesOperationalMetrics(private val meterRegistry: MeterRegistry) {
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
}
