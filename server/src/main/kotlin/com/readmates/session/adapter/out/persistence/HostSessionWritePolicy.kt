package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionCloseNotAllowedException
import com.readmates.session.application.HostSessionOpenNotAllowedException
import com.readmates.session.application.HostSessionPublishNotAllowedException
import com.readmates.session.application.HostSessionReopenNotAllowedException
import com.readmates.session.application.HostSessionReturnToDraftNotAllowedException
import com.readmates.session.application.HostSessionUnpublishNotAllowedException
import com.readmates.session.application.InvalidMembershipIdException
import com.readmates.session.application.InvalidSessionExposureException
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.domain.CompatibilityExposure
import com.readmates.session.domain.SessionExposure
import com.readmates.session.domain.toCompatibility
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private const val DEFAULT_START_TIME = "20:00"
private const val DEFAULT_END_TIME = "22:00"
private const val DEFAULT_DEADLINE_HOUR = 23
private const val DEFAULT_DEADLINE_MINUTE = 59
private const val SEOUL_OFFSET_HOURS = 9

internal object HostSessionWritePolicy {
    fun normalizeCreate(request: HostSessionCommand): NormalizedHostSessionWrite {
        val sessionDate = LocalDate.parse(request.date)
        val startTime = parseTime(request.startTime ?: DEFAULT_START_TIME)
        val endTime = parseTime(request.endTime ?: DEFAULT_END_TIME)
        if (!endTime.isAfter(startTime)) throw InvalidSessionScheduleException()
        return NormalizedHostSessionWrite(
            sessionDate = sessionDate,
            startTime = startTime,
            endTime = endTime,
            questionDeadlineAt = deadlineOrDefault(request.questionDeadlineAt, sessionDate),
            bookLink = blankToNull(request.bookLink),
            bookImageUrl = blankToNull(request.bookImageUrl),
            locationLabel = locationOrDefault(request.locationLabel),
            meetingUrl = blankToNull(request.meetingUrl),
            meetingPasscode = blankToNull(request.meetingPasscode),
        )
    }

    fun normalizeUpdate(
        request: HostSessionCommand,
        existing: ExistingHostSessionSchedule,
    ): NormalizedHostSessionWrite {
        val sessionDate = LocalDate.parse(request.date)
        val startTime = request.startTime?.let(::parseTime) ?: existing.startTime
        val endTime = request.endTime?.let(::parseTime) ?: existing.endTime
        if (!endTime.isAfter(startTime)) throw InvalidSessionScheduleException()
        return NormalizedHostSessionWrite(
            sessionDate = sessionDate,
            startTime = startTime,
            endTime = endTime,
            questionDeadlineAt =
                request.questionDeadlineAt?.let { deadlineOrDefault(it, sessionDate) }
                    ?: existing.questionDeadlineAt,
            bookLink = request.bookLink?.let(::blankToNull),
            bookImageUrl = request.bookImageUrl?.let(::blankToNull),
            locationLabel = request.locationLabel?.let(::locationOrDefault) ?: locationOrDefault(null),
            meetingUrl = request.meetingUrl?.let(::blankToNull),
            meetingPasscode = request.meetingPasscode?.let(::blankToNull),
        )
    }

    fun membershipId(value: String): UUID =
        runCatching { UUID.fromString(value) }
            .getOrElse { throw InvalidMembershipIdException() }

    fun publicationExposure(
        command: UpsertPublicationCommand,
        locked: LockedHostSessionExposure,
    ): SessionExposure =
        command.siteVisibility?.let { locked.exposure.copy(siteVisibility = it) }
            ?: SessionExposure.fromCompatibility(
                locked.state,
                command.visibility.name,
                command.visibility.name,
                command.visibility == SessionRecordVisibility.PUBLIC,
            )

    fun visibilityExposure(
        command: UpdateHostSessionVisibilityCommand,
        locked: LockedHostSessionExposure,
    ): SessionExposure =
        command.accessScope?.let { locked.exposure.copy(accessScope = it) }
            ?: SessionExposure.fromCompatibility(
                locked.state,
                command.visibility.name,
                command.visibility.name,
                command.visibility == SessionRecordVisibility.PUBLIC,
            )

    fun compatibility(
        exposure: SessionExposure,
        state: String,
    ): CompatibilityExposure =
        runCatching { exposure.toCompatibility(state) }
            .getOrElse { throw InvalidSessionExposureException() }

    fun openDecision(state: String): HostSessionTransitionDecision =
        when (state) {
            "OPEN" -> HostSessionTransitionDecision.UNCHANGED
            "DRAFT" -> HostSessionTransitionDecision.CHANGED
            else -> throw HostSessionOpenNotAllowedException()
        }

    fun closeDecision(state: String): HostSessionTransitionDecision =
        if (state == "CLOSED") {
            HostSessionTransitionDecision.UNCHANGED
        } else {
            throw HostSessionCloseNotAllowedException()
        }

    fun publishDecision(state: String): HostSessionTransitionDecision =
        if (state == "PUBLISHED") {
            HostSessionTransitionDecision.UNCHANGED
        } else {
            throw HostSessionPublishNotAllowedException()
        }
}

internal fun reopenDecision(state: String): HostSessionTransitionDecision =
    if (state == "OPEN") {
        HostSessionTransitionDecision.UNCHANGED
    } else {
        throw HostSessionReopenNotAllowedException()
    }

internal fun unpublishDecision(state: String): HostSessionTransitionDecision =
    if (state == "CLOSED") {
        HostSessionTransitionDecision.UNCHANGED
    } else {
        throw HostSessionUnpublishNotAllowedException()
    }

internal fun returnToDraftDecision(state: String): HostSessionTransitionDecision =
    if (state == "DRAFT") {
        HostSessionTransitionDecision.UNCHANGED
    } else {
        throw HostSessionReturnToDraftNotAllowedException()
    }

private fun parseTime(value: String): LocalTime = LocalTime.parse(value)

private fun deadlineOrDefault(
    value: String?,
    sessionDate: LocalDate,
): LocalDateTime =
    value
        ?.takeIf(String::isNotBlank)
        ?.let { OffsetDateTime.parse(it).withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime() }
        ?: sessionDate
            .minusDays(1)
            .atTime(DEFAULT_DEADLINE_HOUR, DEFAULT_DEADLINE_MINUTE)
            .atOffset(ZoneOffset.ofHours(SEOUL_OFFSET_HOURS))
            .withOffsetSameInstant(ZoneOffset.UTC)
            .toLocalDateTime()

private fun blankToNull(value: String?): String? = value?.trim()?.takeIf(String::isNotEmpty)

private fun locationOrDefault(value: String?): String = blankToNull(value) ?: "온라인"

internal enum class HostSessionTransitionDecision {
    CHANGED,
    UNCHANGED,
}

internal data class NormalizedHostSessionWrite(
    val sessionDate: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val questionDeadlineAt: LocalDateTime,
    val bookLink: String?,
    val bookImageUrl: String?,
    val locationLabel: String,
    val meetingUrl: String?,
    val meetingPasscode: String?,
)
