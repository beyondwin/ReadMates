package com.readmates.session.application.model

import com.readmates.session.application.SessionRecordVisibility
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
)

data class HostSessionIdCommand(
    val host: CurrentMember,
    val sessionId: UUID,
)

data class UpdateHostSessionCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val session: HostSessionCommand,
)

data class UpdateHostSessionVisibilityCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val visibility: SessionRecordVisibility,
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
    val visibility: SessionRecordVisibility,
)
