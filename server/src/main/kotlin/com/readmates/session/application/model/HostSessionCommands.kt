package com.readmates.session.application.model

import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.security.CurrentMember
import java.util.UUID

data class HostSessionCommand(
    val host: CurrentMember,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookLink: String?,
    val bookImageUrl: String?,
    val date: String,
    val startTime: String?,
    val endTime: String?,
    val questionDeadlineAt: String?,
    val locationLabel: String?,
    val meetingUrl: String?,
    val meetingPasscode: String?,
    val accessScope: SessionAccessScope? = null,
)

data class HostSessionIdCommand(
    val host: CurrentMember,
    val sessionId: UUID,
)

data class HostSessionReverseCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val reasonCode: HostSessionLifecycleReasonCode?,
    val reasonNote: String?,
)

fun HostSessionReverseCommand.normalized(requireReason: Boolean): HostSessionReverseCommand {
    val code =
        reasonCode
            ?: if (requireReason) {
                throw HostSessionLifecycleReasonRequiredException()
            } else {
                HostSessionLifecycleReasonCode.LEGACY_UNSPECIFIED
            }
    if (reasonCode != null && reasonCode !in USER_SELECTABLE_LIFECYCLE_REASONS) {
        throw InvalidHostSessionLifecycleReasonException()
    }
    val note = reasonNote?.trim()?.takeIf(String::isNotEmpty)
    if (note != null && (note.length > 500 || note.any(Char::isISOControl))) {
        throw InvalidHostSessionLifecycleReasonException()
    }
    return copy(reasonCode = code, reasonNote = note)
}

val USER_SELECTABLE_LIFECYCLE_REASONS =
    setOf(
        HostSessionLifecycleReasonCode.ACCIDENTAL_TRANSITION,
        HostSessionLifecycleReasonCode.MEETING_RESCHEDULED,
        HostSessionLifecycleReasonCode.CONTENT_CORRECTION,
        HostSessionLifecycleReasonCode.OPERATIONAL_RECOVERY,
        HostSessionLifecycleReasonCode.OTHER_OPERATIONAL_REASON,
    )

class HostSessionLifecycleReasonRequiredException : RuntimeException("Lifecycle reason is required")

class InvalidHostSessionLifecycleReasonException : RuntimeException("Lifecycle reason is invalid")

data class UpdateHostSessionCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val session: HostSessionCommand,
)

data class UpdateHostSessionVisibilityCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val visibility: SessionRecordVisibility = SessionRecordVisibility.HOST_ONLY,
    val accessScope: SessionAccessScope? = null,
)

data class AttendanceEntryCommand(
    val membershipId: String,
    val attendanceStatus: String,
)

data class ConfirmAttendanceCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val entries: List<AttendanceEntryCommand>,
)

data class UpsertPublicationCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val publicSummary: String,
    val visibility: SessionRecordVisibility = SessionRecordVisibility.HOST_ONLY,
    val siteVisibility: PublicSiteVisibility? = null,
)
