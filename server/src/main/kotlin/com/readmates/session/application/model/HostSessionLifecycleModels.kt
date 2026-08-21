package com.readmates.session.application.model

import com.readmates.shared.security.CurrentMember
import java.util.UUID

enum class HostSessionLifecycleAction { OPENED, CLOSED, PUBLISHED, REOPENED, UNPUBLISHED, RETURNED_TO_DRAFT, DELETED }

enum class HostSessionLifecycleReasonCode {
    ACCIDENTAL_TRANSITION,
    MEETING_RESCHEDULED,
    CONTENT_CORRECTION,
    OPERATIONAL_RECOVERY,
    OTHER_OPERATIONAL_REASON,
    LEGACY_UNSPECIFIED,
    EMPTY_SESSION_DELETED,
}

data class HostSessionLifecycleAuditEntry(
    val host: CurrentMember,
    val sessionId: UUID,
    val action: HostSessionLifecycleAction,
    val fromState: String,
    val toState: String?,
    val reasonCode: HostSessionLifecycleReasonCode?,
    val reasonNote: String?,
)

enum class HostSessionDeletionBlockerCode {
    RECORD_REVISION_EXISTS,
    NOTIFICATION_DECISION_EXISTS,
    MANUAL_DISPATCH_EXISTS,
    NOTIFICATION_EVENT_EXISTS,
    NOTIFICATION_DELIVERY_EXISTS,
    MEMBER_NOTIFICATION_EXISTS,
}

data class HostSessionDeletionBlocker(
    val code: HostSessionDeletionBlockerCode,
    val count: Int,
)

data class HostSessionDeletionTarget(
    val sessionId: UUID,
    val sessionNumber: Int,
    val title: String,
    val state: String,
)

class HostSessionDeletionBlockedException(
    val blockers: List<HostSessionDeletionBlocker>,
) : RuntimeException("Session deletion is blocked by durable history")

fun hostSessionDeletionBlockers(
    revisionCount: Int,
    decisionCount: Int,
    manualDispatchCount: Int,
    eventCount: Int,
    deliveryCount: Int,
    memberNotificationCount: Int,
): List<HostSessionDeletionBlocker> =
    listOf(
        HostSessionDeletionBlockerCode.RECORD_REVISION_EXISTS to revisionCount,
        HostSessionDeletionBlockerCode.NOTIFICATION_DECISION_EXISTS to decisionCount,
        HostSessionDeletionBlockerCode.MANUAL_DISPATCH_EXISTS to manualDispatchCount,
        HostSessionDeletionBlockerCode.NOTIFICATION_EVENT_EXISTS to eventCount,
        HostSessionDeletionBlockerCode.NOTIFICATION_DELIVERY_EXISTS to deliveryCount,
        HostSessionDeletionBlockerCode.MEMBER_NOTIFICATION_EXISTS to memberNotificationCount,
    ).mapNotNull { (code, count) ->
        if (count > 0) HostSessionDeletionBlocker(code, count) else null
    }
