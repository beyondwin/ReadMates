package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationEventOutboxBacklog

interface NotificationEventOutboxBacklogPort {
    fun eventOutboxBacklog(): NotificationEventOutboxBacklog
}
