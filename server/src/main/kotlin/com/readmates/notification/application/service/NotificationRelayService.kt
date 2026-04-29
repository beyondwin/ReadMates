package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.application.port.`in`.PublishNotificationEventsUseCase
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service

private const val MAX_PUBLISH_ERROR_LENGTH = 500
private const val MISSING_EVENT_MESSAGE_ERROR = "Notification event message missing"
private val PUBLISH_RETRY_DELAYS_MINUTES = listOf(5L, 15L, 60L, 240L)

@Service
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class NotificationRelayService(
    private val notificationEventOutboxPort: NotificationEventOutboxPort,
    private val notificationEventPublisherPort: NotificationEventPublisherPort,
    @param:Value("\${readmates.notifications.kafka.max-publish-attempts:5}") private val maxAttempts: Int,
) : PublishNotificationEventsUseCase {
    override fun publishPending(limit: Int): Int {
        if (limit <= 0) {
            return 0
        }

        val items = notificationEventOutboxPort.claimPublishable(limit)
        items.forEach(::publish)
        return items.size
    }

    private fun publish(item: NotificationEventOutboxItem) {
        val message = notificationEventOutboxPort.loadMessage(item.id)
        if (message == null) {
            notificationEventOutboxPort.markPublishDead(item.id, item.lockedAt, MISSING_EVENT_MESSAGE_ERROR)
            return
        }

        try {
            notificationEventPublisherPort.publish(message, item.kafkaTopic, item.kafkaKey)
            notificationEventOutboxPort.markPublished(item.id, item.lockedAt)
        } catch (exception: Exception) {
            val error = exception.toPublishStorageError()
            if (item.attemptCount + 1 >= maxAttempts.coerceAtLeast(1)) {
                notificationEventOutboxPort.markPublishDead(item.id, item.lockedAt, error)
            } else {
                notificationEventOutboxPort.markPublishFailed(
                    id = item.id,
                    lockedAt = item.lockedAt,
                    error = error,
                    nextAttemptDelayMinutes = retryDelayMinutes(item.attemptCount),
                )
            }
        }
    }

    private fun retryDelayMinutes(attemptCount: Int): Long =
        PUBLISH_RETRY_DELAYS_MINUTES[attemptCount.coerceIn(0, PUBLISH_RETRY_DELAYS_MINUTES.lastIndex)]

    private fun Exception.toPublishStorageError(): String =
        sanitizeNotificationError(message ?: javaClass.simpleName, MAX_PUBLISH_ERROR_LENGTH)
            ?: javaClass.simpleName.take(MAX_PUBLISH_ERROR_LENGTH)
}
