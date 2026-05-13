package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.out.NotificationDeliveryClaimPort
import com.readmates.notification.application.port.out.NotificationDeliveryPlanningPort
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Component
class NotificationDeliveryTransactionalOperations(
    private val planningPort: NotificationDeliveryPlanningPort,
    private val claimPort: NotificationDeliveryClaimPort,
) {
    @Transactional
    fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> =
        planningPort.persistPlannedDeliveries(message)

    @Transactional
    fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? =
        claimPort.claimEmailDelivery(id)

    @Transactional
    fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> =
        claimPort.claimEmailDeliveries(limit)

    @Transactional
    fun claimEmailDeliveriesForClub(clubId: UUID, limit: Int): List<ClaimedNotificationDeliveryItem> =
        claimPort.claimEmailDeliveriesForClub(clubId, limit)

    @Transactional
    fun claimHostEmailDelivery(clubId: UUID, id: UUID): ClaimedNotificationDeliveryItem? =
        claimPort.claimHostEmailDelivery(clubId, id)
}
