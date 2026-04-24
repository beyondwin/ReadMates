package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.HostSessionAttendee
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionFeedbackDocument
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionParticipantNotFoundException
import com.readmates.session.application.HostSessionPublication
import com.readmates.session.application.InvalidMembershipIdException
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.requireHost
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostDashboardMissingMemberResult
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.out.HostSessionWritePort
import com.readmates.session.domain.SessionParticipationStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.toUtcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private data class HostDashboardOpenMetrics(
    val rsvpPending: Int,
    val checkinMissing: Int,
)

private data class ExistingHostSessionSchedule(
    val startTime: LocalTime,
    val endTime: LocalTime,
    val questionDeadlineAt: LocalDateTime,
)

private const val DEFAULT_START_TIME = "20:00"
private const val DEFAULT_END_TIME = "22:00"

@Repository
class JdbcHostSessionWriteAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
    private val deletionQueries: HostSessionDeletionQueries,
) : HostSessionWritePort {
    @Transactional
    override fun create(command: HostSessionCommand) =
        createOpenSession(command.host, command)

    override fun detail(command: HostSessionIdCommand) =
        findHostSession(command.host, command.sessionId)

    @Transactional
    override fun update(command: UpdateHostSessionCommand) =
        updateHostSession(command.host, command.sessionId, command.session)

    override fun deletionPreview(command: HostSessionIdCommand) =
        deletionQueries.previewOpenSessionDeletion(command.host, command.sessionId)

    @Transactional
    override fun delete(command: HostSessionIdCommand) =
        deletionQueries.deleteOpenHostSession(command.host, command.sessionId)

    @Transactional
    override fun confirmAttendance(command: ConfirmAttendanceCommand) =
        confirmHostAttendance(command)

    @Transactional
    override fun upsertPublication(command: UpsertPublicationCommand) =
        upsertHostPublication(command)

    override fun dashboard(host: CurrentMember) =
        hostDashboard(host)

    @Transactional
    fun createOpenSession(host: CurrentMember, request: HostSessionCommand): CreatedSessionResponse {
        requireHost(host)

        val jdbcTemplate = jdbcTemplate()
        val sessionId = UUID.randomUUID()
        val sessionDate = LocalDate.parse(request.date)
        val startTime = parseSessionTime(request.startTime ?: DEFAULT_START_TIME)
        val endTime = parseSessionTime(request.endTime ?: DEFAULT_END_TIME)
        val questionDeadlineAt = deadlineOrDefault(request, sessionDate)
        val bookLink = blankToNull(request.bookLink)
        val bookImageUrl = blankToNull(request.bookImageUrl)
        val locationLabel = locationLabelOrDefault(request.locationLabel)
        val meetingUrl = blankToNull(request.meetingUrl)
        val meetingPasscode = blankToNull(request.meetingPasscode)
        jdbcTemplate.queryForObject(
            "select id from clubs where id = ? for update",
            String::class.java,
            host.clubId.dbString(),
        )

        val openSessionCount = jdbcTemplate.queryForObject(
            """
            select count(*)
            from sessions
            where club_id = ?
              and state = 'OPEN'
            """.trimIndent(),
            Int::class.java,
            host.clubId.dbString(),
        ) ?: 0
        if (openSessionCount > 0) {
            throw OpenSessionAlreadyExistsException()
        }

        val nextNumber = jdbcTemplate.queryForObject(
            """
            select coalesce(max(number), 0) + 1
            from sessions
            where club_id = ?
            """.trimIndent(),
            Int::class.java,
            host.clubId.dbString(),
        ) ?: 1
        val state = "OPEN"

        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state
            )
            values (?, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            sessionId.dbString(),
            host.clubId.dbString(),
            nextNumber,
            request.title,
            request.bookTitle,
            request.bookAuthor,
            bookLink,
            bookImageUrl,
            sessionDate,
            startTime,
            endTime,
            locationLabel,
            meetingUrl,
            meetingPasscode,
            questionDeadlineAt,
            state,
        )

        val activeMembershipIds = jdbcTemplate.query(
            """
            select id
            from memberships
            where club_id = ?
              and status = 'ACTIVE'
            order by joined_at is null, joined_at, created_at
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            host.clubId.dbString(),
        )
        activeMembershipIds.forEach { membershipId ->
            jdbcTemplate.update(
                """
                insert into session_participants (
                  id,
                  club_id,
                  session_id,
                  membership_id,
                  rsvp_status,
                  attendance_status,
                  participation_status
                )
                values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE')
                on duplicate key update
                  rsvp_status = values(rsvp_status),
                  attendance_status = values(attendance_status),
                  participation_status = values(participation_status),
                  updated_at = utc_timestamp(6)
                """.trimIndent(),
                UUID.randomUUID().dbString(),
                host.clubId.dbString(),
                sessionId.dbString(),
                membershipId.dbString(),
            )
        }

        return CreatedSessionResponse(
            sessionId = sessionId.toString(),
            sessionNumber = nextNumber,
            title = request.title,
            bookTitle = request.bookTitle,
            bookAuthor = request.bookAuthor,
            bookLink = bookLink,
            bookImageUrl = bookImageUrl,
            date = sessionDate.toString(),
            startTime = startTime.toString(),
            endTime = endTime.toString(),
            questionDeadlineAt = questionDeadlineAt.toUtcOffsetDateTime().toString(),
            locationLabel = locationLabel,
            meetingUrl = meetingUrl,
            meetingPasscode = meetingPasscode,
            state = state,
        )
    }

    fun hostDashboard(member: CurrentMember): HostDashboardResult {
        requireHost(member)
        val jdbcTemplate = jdbcTemplate()
        val currentMetrics = jdbcTemplate.queryForObject(
            """
            select
              coalesce(sum(case when session_participants.rsvp_status = 'NO_RESPONSE' then 1 else 0 end), 0) as rsvp_pending,
              coalesce(sum(case
                when session_participants.rsvp_status = 'GOING'
                  and reading_checkins.id is null
                then 1 else 0
              end), 0) as checkin_missing
            from sessions
            join session_participants on session_participants.session_id = sessions.id
              and session_participants.club_id = sessions.club_id
            left join reading_checkins on reading_checkins.session_id = sessions.id
              and reading_checkins.club_id = sessions.club_id
              and reading_checkins.membership_id = session_participants.membership_id
            where sessions.club_id = ?
              and sessions.state = 'OPEN'
              and session_participants.participation_status = 'ACTIVE'
            """.trimIndent(),
            { resultSet, _ ->
                HostDashboardOpenMetrics(
                    rsvpPending = resultSet.getInt("rsvp_pending"),
                    checkinMissing = resultSet.getInt("checkin_missing"),
                )
            },
            member.clubId.dbString(),
        ) ?: HostDashboardOpenMetrics(rsvpPending = 0, checkinMissing = 0)

        val publishPending = jdbcTemplate.queryForObject(
            """
            select count(*)
            from sessions
            left join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.club_id = ?
              and sessions.state in ('CLOSED', 'PUBLISHED')
              and public_session_publications.session_id is null
            """.trimIndent(),
            Int::class.java,
            member.clubId.dbString(),
        ) ?: 0

        val feedbackPending = jdbcTemplate.queryForObject(
            """
            select count(*)
            from sessions
            where sessions.club_id = ?
              and sessions.state in ('PUBLISHED', 'CLOSED')
              and exists (
                select 1
                from session_participants
                where session_participants.club_id = sessions.club_id
                  and session_participants.session_id = sessions.id
                  and session_participants.attendance_status = 'ATTENDED'
                  and session_participants.participation_status = 'ACTIVE'
              )
              and not exists (
                select 1
                from session_feedback_documents
                where session_feedback_documents.club_id = sessions.club_id
                  and session_feedback_documents.session_id = sessions.id
              )
            """.trimIndent(),
            Int::class.java,
            member.clubId.dbString(),
        ) ?: 0
        val currentSessionMissingMembers = findCurrentSessionMissingMembers(jdbcTemplate, member)

        return HostDashboardResult(
            rsvpPending = currentMetrics.rsvpPending,
            checkinMissing = currentMetrics.checkinMissing,
            publishPending = publishPending,
            feedbackPending = feedbackPending,
            currentSessionMissingMemberCount = currentSessionMissingMembers.size,
            currentSessionMissingMembers = currentSessionMissingMembers,
        )
    }

    private fun findCurrentSessionMissingMembers(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
    ): List<HostDashboardMissingMemberResult> {
        return jdbcTemplate.query(
            """
            select
              memberships.id as membership_id,
              users.name as display_name,
              users.email as email
            from (
              select id, club_id
              from sessions
              where club_id = ?
                and state = 'OPEN'
              order by session_date desc, number desc
              limit 1
            ) open_session
            join memberships on memberships.club_id = open_session.club_id
              and memberships.status = 'ACTIVE'
            join users on users.id = memberships.user_id
            where not exists (
              select 1
              from session_participants
              where session_participants.club_id = open_session.club_id
                and session_participants.session_id = open_session.id
                and session_participants.membership_id = memberships.id
            )
            order by memberships.joined_at is null, memberships.joined_at, memberships.created_at, memberships.id
            """.trimIndent(),
            { resultSet, _ ->
                HostDashboardMissingMemberResult(
                    membershipId = resultSet.uuid("membership_id").toString(),
                    displayName = resultSet.getString("display_name"),
                    email = resultSet.getString("email"),
                )
            },
            member.clubId.dbString(),
        )
    }

    fun findHostSession(member: CurrentMember, sessionId: UUID): HostSessionDetailResponse {
        requireHost(member)
        val jdbcTemplate = jdbcTemplate()
        val session = jdbcTemplate.query(
            """
            select
              id,
              number,
              title,
              book_title,
              book_author,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              question_deadline_at,
              location_label,
              meeting_url,
              meeting_passcode,
              state
            from sessions
            where id = ?
              and club_id = ?
            """.trimIndent(),
            { resultSet, _ ->
                HostSessionDetailResponse(
                    sessionId = resultSet.uuid("id").toString(),
                    sessionNumber = resultSet.getInt("number"),
                    title = resultSet.getString("title"),
                    bookTitle = resultSet.getString("book_title"),
                    bookAuthor = resultSet.getString("book_author"),
                    bookLink = resultSet.getString("book_link"),
                    bookImageUrl = resultSet.getString("book_image_url"),
                    date = resultSet.getObject("session_date", LocalDate::class.java).toString(),
                    startTime = resultSet.getObject("start_time", LocalTime::class.java).toString(),
                    endTime = resultSet.getObject("end_time", LocalTime::class.java).toString(),
                    questionDeadlineAt = resultSet.utcOffsetDateTime("question_deadline_at").toString(),
                    locationLabel = resultSet.getString("location_label"),
                    meetingUrl = resultSet.getString("meeting_url"),
                    meetingPasscode = resultSet.getString("meeting_passcode"),
                    publication = null,
                    state = resultSet.getString("state"),
                    attendees = emptyList(),
                    feedbackDocument = HostSessionFeedbackDocument(
                        uploaded = false,
                        fileName = null,
                        uploadedAt = null,
                    ),
                )
            },
            sessionId.dbString(),
            member.clubId.dbString(),
        ).firstOrNull() ?: throw HostSessionNotFoundException()

        return session.copy(
            attendees = findHostSessionAttendees(jdbcTemplate, sessionId, member.clubId),
            feedbackDocument = findHostSessionFeedbackDocument(jdbcTemplate, sessionId, member.clubId),
            publication = findHostSessionPublication(jdbcTemplate, sessionId, member.clubId),
        )
    }

    @Transactional
    fun updateHostSession(
        member: CurrentMember,
        sessionId: UUID,
        request: HostSessionCommand,
    ): HostSessionDetailResponse {
        requireHost(member)
        val jdbcTemplate = jdbcTemplate()
        val sessionDate = LocalDate.parse(request.date)
        val existingSchedule = jdbcTemplate.query(
            """
            select start_time, end_time, question_deadline_at
            from sessions
            where id = ?
              and club_id = ?
            for update
            """.trimIndent(),
            { resultSet, _ ->
                ExistingHostSessionSchedule(
                    startTime = resultSet.getObject("start_time", LocalTime::class.java),
                    endTime = resultSet.getObject("end_time", LocalTime::class.java),
                    questionDeadlineAt = resultSet.getObject("question_deadline_at", LocalDateTime::class.java),
                )
            },
            sessionId.dbString(),
            member.clubId.dbString(),
        ).firstOrNull() ?: throw HostSessionNotFoundException()
        val startTime = request.startTime?.let { parseSessionTime(it) } ?: existingSchedule.startTime
        val endTime = request.endTime?.let { parseSessionTime(it) } ?: existingSchedule.endTime
        if (!endTime.isAfter(startTime)) {
            throw InvalidSessionScheduleException()
        }
        val questionDeadlineAt = when (request.questionDeadlineAt) {
            null -> existingSchedule.questionDeadlineAt
            else -> deadlineOrDefault(request, sessionDate)
        }
        val shouldUpdateBookLink = request.bookLink != null
        val shouldUpdateBookImageUrl = request.bookImageUrl != null
        val shouldUpdateLocationLabel = request.locationLabel != null
        val shouldUpdateMeetingUrl = request.meetingUrl != null
        val shouldUpdateMeetingPasscode = request.meetingPasscode != null
        val bookLink = request.bookLink?.let { blankToNull(it) }
        val bookImageUrl = request.bookImageUrl?.let { blankToNull(it) }
        val locationLabel = request.locationLabel?.let { locationLabelOrDefault(it) }
        val meetingUrl = request.meetingUrl?.let { blankToNull(it) }
        val meetingPasscode = request.meetingPasscode?.let { blankToNull(it) }
        val updated = jdbcTemplate.update(
            """
            update sessions
            set title = ?,
                book_title = ?,
                book_author = ?,
                book_link = case when ? then ? else book_link end,
                book_image_url = case when ? then ? else book_image_url end,
                session_date = ?,
                start_time = ?,
                end_time = ?,
                location_label = case when ? then ? else location_label end,
                meeting_url = case when ? then ? else meeting_url end,
                meeting_passcode = case when ? then ? else meeting_passcode end,
                question_deadline_at = ?,
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
            """.trimIndent(),
            request.title,
            request.bookTitle,
            request.bookAuthor,
            shouldUpdateBookLink,
            bookLink,
            shouldUpdateBookImageUrl,
            bookImageUrl,
            sessionDate,
            startTime,
            endTime,
            shouldUpdateLocationLabel,
            locationLabel,
            shouldUpdateMeetingUrl,
            meetingUrl,
            shouldUpdateMeetingPasscode,
            meetingPasscode,
            questionDeadlineAt,
            sessionId.dbString(),
            member.clubId.dbString(),
        )
        if (updated == 0) {
            throw HostSessionNotFoundException()
        }

        return findHostSession(member, sessionId)
    }

    @Transactional
    fun confirmHostAttendance(
        command: ConfirmAttendanceCommand,
    ): HostAttendanceResponse {
        requireHostSession(command.host, command.sessionId)
        val jdbcTemplate = jdbcTemplate()
        command.entries.forEach { entry: AttendanceEntryCommand ->
            val membershipId = parseMembershipId(entry.membershipId)
            val updated = jdbcTemplate.update(
                """
                update session_participants
                set attendance_status = ?,
                    updated_at = utc_timestamp(6)
                where session_id = ?
                  and club_id = ?
                  and membership_id = ?
                  and participation_status = 'ACTIVE'
                """.trimIndent(),
                entry.attendanceStatus,
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
                membershipId.dbString(),
            )
            if (updated == 0) {
                throw HostSessionParticipantNotFoundException()
            }
        }

        return HostAttendanceResponse(
            sessionId = command.sessionId.toString(),
            count = command.entries.size,
        )
    }

    @Transactional
    fun upsertHostPublication(
        command: UpsertPublicationCommand,
    ): HostPublicationResponse {
        requireHostSession(command.host, command.sessionId)
        val jdbcTemplate = jdbcTemplate()
        val isPublic = command.visibility == SessionRecordVisibility.PUBLIC
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id,
              club_id,
              session_id,
              public_summary,
              is_public,
              visibility,
              published_at
            )
            values (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              case when ? then utc_timestamp(6) else null end
            )
            on duplicate key update
              public_summary = values(public_summary),
              is_public = values(is_public),
              visibility = values(visibility),
              published_at = values(published_at),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            command.host.clubId.dbString(),
            command.sessionId.dbString(),
            command.publicSummary,
            isPublic,
            command.visibility.name,
            isPublic,
        )

        return HostPublicationResponse(
            sessionId = command.sessionId.toString(),
            publicSummary = command.publicSummary,
            visibility = command.visibility,
        )
    }

    private fun requireHostSession(member: CurrentMember, sessionId: UUID) {
        requireHost(member)
        val exists = jdbcTemplate().query(
            """
            select 1
            from sessions
            where id = ?
              and club_id = ?
            """.trimIndent(),
            { _, _ -> true },
            sessionId.dbString(),
            member.clubId.dbString(),
        ).firstOrNull() ?: false
        if (!exists) {
            throw HostSessionNotFoundException()
        }
    }

    private fun parseMembershipId(membershipId: String): UUID =
        runCatching { UUID.fromString(membershipId) }
            .getOrElse { throw InvalidMembershipIdException() }

    private fun parseSessionTime(value: String): LocalTime =
        LocalTime.parse(value)

    private fun deadlineOrDefault(request: HostSessionCommand, sessionDate: LocalDate) =
        request.questionDeadlineAt
            ?.takeIf { it.isNotBlank() }
            ?.let { OffsetDateTime.parse(it).toUtcLocalDateTime() }
            ?: sessionDate.minusDays(1).atTime(23, 59).atOffset(ZoneOffset.ofHours(9)).toUtcLocalDateTime()

    private fun findHostSessionAttendees(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        clubId: UUID,
    ): List<HostSessionAttendee> =
        jdbcTemplate.query(
            """
            select
              memberships.id as membership_id,
              coalesce(memberships.short_name, users.name) as display_name,
              users.name as account_name,
              session_participants.rsvp_status,
              session_participants.attendance_status,
              session_participants.participation_status
            from session_participants
            join memberships on memberships.id = session_participants.membership_id
              and memberships.club_id = session_participants.club_id
            join users on users.id = memberships.user_id
            where session_participants.session_id = ?
              and session_participants.club_id = ?
            order by
              case when memberships.role = 'HOST' then 0 else 1 end,
              users.name
            """.trimIndent(),
            { resultSet, _ ->
                HostSessionAttendee(
                    membershipId = resultSet.uuid("membership_id").toString(),
                    displayName = resultSet.getString("display_name"),
                    accountName = resultSet.getString("account_name"),
                    rsvpStatus = resultSet.getString("rsvp_status"),
                    attendanceStatus = resultSet.getString("attendance_status"),
                    participationStatus = SessionParticipationStatus.valueOf(resultSet.getString("participation_status")),
                )
            },
            sessionId.dbString(),
            clubId.dbString(),
        )

    private fun findHostSessionFeedbackDocument(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        clubId: UUID,
    ): HostSessionFeedbackDocument =
        jdbcTemplate.query(
            """
            select
              file_name,
              created_at
            from session_feedback_documents
            where session_id = ?
              and club_id = ?
            order by version desc, created_at desc
            limit 1
            """.trimIndent(),
            { resultSet, _ ->
                HostSessionFeedbackDocument(
                    uploaded = true,
                    fileName = resultSet.getString("file_name"),
                    uploadedAt = resultSet.utcOffsetDateTime("created_at").toString(),
                )
            },
            sessionId.dbString(),
            clubId.dbString(),
        ).firstOrNull() ?: HostSessionFeedbackDocument(
            uploaded = false,
            fileName = null,
            uploadedAt = null,
        )

    private fun findHostSessionPublication(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        clubId: UUID,
    ): HostSessionPublication? =
        jdbcTemplate.query(
            """
            select
              public_summary,
              visibility
            from public_session_publications
            where session_id = ?
              and club_id = ?
            limit 1
            """.trimIndent(),
            { resultSet, _ ->
                HostSessionPublication(
                    publicSummary = resultSet.getString("public_summary"),
                    visibility = SessionRecordVisibility.valueOf(resultSet.getString("visibility")),
                )
            },
            sessionId.dbString(),
            clubId.dbString(),
        ).firstOrNull()

    private fun blankToNull(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }

    private fun locationLabelOrDefault(value: String?): String = blankToNull(value) ?: "온라인"

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateOrThrow(jdbcTemplateProvider)
}
