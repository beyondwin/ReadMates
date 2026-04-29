package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.application.port.`in`.DispatchNotificationEventUseCase
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.time.OffsetDateTime
import java.util.UUID

private const val MAX_DISPATCH_ERROR_LENGTH = 500
private val DISPATCH_RETRY_DELAYS_MINUTES = listOf(5L, 15L, 60L, 240L)

@Service
class NotificationDispatchService(
    private val deliveryPort: NotificationDeliveryPort,
    private val mailDeliveryPort: MailDeliveryPort,
    @param:Value("\${readmates.notifications.kafka.max-delivery-attempts:5}") private val maxAttempts: Int,
) : DispatchNotificationEventUseCase {
    override fun dispatch(message: NotificationEventMessage) {
        val deliveries = deliveryPort.persistPlannedDeliveries(message)
        deliveries
            .asSequence()
            .filter { it.channel == NotificationChannel.EMAIL }
            .forEach(::dispatchEmail)
    }

    private fun dispatchEmail(delivery: NotificationDeliveryItem) {
        val claimed = deliveryPort.claimEmailDelivery(delivery.id) ?: return handleUnclaimedEmailDelivery(delivery.id)
        try {
            mailDeliveryPort.send(
                MailDeliveryCommand(
                    to = requiredDeliveryField(claimed.id, "recipientEmail", claimed.recipientEmail),
                    subject = requiredDeliveryField(claimed.id, "subject", claimed.subject),
                    text = requiredDeliveryField(claimed.id, "bodyText", claimed.bodyText),
                ),
            )
            deliveryPort.markDeliverySent(claimed.id, claimed.lockedAt)
        } catch (exception: Exception) {
            if (!markFailure(claimed, exception)) {
                throw exception
            }
        }
    }

    private fun handleUnclaimedEmailDelivery(deliveryId: UUID) {
        val status = deliveryPort.findDeliveryStatus(deliveryId)
        when (status) {
            NotificationDeliveryStatus.SENT,
            NotificationDeliveryStatus.SKIPPED,
            NotificationDeliveryStatus.DEAD,
            -> return

            NotificationDeliveryStatus.PENDING,
            NotificationDeliveryStatus.FAILED,
            NotificationDeliveryStatus.SENDING,
            null,
            -> throw IllegalStateException("Email delivery $deliveryId is not claimable with status ${status ?: "UNKNOWN"}")
        }
    }

    private fun markFailure(claimed: ClaimedNotificationDeliveryItem, exception: Exception): Boolean {
        val error = exception.toStorageError()
        return if (claimed.attemptCount + 1 >= maxAttempts.coerceAtLeast(1)) {
            deliveryPort.markDeliveryDead(claimed.id, claimed.lockedAt, error)
            true
        } else {
            deliveryPort.markDeliveryFailed(
                id = claimed.id,
                lockedAt = claimed.lockedAt,
                error = error,
                nextAttemptDelayMinutes = retryDelayMinutes(claimed.attemptCount),
            )
            false
        }
    }

    private fun retryDelayMinutes(attemptCount: Int): Long =
        DISPATCH_RETRY_DELAYS_MINUTES[attemptCount.coerceIn(0, DISPATCH_RETRY_DELAYS_MINUTES.lastIndex)]

    private fun requiredDeliveryField(deliveryId: UUID, name: String, value: String?): String =
        value?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Claimed email delivery $deliveryId missing $name")

    private fun Exception.toStorageError(): String =
        sanitizeNotificationError(message ?: javaClass.simpleName, MAX_DISPATCH_ERROR_LENGTH)
            ?: javaClass.simpleName.take(MAX_DISPATCH_ERROR_LENGTH)
}
