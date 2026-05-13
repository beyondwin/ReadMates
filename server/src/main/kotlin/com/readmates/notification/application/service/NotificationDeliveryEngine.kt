package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryStatusPort
import com.readmates.notification.domain.NotificationDeliveryStatus
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.UUID

private const val MAX_DELIVERY_ENGINE_ERROR_LENGTH = 500
private val DEFAULT_DELIVERY_ENGINE_RETRY_DELAYS_MINUTES = listOf(5L, 15L, 60L, 240L)

sealed interface DeliveryEngineResult {
    data object Sent : DeliveryEngineResult
    data object Dead : DeliveryEngineResult
    data class RetryableFailure(val message: String) : DeliveryEngineResult
}

@Service
class NotificationDeliveryEngine(
    private val deliveryStatusPort: NotificationDeliveryStatusPort,
    private val mailDeliveryPort: MailDeliveryPort,
    private val metrics: ReadmatesOperationalMetrics,
    @param:Value("\${readmates.notifications.kafka.max-delivery-attempts:5}") private val maxAttempts: Int,
    @param:Value("\${readmates.notifications.retry-delay-minutes:5,15,60,240}")
    private val retryDelayMinutesConfig: List<Long>,
) {
    fun sendClaimed(item: ClaimedNotificationDeliveryItem): DeliveryEngineResult {
        val command = MailDeliveryCommand(
            to = requiredDeliveryField(item.id, "recipientEmail", item.recipientEmail),
            subject = requiredDeliveryField(item.id, "subject", item.subject),
            text = requiredDeliveryField(item.id, "bodyText", item.bodyText),
            html = item.bodyHtml?.takeIf { it.isNotBlank() },
        )

        try {
            mailDeliveryPort.send(command)
        } catch (exception: Exception) {
            return markFailure(item, exception)
        }

        if (!deliveryStatusPort.markDeliverySent(item.id, item.lockedAt)) {
            throw staleDeliveryLeaseException(item.id, NotificationDeliveryStatus.SENT)
        }
        metrics.sent(item.eventType)
        logger.info(
            "Notification email delivery sent deliveryId={} eventType={}",
            item.id,
            item.eventType,
        )
        return DeliveryEngineResult.Sent
    }

    private fun markFailure(
        item: ClaimedNotificationDeliveryItem,
        exception: Exception,
    ): DeliveryEngineResult {
        val error = exception.toStorageError()
        if (item.attemptCount + 1 >= maxAttempts.coerceAtLeast(1)) {
            if (!deliveryStatusPort.markDeliveryDead(item.id, item.lockedAt, error)) {
                throw staleDeliveryLeaseException(item.id, NotificationDeliveryStatus.DEAD)
            }
            metrics.dead(item.eventType)
            logger.warn(
                "Notification email delivery dead deliveryId={} eventType={} attemptCount={} error={}",
                item.id,
                item.eventType,
                item.attemptCount + 1,
                error,
            )
            return DeliveryEngineResult.Dead
        }

        val marked = deliveryStatusPort.markDeliveryFailed(
            id = item.id,
            lockedAt = item.lockedAt,
            error = error,
            nextAttemptDelayMinutes = retryDelayMinutes(item.attemptCount),
        )
        if (!marked) {
            throw staleDeliveryLeaseException(item.id, NotificationDeliveryStatus.FAILED)
        }
        metrics.failed(item.eventType)
        logger.warn(
            "Notification email delivery failed deliveryId={} eventType={} attemptCount={} error={}",
            item.id,
            item.eventType,
            item.attemptCount + 1,
            error,
        )
        return DeliveryEngineResult.RetryableFailure(
            "Email delivery ${item.id} failed and is scheduled for retry: $error",
        )
    }

    private fun retryDelayMinutes(attemptCount: Int): Long {
        val delays = retryDelayMinutesConfig.ifEmpty { DEFAULT_DELIVERY_ENGINE_RETRY_DELAYS_MINUTES }
        return delays[attemptCount.coerceIn(0, delays.lastIndex)]
    }

    private fun requiredDeliveryField(deliveryId: UUID, name: String, value: String?): String =
        value?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Claimed email delivery $deliveryId missing $name")

    private fun staleDeliveryLeaseException(id: UUID, status: NotificationDeliveryStatus): IllegalStateException =
        IllegalStateException("Could not mark email delivery $id $status; delivery lease changed")

    private fun Exception.toStorageError(): String =
        sanitizeNotificationError(message ?: javaClass.simpleName, MAX_DELIVERY_ENGINE_ERROR_LENGTH)
            ?: javaClass.simpleName.take(MAX_DELIVERY_ENGINE_ERROR_LENGTH)

    private companion object {
        private val logger = LoggerFactory.getLogger(NotificationDeliveryEngine::class.java)
    }
}
