package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationOutboxBacklog
import com.readmates.notification.application.model.NotificationOutboxItem
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.model.NotificationTestMailAuditItem
import com.readmates.shared.security.CurrentMember
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

interface NotificationOutboxPort {
    fun enqueueFeedbackDocumentPublished(clubId: UUID, sessionId: UUID): Int
    fun enqueueNextBookPublished(clubId: UUID, sessionId: UUID): Int
    fun enqueueSessionReminderDue(targetDate: LocalDate): Int
    fun claimPending(limit: Int): List<NotificationOutboxItem>
    fun claimPendingForClub(clubId: UUID, limit: Int): List<NotificationOutboxItem>
    fun markSent(id: UUID, lockedAt: OffsetDateTime): Boolean
    fun markFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean
    fun markDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean
    fun hostSummary(clubId: UUID): HostNotificationSummary
    fun listHostItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList
    fun hostItemDetail(clubId: UUID, id: UUID): HostNotificationDetail?
    fun retryableHostItemDetail(clubId: UUID, id: UUID): HostNotificationDetail?
    fun claimOneForClub(clubId: UUID, id: UUID): NotificationOutboxItem?
    fun restoreDeadForClub(clubId: UUID, id: UUID): Boolean
    fun outboxBacklog(): NotificationOutboxBacklog
    fun getPreferences(member: CurrentMember): NotificationPreferences
    fun savePreferences(member: CurrentMember, preferences: NotificationPreferences): NotificationPreferences
    fun reserveTestMailAuditAttempt(
        clubId: UUID,
        hostMembershipId: UUID,
        recipientMaskedEmail: String,
        recipientEmailHash: String,
        cooldownStartedAfter: OffsetDateTime,
    ): NotificationTestMailAuditItem?
    fun markTestMailAuditFailed(id: UUID, lastError: String): NotificationTestMailAuditItem
    fun listTestMailAudit(clubId: UUID): List<NotificationTestMailAuditItem>
}
