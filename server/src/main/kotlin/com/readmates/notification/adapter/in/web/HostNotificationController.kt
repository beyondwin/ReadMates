package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.port.`in`.GetHostNotificationSummaryUseCase
import com.readmates.notification.application.port.`in`.ProcessNotificationOutboxUseCase
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/host/notifications")
class HostNotificationController(
    private val getHostNotificationSummaryUseCase: GetHostNotificationSummaryUseCase,
    private val processNotificationOutboxUseCase: ProcessNotificationOutboxUseCase,
) {
    @GetMapping("/summary")
    fun summary(host: CurrentMember) =
        getHostNotificationSummaryUseCase.getHostNotificationSummary(host)

    @PostMapping("/process")
    fun process(host: CurrentMember): Map<String, Int> {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }

        return mapOf("processed" to processNotificationOutboxUseCase.processPendingForClub(host.clubId, PROCESS_BATCH_SIZE))
    }
}

private const val PROCESS_BATCH_SIZE = 20
