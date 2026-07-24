package com.readmates.notification.application.service

import com.readmates.notification.application.model.HostNotificationPolicy
import com.readmates.notification.application.model.UpdateNotificationPolicyCommand
import com.readmates.notification.application.port.`in`.GetHostNotificationPolicyUseCase
import com.readmates.notification.application.port.`in`.UpdateHostNotificationPolicyUseCase
import com.readmates.notification.application.port.out.NotificationPolicyPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class HostNotificationPolicyService(
    private val notificationPolicyPort: NotificationPolicyPort,
) : GetHostNotificationPolicyUseCase,
    UpdateHostNotificationPolicyUseCase {
    override fun get(host: CurrentMember): HostNotificationPolicy {
        requireHost(host)
        return notificationPolicyPort.get(host.clubId)
    }

    override fun update(
        host: CurrentMember,
        command: UpdateNotificationPolicyCommand,
    ): HostNotificationPolicy {
        requireHost(host)
        return notificationPolicyPort.save(
            clubId = host.clubId,
            hostMembershipId = host.membershipId,
            sessionReminderEnabled = command.sessionReminderEnabled,
        )
    }

    private fun requireHost(host: CurrentMember) {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
    }
}
