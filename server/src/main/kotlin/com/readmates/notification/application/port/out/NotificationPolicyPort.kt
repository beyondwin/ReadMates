package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.HostNotificationPolicy
import java.util.UUID

interface NotificationPolicyPort {
    fun get(clubId: UUID): HostNotificationPolicy

    fun save(
        clubId: UUID,
        hostMembershipId: UUID,
        sessionReminderEnabled: Boolean,
    ): HostNotificationPolicy
}
