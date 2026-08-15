package com.readmates.notification.application.service

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryFailure
import com.readmates.notification.application.port.out.MailDeliveryFailureKind
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationDeliveryStatusPort
import com.readmates.notification.domain.NotificationDeliveryStatus
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Clock
import java.util.UUID

private const val DELIVERY_EXPIRED_ERROR = "DELIVERY_EXPIRED"
private const val DELIVERY_CONTENT_INVALID_ERROR = "DELIVERY_CONTENT_INVALID"

sealed interface DeliveryEngineResult {
    data object Sent : DeliveryEngineResult

    data object Dead : DeliveryEngineResult

    data class RetryableFailure(
        val message: String,
    ) : DeliveryEngineResult
}

@Service
class NotificationDeliveryEngine(
    private val deliveryStatusPort: NotificationDeliveryStatusPort,
    private val mailDeliveryPort: MailDeliveryPort,
    private val metrics: ReadmatesOperationalMetrics,
    private val runtimeProperties: NotificationRuntimeProperties,
    private val clock: Clock,
) {
    init {
        require(
            runtimeProperties.worker.retryDelays.size >=
                runtimeProperties.kafka.maxDeliveryAttempts - 1,
        ) {
            "readmates.notifications.worker.retry-delays must cover every nonterminal delivery attempt"
        }
    }

    fun sendClaimed(item: ClaimedNotificationDeliveryItem): DeliveryEngineResult {
        val now = clock.instant()
        val deadline = item.createdAt.toInstant().plus(runtimeProperties.worker.deliveryMaxAge)
        return if (now.isBefore(deadline)) {
            item
                .toMailDeliveryCommand()
                ?.let { command -> deliver(item, command) }
                ?: markDead(item, DELIVERY_CONTENT_INVALID_ERROR)
        } else {
            markDead(item, DELIVERY_EXPIRED_ERROR)
        }
    }

    private fun deliver(
        item: ClaimedNotificationDeliveryItem,
        command: MailDeliveryCommand,
    ): DeliveryEngineResult =
        try {
            mailDeliveryPort.send(command)
            markSent(item)
        } catch (failure: MailDeliveryFailure) {
            handleMailFailure(item, failure.kind)
        }

    private fun markSent(item: ClaimedNotificationDeliveryItem): DeliveryEngineResult {
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

    private fun handleMailFailure(
        item: ClaimedNotificationDeliveryItem,
        kind: MailDeliveryFailureKind,
    ): DeliveryEngineResult {
        val error = kind.storageCode
        val attemptsExhausted = item.attemptCount + 1 >= runtimeProperties.kafka.maxDeliveryAttempts
        if (kind == MailDeliveryFailureKind.PERMANENT || attemptsExhausted) {
            return markDead(item, error)
        }

        val marked =
            deliveryStatusPort.markDeliveryFailed(
                id = item.id,
                lockedAt = item.lockedAt,
                error = error,
                nextAttemptDelayMinutes = runtimeProperties.worker.retryDelays[item.attemptCount].toMinutes(),
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
        return DeliveryEngineResult.RetryableFailure(error)
    }

    private fun markDead(
        item: ClaimedNotificationDeliveryItem,
        error: String,
    ): DeliveryEngineResult {
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

    private fun ClaimedNotificationDeliveryItem.toMailDeliveryCommand(): MailDeliveryCommand? {
        val to = recipientEmail?.takeIf(String::isNotBlank)
        val mailSubject = subject?.takeIf(String::isNotBlank)
        val text = bodyText?.takeIf(String::isNotBlank)
        return if (to == null || mailSubject == null || text == null) {
            null
        } else {
            MailDeliveryCommand(
                to = to,
                subject = mailSubject,
                text = text,
                html = bodyHtml?.takeIf(String::isNotBlank),
            )
        }
    }

    private fun staleDeliveryLeaseException(
        id: UUID,
        status: NotificationDeliveryStatus,
    ): IllegalStateException = IllegalStateException("Could not mark email delivery $id $status; delivery lease changed")

    private companion object {
        private val logger = LoggerFactory.getLogger(NotificationDeliveryEngine::class.java)
    }
}
