package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.`in`.DispatchNotificationEventUseCase
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class NotificationDispatchService(
    private val deliveryPort: NotificationDeliveryPort,
    private val deliveryEngine: NotificationDeliveryEngine,
    private val transactionalOps: NotificationDeliveryTransactionalOperations,
) : DispatchNotificationEventUseCase {
    override fun dispatch(message: NotificationEventMessage) {
        val deliveries = transactionalOps.persistPlannedDeliveries(message)
        val retryableFailures = mutableListOf<NotificationDeliveryRetryableException>()
        deliveries
            .filter { it.channel == NotificationChannel.EMAIL }
            .forEach { delivery ->
                dispatchEmail(delivery)?.let(retryableFailures::add)
            }
        if (retryableFailures.isNotEmpty()) {
            throw retryableDispatchException(retryableFailures)
        }
    }

    private fun dispatchEmail(delivery: NotificationDeliveryItem): NotificationDeliveryRetryableException? {
        val claimed = transactionalOps.claimEmailDelivery(delivery.id) ?: return handleUnclaimedEmailDelivery(delivery.id)
        return when (val result = deliveryEngine.sendClaimed(claimed)) {
            DeliveryEngineResult.Sent,
            DeliveryEngineResult.Dead,
            -> null

            is DeliveryEngineResult.RetryableFailure -> NotificationDeliveryRetryableException(result.message)
        }
    }

    private fun handleUnclaimedEmailDelivery(deliveryId: UUID): NotificationDeliveryRetryableException? {
        val status = deliveryPort.findDeliveryStatus(deliveryId)
        when (status) {
            NotificationDeliveryStatus.SENT,
            NotificationDeliveryStatus.SKIPPED,
            NotificationDeliveryStatus.DEAD,
            -> return null

            NotificationDeliveryStatus.PENDING,
            NotificationDeliveryStatus.FAILED,
            NotificationDeliveryStatus.SENDING,
            -> return NotificationDeliveryRetryableException(
                "Email delivery $deliveryId is not claimable with status $status",
            )

            null,
            -> throw IllegalStateException("Email delivery $deliveryId is not claimable with status ${status ?: "UNKNOWN"}")
        }
    }

    private fun retryableDispatchException(
        failures: List<NotificationDeliveryRetryableException>,
    ): NotificationDeliveryRetryableException {
        val noun = if (failures.size == 1) "email delivery" else "email deliveries"
        return NotificationDeliveryRetryableException(
            "${failures.size} $noun remain retryable after dispatch pass: ${failures.first().message}",
        )
    }
}

class NotificationDeliveryRetryableException(
    message: String,
) : RuntimeException(message)
