package com.readmates.notification.application.service

import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationOutboxItem
import com.readmates.notification.application.port.`in`.GetHostNotificationSummaryUseCase
import com.readmates.notification.application.port.`in`.ProcessNotificationOutboxUseCase
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import com.readmates.notification.application.port.out.NotificationOutboxPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.util.UUID

private const val MAX_LAST_ERROR_LENGTH = 500
private val RETRY_DELAYS_MINUTES = listOf(5L, 15L, 60L, 240L)

@Service
class NotificationOutboxService(
    private val notificationOutboxPort: NotificationOutboxPort,
    private val mailDeliveryPort: MailDeliveryPort,
    @param:Value("\${readmates.notifications.worker.max-attempts:5}") private val maxAttempts: Int,
    @param:Value("\${readmates.notifications.enabled:false}") private val deliveryEnabled: Boolean = true,
) : RecordNotificationEventUseCase,
    ProcessNotificationOutboxUseCase,
    GetHostNotificationSummaryUseCase {

    override fun recordFeedbackDocumentPublished(clubId: UUID, sessionId: UUID) {
        notificationOutboxPort.enqueueFeedbackDocumentPublished(clubId, sessionId)
    }

    override fun recordNextBookPublished(clubId: UUID, sessionId: UUID) {
        notificationOutboxPort.enqueueNextBookPublished(clubId, sessionId)
    }

    override fun recordSessionReminderDue(targetDate: LocalDate) {
        notificationOutboxPort.enqueueSessionReminderDue(targetDate)
    }

    override fun processPending(limit: Int): Int {
        if (limit <= 0 || !deliveryEnabled) {
            return 0
        }

        val items = notificationOutboxPort.claimPending(limit)
        return deliverAll(items)
    }

    override fun processPendingForClub(clubId: UUID, limit: Int): Int {
        if (limit <= 0 || !deliveryEnabled) {
            return 0
        }

        val items = notificationOutboxPort.claimPendingForClub(clubId, limit)
        return deliverAll(items)
    }

    override fun getHostNotificationSummary(host: CurrentMember): HostNotificationSummary {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        return notificationOutboxPort.hostSummary(host.clubId)
    }

    private fun deliver(item: NotificationOutboxItem) {
        try {
            mailDeliveryPort.send(
                MailDeliveryCommand(
                    to = item.recipientEmail,
                    subject = item.subject,
                    text = item.bodyText,
                ),
            )
            notificationOutboxPort.markSent(item.id, item.lockedAt)
        } catch (exception: Exception) {
            val error = exception.toStorageError()
            if (item.attemptCount + 1 >= maxAttempts.coerceAtLeast(1)) {
                notificationOutboxPort.markDead(item.id, item.lockedAt, error)
            } else {
                notificationOutboxPort.markFailed(
                    id = item.id,
                    lockedAt = item.lockedAt,
                    error = error,
                    nextAttemptDelayMinutes = retryDelayMinutes(item.attemptCount),
                )
            }
        }
    }

    private fun deliverAll(items: List<NotificationOutboxItem>): Int {
        items.forEach(::deliver)
        return items.size
    }

    private fun retryDelayMinutes(attemptCount: Int): Long =
        RETRY_DELAYS_MINUTES[attemptCount.coerceIn(0, RETRY_DELAYS_MINUTES.lastIndex)]

    private fun Exception.toStorageError(): String =
        (message ?: javaClass.simpleName).take(MAX_LAST_ERROR_LENGTH)
}
