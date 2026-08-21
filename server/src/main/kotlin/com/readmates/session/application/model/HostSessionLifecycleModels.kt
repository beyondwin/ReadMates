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
