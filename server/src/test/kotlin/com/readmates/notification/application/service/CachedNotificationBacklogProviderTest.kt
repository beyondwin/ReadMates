package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class CachedNotificationBacklogProviderTest {

    @Test
    fun `initial snapshot is EMPTY before any refresh`() {
        val provider = CachedNotificationBacklogProvider(null)

        val snapshot = provider.snapshot()

        assertThat(snapshot.pending).isEqualTo(0)
        assertThat(snapshot.failed).isEqualTo(0)
        assertThat(snapshot.dead).isEqualTo(0)
        assertThat(snapshot.sending).isEqualTo(0)
    }

    @Test
    fun `after refresh snapshot matches port result`() {
        val backlog = NotificationDeliveryBacklog(pending = 3, failed = 1, dead = 2, sending = 5)
        val port = StubNotificationDeliveryPort(backlog)
        val provider = CachedNotificationBacklogProvider(port)

        provider.refresh()

        assertThat(provider.snapshot()).isEqualTo(backlog)
    }

    @Test
    fun `null port refresh is a no-op and snapshot stays EMPTY`() {
        val provider = CachedNotificationBacklogProvider(null)

        provider.refresh()

        val snapshot = provider.snapshot()
        assertThat(snapshot.pending).isEqualTo(0)
        assertThat(snapshot.failed).isEqualTo(0)
        assertThat(snapshot.dead).isEqualTo(0)
        assertThat(snapshot.sending).isEqualTo(0)
    }
}

private class StubNotificationDeliveryPort(
    private val backlog: NotificationDeliveryBacklog,
) : NotificationDeliveryPort {
    override fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> = emptyList()
    override fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? = null
    override fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> = emptyList()
    override fun claimEmailDeliveriesForClub(clubId: UUID, limit: Int): List<ClaimedNotificationDeliveryItem> = emptyList()
    override fun claimHostEmailDelivery(clubId: UUID, id: UUID): ClaimedNotificationDeliveryItem? = null
    override fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus? = null
    override fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime): Boolean = false
    override fun markDeliveryFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean = false
    override fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean = false
    override fun restoreDeadEmailDeliveryForClub(clubId: UUID, id: UUID): Boolean = false
    override fun hostSummary(clubId: UUID): HostNotificationSummary =
        HostNotificationSummary(pending = 0, failed = 0, dead = 0, sentLast24h = 0, latestFailures = emptyList())
    override fun listHostEmailItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList =
        HostNotificationItemList(emptyList())
    override fun hostEmailDetail(clubId: UUID, id: UUID): HostNotificationDetail? = null
    override fun deliveryBacklog(): NotificationDeliveryBacklog = backlog
    override fun countByStatus(clubId: UUID, channel: NotificationChannel?, status: NotificationDeliveryStatus): Int = 0
    override fun listHostDeliveries(
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        limit: Int,
    ): List<HostNotificationDelivery> = emptyList()
}
