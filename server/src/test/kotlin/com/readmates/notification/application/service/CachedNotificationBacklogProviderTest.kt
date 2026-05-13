package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.port.out.NotificationDeliveryBacklogPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class CachedNotificationBacklogProviderTest {

    @Test
    fun `initial snapshot is EMPTY before any refresh`() {
        val provider = CachedNotificationBacklogProvider(
            StubNotificationDeliveryBacklogPort(NotificationDeliveryBacklog(pending = 3, failed = 1, dead = 2, sending = 5)),
        )

        val snapshot = provider.snapshot()

        assertThat(snapshot.pending).isEqualTo(0)
        assertThat(snapshot.failed).isEqualTo(0)
        assertThat(snapshot.dead).isEqualTo(0)
        assertThat(snapshot.sending).isEqualTo(0)
    }

    @Test
    fun `after refresh snapshot matches port result`() {
        val backlog = NotificationDeliveryBacklog(pending = 3, failed = 1, dead = 2, sending = 5)
        val port = StubNotificationDeliveryBacklogPort(backlog)
        val provider = CachedNotificationBacklogProvider(port)

        provider.refresh()

        assertThat(provider.snapshot()).isEqualTo(backlog)
    }

}

private class StubNotificationDeliveryBacklogPort(
    private val backlog: NotificationDeliveryBacklog,
) : NotificationDeliveryBacklogPort {
    override fun deliveryBacklog(): NotificationDeliveryBacklog = backlog
    override fun countByStatus(clubId: UUID, channel: NotificationChannel?, status: NotificationDeliveryStatus): Int = 0
}
