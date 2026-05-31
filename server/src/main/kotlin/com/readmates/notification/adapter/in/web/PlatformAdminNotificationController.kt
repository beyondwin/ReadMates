@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest
import com.readmates.notification.application.port.`in`.ManageAdminNotificationOperationsUseCase
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/admin/notifications")
class PlatformAdminNotificationController(
    private val useCase: ManageAdminNotificationOperationsUseCase,
) {
    @GetMapping("/snapshot")
    @Suppress("ktlint:standard:function-expression-body")
    fun snapshot(admin: CurrentPlatformAdmin): AdminNotificationOperationsSnapshotResponse {
        return useCase.snapshot(admin).toResponse()
    }

    @GetMapping("/events")
    fun events(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) clubId: UUID?,
        @RequestParam(required = false) status: NotificationEventOutboxStatus?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): CursorPageResponse<AdminNotificationOutboxEventResponse> =
        useCase
            .listEvents(
                admin = admin,
                filter = AdminNotificationFilter(clubId = clubId, eventStatus = status),
                pageRequest = PageRequest.cursor(limit, cursor, defaultLimit = 50, maxLimit = 100),
            ).mapItems(AdminNotificationOutboxEvent::toResponse)

    @GetMapping("/deliveries")
    @Suppress("LongParameterList")
    fun deliveries(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) clubId: UUID?,
        @RequestParam(required = false) status: NotificationDeliveryStatus?,
        @RequestParam(required = false) channel: NotificationChannel?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): CursorPageResponse<AdminNotificationDeliveryResponse> =
        useCase
            .listDeliveries(
                admin = admin,
                filter =
                    AdminNotificationFilter(
                        clubId = clubId,
                        deliveryStatus = status,
                        channel = channel,
                    ),
                pageRequest = PageRequest.cursor(limit, cursor, defaultLimit = 50, maxLimit = 100),
            ).mapItems(AdminNotificationDelivery::toResponse)

    @PostMapping("/replay-preview")
    fun preview(
        admin: CurrentPlatformAdmin,
        @RequestBody request: AdminNotificationReplayPreviewRequestBody,
    ): AdminNotificationReplayPreviewResponse =
        useCase
            .previewReplay(admin, AdminNotificationReplayPreviewRequest(request.toFilter()))
            .toResponse()

    @PostMapping("/replay-confirm")
    fun confirm(
        admin: CurrentPlatformAdmin,
        @RequestBody request: AdminNotificationReplayConfirmRequestBody,
    ): AdminNotificationReplayConfirmResponse =
        useCase
            .confirmReplay(
                admin,
                AdminNotificationReplayConfirmCommand(
                    previewId = UUID.fromString(request.previewId),
                    selectionHash = request.selectionHash,
                    reason = request.reason,
                ),
            ).toResponse()
}

private fun AdminNotificationReplayPreviewRequestBody.toFilter(): AdminNotificationFilter {
    val replayFilter = filter
    return AdminNotificationFilter(
        clubId = replayFilter?.clubId?.let(UUID::fromString) ?: clubId?.let(UUID::fromString),
        deliveryStatus = replayFilter?.deliveryStatus,
        channel = replayFilter?.channel,
    )
}
