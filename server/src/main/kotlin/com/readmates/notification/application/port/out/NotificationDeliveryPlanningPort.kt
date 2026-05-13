package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage

interface NotificationDeliveryPlanningPort {
    fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem>
}
