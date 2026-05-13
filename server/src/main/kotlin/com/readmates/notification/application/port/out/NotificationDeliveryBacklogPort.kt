package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import java.util.UUID

interface NotificationDeliveryBacklogPort {
    fun deliveryBacklog(): NotificationDeliveryBacklog
    fun countByStatus(clubId: UUID, channel: NotificationChannel?, status: NotificationDeliveryStatus): Int
}
