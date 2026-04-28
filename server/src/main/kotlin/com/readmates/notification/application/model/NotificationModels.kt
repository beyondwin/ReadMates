package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import java.time.OffsetDateTime
import java.util.UUID

data class NotificationOutboxItem(
    val id: UUID,
    val clubId: UUID,
    val eventType: NotificationEventType,
    val recipientEmail: String,
    val subject: String,
    val bodyText: String,
    val deepLinkPath: String,
    val status: NotificationOutboxStatus,
    val attemptCount: Int,
    val lockedAt: OffsetDateTime,
)

data class HostNotificationSummary(
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val sentLast24h: Int,
    val latestFailures: List<HostNotificationFailure>,
)

data class NotificationOutboxBacklog(
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val sending: Int,
)

data class HostNotificationFailure(
    val id: UUID,
    val eventType: NotificationEventType,
    val recipientEmail: String,
    val attemptCount: Int,
    val updatedAt: OffsetDateTime,
)
