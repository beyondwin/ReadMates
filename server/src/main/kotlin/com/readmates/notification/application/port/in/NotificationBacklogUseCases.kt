@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.application.port.`in`

import com.readmates.notification.application.model.NotificationBacklogRefreshResult
import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.model.NotificationEventOutboxBacklog

interface ReadNotificationBacklogUseCase {
    fun eventOutboxSnapshot(): NotificationEventOutboxBacklog?

    fun deliverySnapshot(): NotificationDeliveryBacklog?
}

interface RefreshNotificationBacklogUseCase {
    fun refresh(): NotificationBacklogRefreshResult
}
