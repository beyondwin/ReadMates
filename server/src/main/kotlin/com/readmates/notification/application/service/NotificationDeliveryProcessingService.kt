package com.readmates.notification.application.service

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.port.`in`.ProcessNotificationDeliveriesUseCase
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class NotificationDeliveryProcessingService(
    private val notificationDeliveryPort: NotificationDeliveryPort,
    private val deliveryEngine: NotificationDeliveryEngine,
    @param:Value("\${readmates.notifications.enabled:false}") private val deliveryEnabled: Boolean = true,
) : ProcessNotificationDeliveriesUseCase {
    override fun processPending(limit: Int): Int {
        if (limit <= 0 || !deliveryEnabled) {
            return 0
        }

        val items = notificationDeliveryPort.claimEmailDeliveries(limit)
        items.forEach(::processClaimed)
        return items.size
    }

    override fun processPendingForClub(clubId: UUID, limit: Int): Int {
        if (limit <= 0 || !deliveryEnabled) {
            return 0
        }

        val items = notificationDeliveryPort.claimEmailDeliveriesForClub(clubId, limit)
        items.forEach(::processClaimed)
        return items.size
    }

    fun processClaimed(item: ClaimedNotificationDeliveryItem) {
        deliveryEngine.sendClaimed(item)
    }
}
