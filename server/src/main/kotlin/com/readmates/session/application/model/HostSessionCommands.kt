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
    val idempotencyKey: String? = null,
)

fun HostSessionCommand.createdVersionVector(): SessionVersionVector = SessionVersionVector.INITIAL

data class HostSessionIdCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val expectedSessionRevision: ExpectedSessionRevision? = null,
    val expectedParticipantSetRevision: Long? = null,
    val expectedAttendanceSnapshotId: String? = null,
    val expectedPublishVector: PublicationVersionVector? = null,
    val expectedCorrectionVector: CorrectionPublicationVersionVector? = null,
    val idempotencyKey: String? = null,
)

const val MAX_REASON_NOTE_LENGTH = 500

data class HostSessionReverseCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val reasonCode: HostSessionLifecycleReasonCode?,
    val reasonNote: String?,
    val expectedSessionRevision: ExpectedSessionRevision? = null,
    val idempotencyKey: String? = null,
)

fun HostSessionReverseCommand.normalized(requireReason: Boolean): HostSessionReverseCommand =
    copy(reasonCode = resolvedReasonCode(requireReason), reasonNote = validatedReasonNote())

private fun HostSessionReverseCommand.resolvedReasonCode(requireReason: Boolean): HostSessionLifecycleReasonCode {
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
    return code
}

private fun HostSessionReverseCommand.validatedReasonNote(): String? {
    val note = reasonNote?.trim()?.takeIf(String::isNotEmpty)
    if (note != null && (note.length > MAX_REASON_NOTE_LENGTH || note.any(Char::isISOControl))) {
        throw InvalidHostSessionLifecycleReasonException()
    }
    return note
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
    val expectedSessionRevision: ExpectedSessionRevision? = null,
    val idempotencyKey: String? = null,
)

data class UpdateHostSessionVisibilityCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val visibility: SessionRecordVisibility = SessionRecordVisibility.HOST_ONLY,
    val accessScope: SessionAccessScope? = null,
    val expectedExposureRevision: Long? = null,
    val idempotencyKey: String? = null,
)

enum class ActualAttendanceStatus {
    ATTENDED,
    ABSENT,
    UNKNOWN,
}

data class UpdateParticipantAttendanceCommand(
    val membershipId: UUID,
    val status: ActualAttendanceStatus,
    val expectedAttendanceRevision: Long,
    val expectedCurrentStatus: ActualAttendanceStatus? = null,
) {
    init {
        require(expectedAttendanceRevision >= 0) { "expectedAttendanceRevision must be non-negative" }
    }
}

data class BulkAttendanceCommand(
    val rows: List<UpdateParticipantAttendanceCommand>,
    val expectedParticipantSetRevision: Long,
) {
    init {
        require(rows.isNotEmpty()) { "bulk attendance rows must not be empty" }
        require(expectedParticipantSetRevision >= 0) { "expectedParticipantSetRevision must be non-negative" }
    }
}

data class AttendanceEntryCommand(
    val membershipId: String,
    val attendanceStatus: String,
    val expectedAttendanceRevision: Long,
    val expectedCurrentStatus: String? = null,
) {
    init {
        require(expectedAttendanceRevision >= 0) { "expectedAttendanceRevision must be non-negative" }
    }
}

data class ConfirmAttendanceCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val entries: List<AttendanceEntryCommand>,
    val expectedParticipantSetRevision: Long? = null,
    val idempotencyKey: String? = null,
)

data class UpsertPublicationCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val publicSummary: String,
    val visibility: SessionRecordVisibility = SessionRecordVisibility.HOST_ONLY,
    val siteVisibility: PublicSiteVisibility? = null,
    val expectedPublicationRevision: Long? = null,
    val idempotencyKey: String? = null,
)
