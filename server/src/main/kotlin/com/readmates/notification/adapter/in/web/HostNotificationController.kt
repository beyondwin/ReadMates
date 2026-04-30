package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.SendNotificationTestMailCommand
import com.readmates.notification.application.port.`in`.GetHostNotificationSummaryUseCase
import com.readmates.notification.application.port.`in`.ManageHostNotificationsUseCase
import com.readmates.notification.application.port.`in`.ProcessNotificationDeliveriesUseCase
import com.readmates.notification.application.port.`in`.SendNotificationTestMailUseCase
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/host/notifications")
class HostNotificationController(
    private val getHostNotificationSummaryUseCase: GetHostNotificationSummaryUseCase,
    private val processNotificationDeliveriesUseCase: ProcessNotificationDeliveriesUseCase,
    private val manageHostNotificationsUseCase: ManageHostNotificationsUseCase,
    private val sendNotificationTestMailUseCase: SendNotificationTestMailUseCase,
) {
    @GetMapping("/summary")
    fun summary(host: CurrentMember): HostNotificationSummaryResponse =
        getHostNotificationSummaryUseCase.getHostNotificationSummary(host).toResponse()

    @GetMapping("/items")
    fun listItems(
        host: CurrentMember,
        @RequestParam(required = false) status: NotificationOutboxStatus?,
        @RequestParam(required = false) eventType: NotificationEventType?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): HostNotificationItemListResponse =
        manageHostNotificationsUseCase.listItems(
            host,
            HostNotificationItemQuery(
                status = status,
                eventType = eventType,
            ),
            PageRequest.cursor(limit, cursor, defaultLimit = 50, maxLimit = 100),
        ).toResponse()

    @GetMapping("/events")
    fun events(
        host: CurrentMember,
        @RequestParam(required = false) status: NotificationEventOutboxStatus?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): HostNotificationEventListResponse =
        manageHostNotificationsUseCase
            .listEvents(host, status, PageRequest.cursor(limit, cursor, defaultLimit = 50, maxLimit = 100))
            .toResponse()

    @GetMapping("/deliveries")
    fun deliveries(
        host: CurrentMember,
        @RequestParam(required = false) status: NotificationDeliveryStatus?,
        @RequestParam(required = false) channel: NotificationChannel?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): HostNotificationDeliveryListResponse =
        manageHostNotificationsUseCase
            .listDeliveries(host, status, channel, PageRequest.cursor(limit, cursor, defaultLimit = 50, maxLimit = 100))
            .toResponse()

    @PostMapping("/test-mail")
    fun sendTestMail(
        host: CurrentMember,
        @RequestBody request: SendNotificationTestMailRequest,
    ): NotificationTestMailAuditResponse =
        sendNotificationTestMailUseCase.sendTestMail(
            host,
            SendNotificationTestMailCommand(request.recipientEmail),
        ).toResponse()

    @GetMapping("/test-mail/audit")
    fun testMailAudit(
        host: CurrentMember,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): CursorPageResponse<NotificationTestMailAuditResponse> =
        sendNotificationTestMailUseCase
            .listTestMailAudit(host, PageRequest.cursor(limit, cursor, defaultLimit = 50, maxLimit = 100))
            .mapItems { it.toResponse() }

    @GetMapping("/items/{id}")
    fun detail(
        host: CurrentMember,
        @PathVariable id: UUID,
    ): HostNotificationDetailResponse =
        manageHostNotificationsUseCase.detail(host, id).toResponse()

    @PostMapping("/process")
    fun process(host: CurrentMember): Map<String, Int> {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }

        return mapOf("processed" to processNotificationDeliveriesUseCase.processPendingForClub(host.clubId, PROCESS_BATCH_SIZE))
    }

    @PostMapping("/items/{id}/retry")
    fun retry(
        host: CurrentMember,
        @PathVariable id: UUID,
    ): HostNotificationDetailResponse =
        manageHostNotificationsUseCase.retry(host, id).toResponse()

    @PostMapping("/items/{id}/restore")
    fun restore(
        host: CurrentMember,
        @PathVariable id: UUID,
    ): HostNotificationDetailResponse =
        manageHostNotificationsUseCase.restore(host, id).toResponse()
}

private const val PROCESS_BATCH_SIZE = 20
