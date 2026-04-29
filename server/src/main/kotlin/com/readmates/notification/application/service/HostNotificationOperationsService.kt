package com.readmates.notification.application.service

import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationDeliveryList
import com.readmates.notification.application.model.HostNotificationEventList
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.port.`in`.GetHostNotificationSummaryUseCase
import com.readmates.notification.application.port.`in`.ManageHostNotificationsUseCase
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class HostNotificationOperationsService(
    private val notificationOutboxService: NotificationOutboxService,
    private val notificationEventOutboxPort: NotificationEventOutboxPort,
    private val notificationDeliveryPort: NotificationDeliveryPort,
) : GetHostNotificationSummaryUseCase,
    ManageHostNotificationsUseCase {
    override fun getHostNotificationSummary(host: CurrentMember): HostNotificationSummary =
        notificationOutboxService.getHostNotificationSummary(host)

    override fun listItems(host: CurrentMember, query: HostNotificationItemQuery): HostNotificationItemList =
        notificationOutboxService.listItems(host, query)

    override fun listEvents(
        host: CurrentMember,
        status: NotificationEventOutboxStatus?,
        limit: Int,
    ): HostNotificationEventList {
        val currentHost = requireHost(host)
        return HostNotificationEventList(
            notificationEventOutboxPort.listHostEvents(
                clubId = currentHost.clubId,
                status = status,
                limit = limit.coerceIn(1, MAX_HOST_LEDGER_LIMIT),
            ),
        )
    }

    override fun listDeliveries(
        host: CurrentMember,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        limit: Int,
    ): HostNotificationDeliveryList {
        val currentHost = requireHost(host)
        return HostNotificationDeliveryList(
            notificationDeliveryPort.listHostDeliveries(
                clubId = currentHost.clubId,
                status = status,
                channel = channel,
                limit = limit.coerceIn(1, MAX_HOST_LEDGER_LIMIT),
            ),
        )
    }

    override fun detail(host: CurrentMember, id: UUID): HostNotificationDetail =
        notificationOutboxService.detail(host, id)

    override fun retry(host: CurrentMember, id: UUID): HostNotificationDetail =
        notificationOutboxService.retry(host, id)

    override fun restore(host: CurrentMember, id: UUID): HostNotificationDetail =
        notificationOutboxService.restore(host, id)

    private fun requireHost(host: CurrentMember): CurrentMember {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        return host
    }
}

private const val MAX_HOST_LEDGER_LIMIT = 100
