package com.readmates.notification.application.model

import java.time.OffsetDateTime

data class HostNotificationPolicy(
    val sessionReminderEnabled: Boolean,
    val updatedAt: OffsetDateTime?,
)

data class UpdateNotificationPolicyCommand(
    val sessionReminderEnabled: Boolean,
)
