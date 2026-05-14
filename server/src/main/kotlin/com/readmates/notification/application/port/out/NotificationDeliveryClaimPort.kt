package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import java.util.UUID

interface NotificationDeliveryClaimPort {
    fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem?

    fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem>

    fun claimEmailDeliveriesForClub(
        clubId: UUID,
        limit: Int,
    ): List<ClaimedNotificationDeliveryItem>

    fun claimHostEmailDelivery(
        clubId: UUID,
        id: UUID,
    ): ClaimedNotificationDeliveryItem?
}
