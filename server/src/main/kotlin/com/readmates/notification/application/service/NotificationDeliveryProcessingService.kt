package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.port.`in`.ProcessNotificationDeliveriesUseCase
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class NotificationDeliveryProcessingService(
    private val deliveryEngine: NotificationDeliveryEngine,
    private val transactionalOps: NotificationDeliveryTransactionalOperations,
    @param:Value("\${readmates.notifications.enabled:false}") private val deliveryEnabled: Boolean,
) : ProcessNotificationDeliveriesUseCase {
    override fun processPending(limit: Int): Int {
        if (limit <= 0 || !deliveryEnabled) {
            return 0
        }

        val items = transactionalOps.claimEmailDeliveries(limit)
        items.forEach(::processClaimed)
        return items.size
    }

    override fun processPendingForClub(
        clubId: UUID,
        limit: Int,
    ): Int {
        if (limit <= 0 || !deliveryEnabled) {
            return 0
        }

        val items = transactionalOps.claimEmailDeliveriesForClub(clubId, limit)
        items.forEach(::processClaimed)
        return items.size
    }

    fun processClaimed(item: ClaimedNotificationDeliveryItem) {
        deliveryEngine.sendClaimed(item)
    }
}
