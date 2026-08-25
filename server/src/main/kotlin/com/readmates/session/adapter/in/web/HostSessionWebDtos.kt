package com.readmates.session.adapter.`in`.web

import com.fasterxml.jackson.annotation.JsonInclude
import com.readmates.session.application.HostSessionAutomaticScheduleDefaults
import com.readmates.session.application.HostSessionScheduleDefaults
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.model.AttendanceVersion
import com.readmates.session.application.model.ExpectedSessionRevision
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.SessionVersionVector
import com.readmates.session.domain.SessionAccessScope
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.validation.CodePointSize
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import java.net.URI
import java.time.LocalDate
import java.util.UUID

data class HostSessionRequest(
    @field:NotBlank @field:CodePointSize(max = 255) val title: String,
    @field:NotBlank @field:CodePointSize(max = 255) val bookTitle: String,
    @field:NotBlank @field:CodePointSize(max = 255) val bookAuthor: String,
    @field:CodePointSize(max = 500) val bookLink: String? = null,
    @field:CodePointSize(max = 1000) val bookImageUrl: String? = null,
    @field:Pattern(regexp = "\\d{4}-\\d{2}-\\d{2}") val date: String,
    @field:Pattern(regexp = "\\d{2}:\\d{2}") val startTime: String? = null,
    @field:Pattern(regexp = "\\d{2}:\\d{2}") val endTime: String? = null,
    val questionDeadlineAt: String? = null,
    @field:CodePointSize(max = 255) val locationLabel: String? = null,
    @field:CodePointSize(max = 1000) val meetingUrl: String? = null,
    @field:CodePointSize(max = 255) val meetingPasscode: String? = null,
    val accessScope: SessionAccessScope? = null,
    val expectedSessionRevision: Long? = null,
) {
    @AssertTrue(message = "date must be a valid ISO calendar date")
    fun isValidCalendarDate(): Boolean =
        runCatching {
            LocalDate.parse(date)
        }.isSuccess

    @AssertTrue(message = "startTime and endTime must be valid local times")
    fun hasValidTimeRange(): Boolean {
        val parsedStart = runCatching { java.time.LocalTime.parse(effectiveStartTime()) }.getOrNull() ?: return false
        val parsedEnd = runCatching { java.time.LocalTime.parse(effectiveEndTime()) }.getOrNull() ?: return false
        return parsedEnd.isAfter(parsedStart)
    }

    @AssertTrue(message = "questionDeadlineAt must be an ISO offset datetime")
    fun hasValidQuestionDeadline(): Boolean =
        questionDeadlineAt.isNullOrBlank() ||
            runCatching {
                java.time.OffsetDateTime.parse(questionDeadlineAt)
            }.isSuccess

    @AssertTrue(message = "bookLink must be an https URL")
    fun hasAllowedBookLink(): Boolean = isHttpsUrlOrBlank(bookLink)

    @AssertTrue(message = "bookImageUrl must be an https URL")
    fun hasAllowedBookImageUrl(): Boolean = isHttpsUrlOrBlank(bookImageUrl)

    @AssertTrue(message = "meetingUrl must be an https URL")
    fun hasAllowedMeetingUrl(): Boolean = isHttpsUrlOrBlank(meetingUrl)

    fun effectiveStartTime(): String = startTime ?: "20:00"

    fun effectiveEndTime(): String = endTime ?: "22:00"

    fun toCommand(host: CurrentMember): HostSessionCommand =
        HostSessionCommand(
            host = host,
            title = title,
            bookTitle = bookTitle,
            bookAuthor = bookAuthor,
            bookLink = bookLink,
            bookImageUrl = bookImageUrl,
            date = date,
            startTime = startTime,
            endTime = endTime,
            questionDeadlineAt = questionDeadlineAt,
            locationLabel = locationLabel,
            meetingUrl = meetingUrl,
            meetingPasscode = meetingPasscode,
            accessScope = accessScope,
        )

    fun createdVersionVector(): SessionVersionVector = SessionVersionVector.INITIAL

    fun requiredExpectedRevision(): ExpectedSessionRevision =
        ExpectedSessionRevision(expectedSessionRevision ?: throw InvalidSessionScheduleException())
}

data class HostSessionExpectedRevisionRequest(
    val expectedSessionRevision: Long,
) {
    fun toExpectedRevision(): ExpectedSessionRevision = ExpectedSessionRevision(expectedSessionRevision)
}

data class HostSessionRevisionConflictResponse(
    val code: String = "REVISION_CONFLICT",
    val message: String,
    val status: Int,
    val current: SessionVersionVectorBody,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val changedAt: String? = null,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val changedByDisplay: String? = null,
    val traceId: String? = null,
)

data class HostListRestartTargetBody(
    val mode: String,
    val states: List<String>,
)

data class HostListCursorStaleResponse(
    val code: String = "LIST_CURSOR_STALE",
    val message: String,
    val status: Int,
    val restartTarget: HostListRestartTargetBody,
    val traceId: String? = null,
)

data class SessionVersionVectorBody(
    val sessionRevision: Long,
    val exposureRevision: Long,
    val participantSetRevision: Long,
    val recordDraftRevision: Long?,
    val liveRecordRevision: Long?,
    val publicationRevision: Long,
) {
    fun toModel() =
        SessionVersionVector(
            sessionRevision = sessionRevision,
            exposureRevision = exposureRevision,
            participantSetRevision = participantSetRevision,
            recordDraftRevision = recordDraftRevision,
            liveRecordRevision = liveRecordRevision,
            publicationRevision = publicationRevision,
        )
}

fun SessionVersionVector.toBody() =
    SessionVersionVectorBody(
        sessionRevision = sessionRevision,
        exposureRevision = exposureRevision,
        participantSetRevision = participantSetRevision,
        recordDraftRevision = recordDraftRevision,
        liveRecordRevision = liveRecordRevision,
        publicationRevision = publicationRevision,
    )

data class AttendanceVersionBody(
    val membershipId: UUID,
    val attendanceRevision: Long,
) {
    fun toModel() =
        AttendanceVersion(
            membershipId = membershipId,
            attendanceRevision = attendanceRevision,
        )
}

fun AttendanceVersion.toBody() =
    AttendanceVersionBody(
        membershipId = membershipId,
        attendanceRevision = attendanceRevision,
    )

data class PreviousOnlineMeetingResponse(
    val meetingUrl: String,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val meetingPasscode: String?,
)

data class HostSessionScheduleDefaultsResponse(
    val automatic: HostSessionAutomaticScheduleDefaults,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val previousOnlineMeeting: PreviousOnlineMeetingResponse?,
    val hints: List<String>,
    val startTime: String,
    val endTime: String,
    val locationLabel: String,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val meetingUrl: String?,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val meetingPasscode: String?,
    val accessScope: SessionAccessScope,
    val suggestedDate: String?,
    val questionDeadlineOffsetDays: Long,
) {
    companion object {
        fun from(defaults: HostSessionScheduleDefaults): HostSessionScheduleDefaultsResponse {
            val automatic = defaults.automatic
            val previous =
                defaults.previousOnlineMeeting?.let { meeting ->
                    PreviousOnlineMeetingResponse(
                        meetingUrl = meeting.meetingUrl,
                        meetingPasscode = meeting.meetingPasscode,
                    )
                }
            return HostSessionScheduleDefaultsResponse(
                automatic = automatic,
                previousOnlineMeeting = previous,
                hints = defaults.hints,
                startTime = automatic.startTime,
                endTime = automatic.endTime,
                locationLabel = automatic.locationLabel,
                meetingUrl = previous?.meetingUrl,
                meetingPasscode = previous?.meetingPasscode,
                accessScope = automatic.accessScope,
                suggestedDate = automatic.suggestedDate,
                questionDeadlineOffsetDays = automatic.questionDeadlineOffsetDays,
            )
        }
    }
}

private fun isHttpsUrlOrBlank(value: String?): Boolean {
    val trimmed = value?.trim()
    if (trimmed.isNullOrEmpty()) {
        return true
    }

    val uri = runCatching { URI(trimmed) }.getOrNull() ?: return false
    return !uri.isOpaque &&
        uri.scheme.equals("https", ignoreCase = true) &&
        !uri.host.isNullOrBlank() &&
        uri.rawUserInfo == null
}
