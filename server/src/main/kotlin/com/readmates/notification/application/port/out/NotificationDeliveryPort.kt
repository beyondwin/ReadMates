package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationDeliveryBacklog
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
    fun claimEmailDeliveriesForClub(clubId: UUID, limit: Int): List<ClaimedNotificationDeliveryItem>
    fun claimHostEmailDelivery(clubId: UUID, id: UUID): ClaimedNotificationDeliveryItem?
    fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus?
    fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime): Boolean
    fun markDeliveryFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean
    fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean
    fun restoreDeadEmailDeliveryForClub(clubId: UUID, id: UUID): Boolean
    fun deliveryBacklog(): NotificationDeliveryBacklog
    fun countByStatus(clubId: UUID, channel: NotificationChannel?, status: NotificationDeliveryStatus): Int
    fun hostSummary(clubId: UUID): HostNotificationSummary
    fun listHostEmailItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList
    fun hostEmailDetail(clubId: UUID, id: UUID): HostNotificationDetail?
    fun listHostDeliveries(
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        limit: Int,
    ): List<HostNotificationDelivery>
}
