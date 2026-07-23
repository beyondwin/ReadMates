@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.model.HostNotificationPolicy
import com.readmates.notification.application.model.UpdateNotificationPolicyCommand
import com.readmates.notification.application.port.`in`.GetHostNotificationPolicyUseCase
import com.readmates.notification.application.port.`in`.UpdateHostNotificationPolicyUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime

@RestController
@RequestMapping("/api/host/notifications/policy")
class HostNotificationPolicyController(
    private val getHostNotificationPolicy: GetHostNotificationPolicyUseCase,
    private val updateHostNotificationPolicy: UpdateHostNotificationPolicyUseCase,
) {
    @GetMapping
    fun get(host: CurrentMember): HostNotificationPolicyResponse = getHostNotificationPolicy.get(host).toResponse()

    @PutMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun update(
        host: CurrentMember,
        @RequestBody request: UpdateHostNotificationPolicyRequest,
    ): HostNotificationPolicyResponse =
        updateHostNotificationPolicy
            .update(
                host,
                UpdateNotificationPolicyCommand(
                    sessionReminderEnabled = request.sessionReminderEnabled,
                ),
            ).toResponse()
}

data class UpdateHostNotificationPolicyRequest(
    val sessionReminderEnabled: Boolean,
)

data class HostNotificationPolicyResponse(
    val sessionReminderEnabled: Boolean,
    val updatedAt: OffsetDateTime?,
)

private fun HostNotificationPolicy.toResponse(): HostNotificationPolicyResponse =
    HostNotificationPolicyResponse(
        sessionReminderEnabled = sessionReminderEnabled,
        updatedAt = updatedAt,
    )
