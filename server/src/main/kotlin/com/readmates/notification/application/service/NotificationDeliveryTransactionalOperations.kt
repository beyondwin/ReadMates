package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Component
class NotificationDeliveryTransactionalOperations(
    private val port: NotificationDeliveryPort,
) {
    @Transactional
    fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> =
        port.persistPlannedDeliveries(message)

    @Transactional
    fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? =
        port.claimEmailDelivery(id)

    @Transactional
    fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> =
        port.claimEmailDeliveries(limit)

    @Transactional
    fun claimEmailDeliveriesForClub(clubId: UUID, limit: Int): List<ClaimedNotificationDeliveryItem> =
        port.claimEmailDeliveriesForClub(clubId, limit)

    @Transactional
    fun claimHostEmailDelivery(clubId: UUID, id: UUID): ClaimedNotificationDeliveryItem? =
        port.claimHostEmailDelivery(clubId, id)
}
