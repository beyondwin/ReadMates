package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.util.concurrent.atomic.AtomicReference

@Service
class CachedNotificationBacklogProvider(
    private val port: NotificationDeliveryPort? = null,
) {
    private val cache = AtomicReference(NotificationDeliveryBacklog(pending = 0, failed = 0, dead = 0, sending = 0))

    @Scheduled(fixedDelay = 60_000L, initialDelay = 5_000L)
    fun refresh() {
        val p = port ?: return
        cache.set(p.deliveryBacklog())
    }

    fun snapshot(): NotificationDeliveryBacklog = cache.get()
}
