package com.readmates.notification.application.service

import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationDeliveryList
import com.readmates.notification.application.model.HostNotificationEventList
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.port.`in`.GetHostNotificationSummaryUseCase
import com.readmates.notification.application.port.`in`.ManageHostNotificationsUseCase
import com.readmates.notification.application.port.out.HostNotificationDeliveryLedgerPort
import com.readmates.notification.application.port.out.NotificationDeliveryStatusPort
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationOutboxStatus
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class HostNotificationOperationsService(
    private val notificationEventOutboxPort: NotificationEventOutboxPort,
    private val notificationDeliveryLedgerPort: HostNotificationDeliveryLedgerPort,
    private val notificationDeliveryStatusPort: NotificationDeliveryStatusPort,
    private val notificationDeliveryProcessingService: NotificationDeliveryProcessingService,
    private val transactionalOps: NotificationDeliveryTransactionalOperations,
    @param:Value("\${readmates.notifications.enabled:false}") private val deliveryEnabled: Boolean,
) : GetHostNotificationSummaryUseCase,
    ManageHostNotificationsUseCase {
    override fun getHostNotificationSummary(host: CurrentMember): HostNotificationSummary =
        notificationDeliveryLedgerPort.hostSummary(requireHost(host).clubId)

    override fun listItems(
        host: CurrentMember,
        query: HostNotificationItemQuery,
        pageRequest: PageRequest,
    ): HostNotificationItemList =
        notificationDeliveryLedgerPort.listHostEmailItems(
            requireHost(host).clubId,
            query,
            pageRequest.copy(limit = pageRequest.limit.coerceIn(1, MAX_HOST_LEDGER_LIMIT)),
        )

    override fun listEvents(
        host: CurrentMember,
        status: NotificationEventOutboxStatus?,
        pageRequest: PageRequest,
    ): HostNotificationEventList {
        val currentHost = requireHost(host)
        val page = notificationEventOutboxPort.listHostEvents(
            clubId = currentHost.clubId,
            status = status,
            pageRequest = pageRequest.copy(limit = pageRequest.limit.coerceIn(1, MAX_HOST_LEDGER_LIMIT)),
        )
        return HostNotificationEventList(
            items = page.items,
            nextCursor = page.nextCursor,
        )
    }

    override fun listDeliveries(
        host: CurrentMember,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        pageRequest: PageRequest,
    ): HostNotificationDeliveryList {
        val currentHost = requireHost(host)
        val page = notificationDeliveryLedgerPort.listHostDeliveries(
            clubId = currentHost.clubId,
            status = status,
            channel = channel,
            pageRequest = pageRequest.copy(limit = pageRequest.limit.coerceIn(1, MAX_HOST_LEDGER_LIMIT)),
        )
        return HostNotificationDeliveryList(
            items = page.items,
            nextCursor = page.nextCursor,
        )
    }

    override fun detail(host: CurrentMember, id: UUID): HostNotificationDetail =
        notificationDeliveryLedgerPort.hostEmailDetail(requireHost(host).clubId, id)
            ?: throw notificationAccessDenied()

    override fun retry(host: CurrentMember, id: UUID): HostNotificationDetail {
        val currentHost = requireHost(host)
        if (!deliveryEnabled) {
            return notificationDeliveryLedgerPort.hostEmailDetail(currentHost.clubId, id)
                ?.takeIf { it.status == NotificationOutboxStatus.PENDING || it.status == NotificationOutboxStatus.FAILED }
                ?: throw notificationAccessDenied()
        }

        val item = transactionalOps.claimHostEmailDelivery(currentHost.clubId, id)
            ?: throw notificationAccessDenied()
        notificationDeliveryProcessingService.processClaimed(item)
        return notificationDeliveryLedgerPort.hostEmailDetail(currentHost.clubId, id)
            ?: throw notificationAccessDenied()
    }

    override fun restore(host: CurrentMember, id: UUID): HostNotificationDetail {
        val currentHost = requireHost(host)
        if (!notificationDeliveryStatusPort.restoreDeadEmailDeliveryForClub(currentHost.clubId, id)) {
            throw notificationAccessDenied()
        }
        return notificationDeliveryLedgerPort.hostEmailDetail(currentHost.clubId, id)
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
