package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationEventMessage

interface NotificationEventPublisherPort {
    fun publish(message: NotificationEventMessage, topic: String, key: String)
}
