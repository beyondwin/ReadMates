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
    private val notificationEventOutboxPort: NotificationEventOutboxPort,
    private val notificationDeliveryPort: NotificationDeliveryPort,
    private val notificationDeliveryProcessingService: NotificationDeliveryProcessingService,
) : GetHostNotificationSummaryUseCase,
    ManageHostNotificationsUseCase {
    override fun getHostNotificationSummary(host: CurrentMember): HostNotificationSummary =
        notificationDeliveryPort.hostSummary(requireHost(host).clubId)

    override fun listItems(host: CurrentMember, query: HostNotificationItemQuery): HostNotificationItemList =
        notificationDeliveryPort.listHostEmailItems(requireHost(host).clubId, query.copy(limit = query.limit.coerceIn(1, 100)))

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
        notificationDeliveryPort.hostEmailDetail(requireHost(host).clubId, id)
            ?: throw notificationAccessDenied()

    override fun retry(host: CurrentMember, id: UUID): HostNotificationDetail {
        val currentHost = requireHost(host)
        val item = notificationDeliveryPort.claimHostEmailDelivery(currentHost.clubId, id)
            ?: throw notificationAccessDenied()
        notificationDeliveryProcessingService.processClaimed(item)
        return notificationDeliveryPort.hostEmailDetail(currentHost.clubId, id)
            ?: throw notificationAccessDenied()
    }

    override fun restore(host: CurrentMember, id: UUID): HostNotificationDetail {
        val currentHost = requireHost(host)
        if (!notificationDeliveryPort.restoreDeadEmailDeliveryForClub(currentHost.clubId, id)) {
            throw notificationAccessDenied()
        }
        return notificationDeliveryPort.hostEmailDetail(currentHost.clubId, id)
            ?: throw notificationAccessDenied()
    }

    private fun requireHost(host: CurrentMember): CurrentMember {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        return host
    }

    private fun notificationAccessDenied(): AccessDeniedException =
        AccessDeniedException("Notification not found")
}

private const val MAX_HOST_LEDGER_LIMIT = 100
