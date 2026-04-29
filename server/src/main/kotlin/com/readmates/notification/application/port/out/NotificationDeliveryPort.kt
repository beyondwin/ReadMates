package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import java.time.OffsetDateTime
import java.util.UUID

interface NotificationDeliveryPort {
    fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem>

    @Deprecated(
        message = "Use persistPlannedDeliveries to make the persistence side effect explicit.",
        replaceWith = ReplaceWith("persistPlannedDeliveries(message)"),
    )
    fun planDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> =
        persistPlannedDeliveries(message)

    fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem?
    fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem>
    fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime): Boolean
    fun markDeliveryFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean
    fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean
    fun countByStatus(clubId: UUID, channel: NotificationChannel?, status: NotificationDeliveryStatus): Int
}
