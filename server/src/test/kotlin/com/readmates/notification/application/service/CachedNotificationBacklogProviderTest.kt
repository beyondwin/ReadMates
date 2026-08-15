package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationBacklogRefreshResult
import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.model.NotificationEventOutboxBacklog
import com.readmates.notification.application.port.out.NotificationDeliveryBacklogPort
import com.readmates.notification.application.port.out.NotificationEventOutboxBacklogPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class CachedNotificationBacklogProviderTest {
    private val initialEventBacklog =
        NotificationEventOutboxBacklog(pending = 3, failed = 1, dead = 2, publishing = 5)
    private val initialDeliveryBacklog =
        NotificationDeliveryBacklog(pending = 7, failed = 11, dead = 13, sending = 17)

    @Test
    fun `both snapshots are unavailable before either source succeeds`() {
        val provider = backlogProvider()

        assertThat(provider.eventOutboxSnapshot()).isNull()
        assertThat(provider.deliverySnapshot()).isNull()
    }

    @Test
    fun `successful refresh updates both independent snapshots`() {
        val provider = backlogProvider()

        assertThat(provider.refresh()).isEqualTo(NotificationBacklogRefreshResult.SUCCESS)
        assertThat(provider.eventOutboxSnapshot()).isEqualTo(initialEventBacklog)
        assertThat(provider.deliverySnapshot()).isEqualTo(initialDeliveryBacklog)
    }

    @Test
    fun `event success and delivery failure update only the event snapshot`() {
        val eventPort = MutableEventBacklogPort(initialEventBacklog)
        val deliveryPort = MutableDeliveryBacklogPort(initialDeliveryBacklog)
        val provider = CachedNotificationBacklogProvider(eventPort, deliveryPort)
        assertThat(provider.refresh()).isEqualTo(NotificationBacklogRefreshResult.SUCCESS)
        val changedEvent = initialEventBacklog.copy(dead = 23)
        eventPort.backlog = changedEvent
        deliveryPort.failure = IllegalStateException("delivery query detail must stay internal")

        assertThat(provider.refresh()).isEqualTo(NotificationBacklogRefreshResult.PARTIAL)
        assertThat(provider.eventOutboxSnapshot()).isEqualTo(changedEvent)
        assertThat(provider.deliverySnapshot()).isEqualTo(initialDeliveryBacklog)
    }

    @Test
    fun `event failure and delivery success update only the delivery snapshot`() {
        val eventPort = MutableEventBacklogPort(initialEventBacklog)
        val deliveryPort = MutableDeliveryBacklogPort(initialDeliveryBacklog)
        val provider = CachedNotificationBacklogProvider(eventPort, deliveryPort)
        assertThat(provider.refresh()).isEqualTo(NotificationBacklogRefreshResult.SUCCESS)
        val changedDelivery = initialDeliveryBacklog.copy(sending = 29)
        eventPort.failure = IllegalStateException("event query detail must stay internal")
        deliveryPort.backlog = changedDelivery

        assertThat(provider.refresh()).isEqualTo(NotificationBacklogRefreshResult.PARTIAL)
        assertThat(provider.eventOutboxSnapshot()).isEqualTo(initialEventBacklog)
        assertThat(provider.deliverySnapshot()).isEqualTo(changedDelivery)
    }

    @Test
    fun `repeated total failure preserves exact last successful snapshots`() {
        val eventPort = MutableEventBacklogPort(initialEventBacklog)
        val deliveryPort = MutableDeliveryBacklogPort(initialDeliveryBacklog)
        val provider = CachedNotificationBacklogProvider(eventPort, deliveryPort)
        assertThat(provider.refresh()).isEqualTo(NotificationBacklogRefreshResult.SUCCESS)
        eventPort.failure = IllegalStateException("event query failed")
        deliveryPort.failure = IllegalStateException("delivery query failed")

        assertThat(provider.refresh()).isEqualTo(NotificationBacklogRefreshResult.FAILURE)
        assertThat(provider.refresh()).isEqualTo(NotificationBacklogRefreshResult.FAILURE)
        assertThat(provider.eventOutboxSnapshot()).isEqualTo(initialEventBacklog)
        assertThat(provider.deliverySnapshot()).isEqualTo(initialDeliveryBacklog)
    }

    @Test
    fun `initial total failure keeps both snapshots unavailable`() {
        val eventPort =
            MutableEventBacklogPort(initialEventBacklog).apply {
                failure = IllegalStateException("event")
            }
        val deliveryPort =
            MutableDeliveryBacklogPort(initialDeliveryBacklog).apply {
                failure = IllegalStateException("delivery")
            }
        val provider = CachedNotificationBacklogProvider(eventPort, deliveryPort)

        assertThat(provider.refresh()).isEqualTo(NotificationBacklogRefreshResult.FAILURE)
        assertThat(provider.eventOutboxSnapshot()).isNull()
        assertThat(provider.deliverySnapshot()).isNull()
    }

    private fun backlogProvider(): CachedNotificationBacklogProvider =
        CachedNotificationBacklogProvider(
            MutableEventBacklogPort(initialEventBacklog),
            MutableDeliveryBacklogPort(initialDeliveryBacklog),
        )
}

private class MutableEventBacklogPort(
    var backlog: NotificationEventOutboxBacklog,
) : NotificationEventOutboxBacklogPort {
    var failure: RuntimeException? = null

    override fun eventOutboxBacklog(): NotificationEventOutboxBacklog = failure?.let { throw it } ?: backlog
}

private class MutableDeliveryBacklogPort(
    var backlog: NotificationDeliveryBacklog,
) : NotificationDeliveryBacklogPort {
    var failure: RuntimeException? = null

    override fun deliveryBacklog(): NotificationDeliveryBacklog = failure?.let { throw it } ?: backlog

    override fun countByStatus(
        clubId: UUID,
        channel: NotificationChannel?,
        status: NotificationDeliveryStatus,
    ): Int = 0
}
