package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationBacklogRefreshResult
import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.model.NotificationEventOutboxBacklog
import com.readmates.notification.application.port.`in`.ReadNotificationBacklogUseCase
import com.readmates.notification.application.port.`in`.RefreshNotificationBacklogUseCase
import com.readmates.notification.application.port.out.NotificationDeliveryBacklogPort
import com.readmates.notification.application.port.out.NotificationEventOutboxBacklogPort
import org.springframework.stereotype.Service
import java.util.concurrent.atomic.AtomicReference

@Service
class CachedNotificationBacklogProvider(
    private val eventOutboxPort: NotificationEventOutboxBacklogPort,
    private val deliveryPort: NotificationDeliveryBacklogPort,
) : ReadNotificationBacklogUseCase,
    RefreshNotificationBacklogUseCase {
    private val eventOutboxCache = AtomicReference<NotificationEventOutboxBacklog?>(null)
    private val deliveryCache = AtomicReference<NotificationDeliveryBacklog?>(null)

    override fun refresh(): NotificationBacklogRefreshResult {
        val eventSucceeded = refreshEventOutbox()
        val deliverySucceeded = refreshDelivery()
        return when {
            eventSucceeded && deliverySucceeded -> NotificationBacklogRefreshResult.SUCCESS
            eventSucceeded || deliverySucceeded -> NotificationBacklogRefreshResult.PARTIAL
            else -> NotificationBacklogRefreshResult.FAILURE
        }
    }

    override fun eventOutboxSnapshot(): NotificationEventOutboxBacklog? = eventOutboxCache.get()

    override fun deliverySnapshot(): NotificationDeliveryBacklog? = deliveryCache.get()

    private fun refreshEventOutbox(): Boolean =
        try {
            eventOutboxCache.set(eventOutboxPort.eventOutboxBacklog())
            true
        } catch (_: RuntimeException) {
            false
        }

    private fun refreshDelivery(): Boolean =
        try {
            deliveryCache.set(deliveryPort.deliveryBacklog())
            true
        } catch (_: RuntimeException) {
            false
        }
}
