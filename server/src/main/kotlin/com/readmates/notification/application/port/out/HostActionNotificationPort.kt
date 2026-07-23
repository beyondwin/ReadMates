package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.HostActionTargetCounts
import com.readmates.notification.application.model.HostConfirmedAction
import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.domain.NotificationEventType
import java.time.OffsetDateTime
import java.util.UUID

data class HostActionNotificationPreviewRecord(
    val id: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val hostMembershipId: UUID,
    val action: HostConfirmedAction,
    val eventType: NotificationEventType,
    val requestHash: String,
    val expectedDraftRevision: Long?,
    val expectedLiveRevision: Long,
    val counts: HostActionTargetCounts,
    val expiresAt: OffsetDateTime,
    val consumedAt: OffsetDateTime? = null,
    val consumedDecisionId: UUID? = null,
)

data class StoredHostActionDecision(
    val id: UUID,
    val previewId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val hostMembershipId: UUID,
    val action: HostConfirmedAction,
    val eventType: NotificationEventType,
    val liveRevision: Long,
    val decision: NotificationDecision,
    val counts: HostActionTargetCounts,
    val eventId: UUID?,
    val createdAt: OffsetDateTime,
)

interface HostActionNotificationPort {
    fun countTargets(
        clubId: UUID,
        sessionId: UUID,
        eventType: NotificationEventType,
    ): HostActionTargetCounts

    fun insertPreview(record: HostActionNotificationPreviewRecord): UUID

    fun lockPreview(
        previewId: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
    ): HostActionNotificationPreviewRecord?

    fun findDecision(previewId: UUID): StoredHostActionDecision?

    fun completeDecision(
        preview: HostActionNotificationPreviewRecord,
        decision: NotificationDecision,
        liveRevision: Long,
        eventId: UUID?,
        now: OffsetDateTime,
    ): StoredHostActionDecision
}
