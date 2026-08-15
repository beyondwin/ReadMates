package com.readmates.notification.application.service

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.notification.application.model.AdminNotificationClubHealth
import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationRelaySummary
import com.readmates.notification.application.model.AdminNotificationStatusSummary
import com.readmates.notification.application.port.out.AdminNotificationOperationsReadPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class AdminNotificationOperationsServiceTest {
    @Test
    fun `support reads snapshot through the read port`() {
        val readPort = RecordingAdminNotificationReadPort()
        val service = serviceWith(readPort)

        val snapshot = service.snapshot(platformAdmin(PlatformAdminRole.SUPPORT))

        assertThat(snapshot).isEqualTo(adminSnapshot())
        assertThat(readPort.snapshotCalls).isEqualTo(1)
    }

    @Test
    fun `event filters and bounded page are delegated to the read port`() {
        val readPort = RecordingAdminNotificationReadPort()
        val service = serviceWith(readPort)
        val filter =
            AdminNotificationFilter(
                clubId = CLUB_ID,
                eventStatus = NotificationEventOutboxStatus.FAILED,
            )

        service.listEvents(
            admin = platformAdmin(PlatformAdminRole.OWNER),
            filter = filter,
            pageRequest = PageRequest.cursor(requestedLimit = 101, rawCursor = null, defaultLimit = 50, maxLimit = 200),
        )

        assertThat(readPort.lastEventFilter).isEqualTo(filter)
        assertThat(readPort.lastEventPageRequest?.limit).isEqualTo(100)
    }

    @Test
    fun `delivery filters and bounded page are delegated to the read port`() {
        val readPort = RecordingAdminNotificationReadPort()
        val service = serviceWith(readPort)
        val filter =
            AdminNotificationFilter(
                clubId = CLUB_ID,
                deliveryStatus = NotificationDeliveryStatus.FAILED,
                channel = NotificationChannel.EMAIL,
            )

        service.listDeliveries(
            admin = platformAdmin(PlatformAdminRole.OPERATOR),
            filter = filter,
            pageRequest = PageRequest.cursor(requestedLimit = 20, rawCursor = null, defaultLimit = 50, maxLimit = 100),
        )

        assertThat(readPort.lastDeliveryFilter).isEqualTo(filter)
        assertThat(readPort.lastDeliveryPageRequest?.limit).isEqualTo(20)
    }

    private fun serviceWith(readPort: AdminNotificationOperationsReadPort) =
        AdminNotificationOperationsService(
            readPort = readPort,
            replayService = mock<AdminNotificationReplayService>(),
        )

    private fun platformAdmin(role: PlatformAdminRole): CurrentPlatformAdmin =
        CurrentPlatformAdmin(
            userId = ADMIN_USER_ID,
            email = "admin@example.com",
            role = role,
        )
}

private class RecordingAdminNotificationReadPort : AdminNotificationOperationsReadPort {
    var snapshotCalls = 0
    var lastEventFilter: AdminNotificationFilter? = null
    var lastEventPageRequest: PageRequest? = null
    var lastDeliveryFilter: AdminNotificationFilter? = null
    var lastDeliveryPageRequest: PageRequest? = null

    override fun snapshot(): AdminNotificationOperationsSnapshot {
        snapshotCalls += 1
        return adminSnapshot()
    }

    override fun listEvents(
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent> {
        lastEventFilter = filter
        lastEventPageRequest = pageRequest
        return CursorPage(emptyList(), null)
    }

    override fun listDeliveries(
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery> {
        lastDeliveryFilter = filter
        lastDeliveryPageRequest = pageRequest
        return CursorPage(emptyList(), null)
    }
}

private fun adminSnapshot(): AdminNotificationOperationsSnapshot =
    AdminNotificationOperationsSnapshot(
        generatedAt = TIMESTAMP,
        outboxSummary =
            AdminNotificationStatusSummary(
                pending = 2,
                active = 1,
                failed = 0,
                dead = 0,
                sentOrPublishedLast24h = 3,
            ),
        deliverySummary =
            AdminNotificationStatusSummary(
                pending = 4,
                active = 1,
                failed = 1,
                dead = 0,
                sentOrPublishedLast24h = 9,
            ),
        relaySummary =
            AdminNotificationRelaySummary(
                publishing = 0,
                sending = 1,
                stalePublishing = 0,
                staleSending = 0,
            ),
        failureClusters = emptyList(),
        clubHealth =
            listOf(
                AdminNotificationClubHealth(
                    clubId = CLUB_ID,
                    slug = "reading-sai",
                    name = "Reading Sai",
                    pending = 2,
                    failed = 0,
                    dead = 0,
                    lastSuccessAt = TIMESTAMP,
                ),
            ),
        recentManualDispatches = emptyList(),
    )

private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val ADMIN_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
private val TIMESTAMP: OffsetDateTime = OffsetDateTime.of(2026, 5, 27, 1, 2, 3, 0, ZoneOffset.UTC)
