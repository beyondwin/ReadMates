package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.application.port.`in`.ProcessNotificationDeliveriesUseCase
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationDeliveryStatus
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.UUID

private const val MAX_PROCESSING_ERROR_LENGTH = 500
private val PROCESSING_RETRY_DELAYS_MINUTES = listOf(5L, 15L, 60L, 240L)

@Service
class NotificationDeliveryProcessingService(
    private val notificationDeliveryPort: NotificationDeliveryPort,
    private val mailDeliveryPort: MailDeliveryPort,
    private val metrics: ReadmatesOperationalMetrics,
    @param:Value("\${readmates.notifications.kafka.max-delivery-attempts:5}") private val maxAttempts: Int,
    @param:Value("\${readmates.notifications.enabled:false}") private val deliveryEnabled: Boolean = true,
) : ProcessNotificationDeliveriesUseCase {
    override fun processPending(limit: Int): Int {
        if (limit <= 0 || !deliveryEnabled) {
            return 0
        }

        val items = notificationDeliveryPort.claimEmailDeliveries(limit)
        items.forEach(::processClaimed)
        return items.size
    }

    override fun processPendingForClub(clubId: UUID, limit: Int): Int {
        if (limit <= 0 || !deliveryEnabled) {
            return 0
        }

        val items = notificationDeliveryPort.claimEmailDeliveriesForClub(clubId, limit)
        items.forEach(::processClaimed)
        return items.size
    }

    fun processClaimed(item: ClaimedNotificationDeliveryItem) {
        try {
            mailDeliveryPort.send(
                MailDeliveryCommand(
                    to = requiredDeliveryField(item.id, "recipientEmail", item.recipientEmail),
                    subject = requiredDeliveryField(item.id, "subject", item.subject),
                    text = requiredDeliveryField(item.id, "bodyText", item.bodyText),
                ),
            )
        } catch (exception: Exception) {
            markFailure(item, exception)
            return
        }

        val marked = notificationDeliveryPort.markDeliverySent(item.id, item.lockedAt)
        require(marked) {
            staleDeliveryLeaseMessage(item.id, NotificationDeliveryStatus.SENT)
        }
        metrics.sent(item.eventType)
    }

    private fun markFailure(item: ClaimedNotificationDeliveryItem, exception: Exception) {
        val error = exception.toStorageError()
        if (item.attemptCount + 1 >= maxAttempts.coerceAtLeast(1)) {
            val marked = notificationDeliveryPort.markDeliveryDead(item.id, item.lockedAt, error)
            require(marked) {
                staleDeliveryLeaseMessage(item.id, NotificationDeliveryStatus.DEAD)
            }
            metrics.dead(item.eventType)
        } else {
            val marked = notificationDeliveryPort.markDeliveryFailed(
                id = item.id,
                lockedAt = item.lockedAt,
                error = error,
                nextAttemptDelayMinutes = retryDelayMinutes(item.attemptCount),
            )
            require(marked) {
                staleDeliveryLeaseMessage(item.id, NotificationDeliveryStatus.FAILED)
            }
            metrics.failed(item.eventType)
        }
    }

    private fun requiredDeliveryField(deliveryId: UUID, name: String, value: String?): String =
        value?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Claimed email delivery $deliveryId missing $name")

    private fun retryDelayMinutes(attemptCount: Int): Long =
        PROCESSING_RETRY_DELAYS_MINUTES[attemptCount.coerceIn(0, PROCESSING_RETRY_DELAYS_MINUTES.lastIndex)]

    private fun staleDeliveryLeaseMessage(id: UUID, status: NotificationDeliveryStatus): String =
        "Could not mark email delivery $id $status; delivery lease changed"

    private fun Exception.toStorageError(): String =
        sanitizeNotificationError(message ?: javaClass.simpleName, MAX_PROCESSING_ERROR_LENGTH)
            ?: javaClass.simpleName.take(MAX_PROCESSING_ERROR_LENGTH)
}
