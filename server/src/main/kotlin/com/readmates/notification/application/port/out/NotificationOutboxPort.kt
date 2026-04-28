package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationOutboxItem
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

interface NotificationOutboxPort {
    fun enqueueFeedbackDocumentPublished(clubId: UUID, sessionId: UUID): Int
    fun enqueueNextBookPublished(clubId: UUID, sessionId: UUID): Int
    fun enqueueSessionReminderDue(targetDate: LocalDate): Int
    fun claimPending(limit: Int): List<NotificationOutboxItem>
    fun claimPendingForClub(clubId: UUID, limit: Int): List<NotificationOutboxItem>
    fun markSent(id: UUID, lockedAt: OffsetDateTime)
    fun markFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long)
    fun markDead(id: UUID, lockedAt: OffsetDateTime, error: String)
    fun hostSummary(clubId: UUID): HostNotificationSummary
}
