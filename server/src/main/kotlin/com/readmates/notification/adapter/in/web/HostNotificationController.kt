package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.SendNotificationTestMailCommand
import com.readmates.notification.application.port.`in`.GetHostNotificationSummaryUseCase
import com.readmates.notification.application.port.`in`.ManageHostNotificationsUseCase
import com.readmates.notification.application.port.`in`.ProcessNotificationOutboxUseCase
import com.readmates.notification.application.port.`in`.SendNotificationTestMailUseCase
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
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
    private val processNotificationOutboxUseCase: ProcessNotificationOutboxUseCase,
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
        @RequestParam(defaultValue = "50") limit: Int,
    ): HostNotificationItemListResponse =
        manageHostNotificationsUseCase.listItems(
            host,
            HostNotificationItemQuery(
                status = status,
                eventType = eventType,
                limit = limit,
            ),
        ).toResponse()

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
    fun testMailAudit(host: CurrentMember): List<NotificationTestMailAuditResponse> =
        sendNotificationTestMailUseCase.listTestMailAudit(host).map { it.toResponse() }

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

        return mapOf("processed" to processNotificationOutboxUseCase.processPendingForClub(host.clubId, PROCESS_BATCH_SIZE))
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
