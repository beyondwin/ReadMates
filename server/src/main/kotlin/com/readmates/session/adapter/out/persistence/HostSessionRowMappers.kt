package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionAttendee
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionFeedbackDocument
import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.HostSessionPublication
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.HostDashboardMissingMemberResult
import com.readmates.session.domain.SessionParticipationStatus
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import java.sql.ResultSet
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

internal data class HostDashboardOpenMetrics(
    val rsvpPending: Int,
    val checkinMissing: Int,
)

internal data class ExistingHostSessionSchedule(
    val startTime: LocalTime,
    val endTime: LocalTime,
    val questionDeadlineAt: LocalDateTime,
)

internal fun ResultSet.toHostDashboardOpenMetrics() =
    HostDashboardOpenMetrics(
        rsvpPending = getInt("rsvp_pending"),
        checkinMissing = getInt("checkin_missing"),
    )

internal fun ResultSet.toHostDashboardMissingMemberResult() =
    HostDashboardMissingMemberResult(
        membershipId = uuid("membership_id").toString(),
        displayName = getString("display_name"),
        email = getString("email"),
    )

internal fun ResultSet.toExistingHostSessionSchedule() =
    ExistingHostSessionSchedule(
        startTime = getObject("start_time", LocalTime::class.java),
        endTime = getObject("end_time", LocalTime::class.java),
        questionDeadlineAt = getObject("question_deadline_at", LocalDateTime::class.java),
    )

internal fun ResultSet.toHostSessionDetailBase() =
    HostSessionDetailResponse(
        sessionId = uuid("id").toString(),
        sessionNumber = getInt("number"),
        title = getString("title"),
        bookTitle = getString("book_title"),
        bookAuthor = getString("book_author"),
        bookLink = getString("book_link"),
        bookImageUrl = getString("book_image_url"),
        date = getObject("session_date", LocalDate::class.java).toString(),
        startTime = getObject("start_time", LocalTime::class.java).toString(),
        endTime = getObject("end_time", LocalTime::class.java).toString(),
        questionDeadlineAt = utcOffsetDateTime("question_deadline_at").toString(),
        locationLabel = getString("location_label"),
        meetingUrl = getString("meeting_url"),
        meetingPasscode = getString("meeting_passcode"),
        publication = null,
        state = getString("state"),
        visibility = SessionRecordVisibility.valueOf(getString("visibility")),
        attendees = emptyList(),
        feedbackDocument = HostSessionFeedbackDocument(
            uploaded = false,
            fileName = null,
            uploadedAt = null,
        ),
    )

internal fun ResultSet.toHostSessionAttendee() =
    HostSessionAttendee(
        membershipId = uuid("membership_id").toString(),
        displayName = getString("display_name"),
        accountName = getString("account_name"),
        rsvpStatus = getString("rsvp_status"),
        attendanceStatus = getString("attendance_status"),
        participationStatus = SessionParticipationStatus.valueOf(getString("participation_status")),
    )

internal fun ResultSet.toHostSessionFeedbackDocument() =
    HostSessionFeedbackDocument(
        uploaded = true,
        fileName = getString("file_name"),
        uploadedAt = utcOffsetDateTime("created_at").toString(),
    )

internal fun ResultSet.toHostSessionPublication() =
    HostSessionPublication(
        publicSummary = getString("public_summary"),
        visibility = SessionRecordVisibility.valueOf(getString("visibility")),
    )

internal fun ResultSet.toHostSessionListItem() =
    HostSessionListItem(
        sessionId = uuid("id").toString(),
        sessionNumber = getInt("number"),
        title = getString("title"),
        bookTitle = getString("book_title"),
        bookAuthor = getString("book_author"),
        bookImageUrl = getString("book_image_url"),
        date = getObject("session_date", LocalDate::class.java).toString(),
        startTime = getObject("start_time", LocalTime::class.java).toString(),
        endTime = getObject("end_time", LocalTime::class.java).toString(),
        locationLabel = getString("location_label"),
        state = getString("state"),
        visibility = SessionRecordVisibility.valueOf(getString("visibility")),
    )

internal fun ResultSet.toUpcomingSessionItem() =
    UpcomingSessionItem(
        sessionId = uuid("id").toString(),
        sessionNumber = getInt("number"),
        title = getString("title"),
        bookTitle = getString("book_title"),
        bookAuthor = getString("book_author"),
        bookImageUrl = getString("book_image_url"),
        date = getObject("session_date", LocalDate::class.java).toString(),
        startTime = getObject("start_time", LocalTime::class.java).toString(),
        endTime = getObject("end_time", LocalTime::class.java).toString(),
        locationLabel = getString("location_label"),
        visibility = SessionRecordVisibility.valueOf(getString("visibility")),
    )
