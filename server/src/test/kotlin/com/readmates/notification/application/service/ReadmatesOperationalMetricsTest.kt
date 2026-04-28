package com.readmates.notification.application.service

import com.readmates.notification.domain.NotificationEventType
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionSynchronizationManager

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
}
