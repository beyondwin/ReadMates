package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.out.NotificationDeliveryClaimPort
import com.readmates.notification.application.port.out.NotificationDeliveryPlanningPort
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Isolation
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

    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? = claimPort.claimEmailDelivery(id)

    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> = claimPort.claimEmailDeliveries(limit)

    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun claimEmailDeliveriesForClub(
        clubId: UUID,
        limit: Int,
    ): List<ClaimedNotificationDeliveryItem> = claimPort.claimEmailDeliveriesForClub(clubId, limit)

    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun claimHostEmailDelivery(
        clubId: UUID,
        id: UUID,
    ): ClaimedNotificationDeliveryItem? = claimPort.claimHostEmailDelivery(clubId, id)
}
