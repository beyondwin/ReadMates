package com.readmates.notification.application.service

import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplayConfirmResult
import com.readmates.notification.application.model.AdminNotificationReplayPreview
import com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest
import com.readmates.notification.application.port.`in`.ManageAdminNotificationOperationsUseCase
import com.readmates.notification.application.port.out.AdminNotificationOperationsReadPort
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service

@Service
class AdminNotificationOperationsService(
    private val readPort: AdminNotificationOperationsReadPort,
    private val replayService: AdminNotificationReplayService,
) : ManageAdminNotificationOperationsUseCase {
    override fun snapshot(admin: CurrentPlatformAdmin): AdminNotificationOperationsSnapshot = readPort.snapshot()

    override fun listEvents(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent> =
        readPort.listEvents(
            filter = filter,
            pageRequest = pageRequest.adminLedgerPage(),
        )

    override fun listDeliveries(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery> =
        readPort.listDeliveries(
            filter = filter,
            pageRequest = pageRequest.adminLedgerPage(),
        )

    override fun previewReplay(
        admin: CurrentPlatformAdmin,
        request: AdminNotificationReplayPreviewRequest,
    ): AdminNotificationReplayPreview = replayService.preview(admin, request)

    override fun confirmReplay(
        admin: CurrentPlatformAdmin,
        command: AdminNotificationReplayConfirmCommand,
    ): AdminNotificationReplayConfirmResult = replayService.confirm(admin, command)
}

private fun PageRequest.adminLedgerPage(): PageRequest = copy(limit = limit.coerceIn(1, MAX_ADMIN_LEDGER_LIMIT))

private const val MAX_ADMIN_LEDGER_LIMIT = 100
