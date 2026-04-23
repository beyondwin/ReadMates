package com.readmates.session.application

import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

@Repository
class CurrentSessionRepository(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    fun findCurrentSession(member: CurrentMember): CurrentSessionPayload {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return CurrentSessionPayload(null)
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
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at
            from sessions
            where club_id = ?
              and state = 'OPEN'
            order by number desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toCurrentSessionDetail(member, jdbcTemplate) },
            member.clubId.dbString(),
        ).firstOrNull() ?: return CurrentSessionPayload(null)

        val sessionId = UUID.fromString(session.sessionId)
        return CurrentSessionPayload(
            currentSession = session.copy(attendees = findAttendees(jdbcTemplate, sessionId, member.clubId)),
        )
    }

    fun findOpenSessionId(clubId: UUID): UUID {
        val jdbcTemplate = jdbcTemplate()
        return jdbcTemplate.query(
            """
            select id
            from sessions
            where club_id = ?
              and state = 'OPEN'
            order by number desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            clubId.dbString(),
        ).firstOrNull() ?: throw CurrentSessionNotOpenException()
    }

    private fun findAttendees(jdbcTemplate: JdbcTemplate, sessionId: UUID, clubId: UUID): List<SessionAttendee> =
        jdbcTemplate.query(
            """
            select
              memberships.id as membership_id,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as display_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as short_name,
              memberships.role,
              session_participants.rsvp_status,
              session_participants.attendance_status
            from session_participants
            join memberships on memberships.id = session_participants.membership_id
            join users on users.id = memberships.user_id
            where session_participants.session_id = ?
              and session_participants.club_id = ?
              and session_participants.participation_status = 'ACTIVE'
            order by
              case when memberships.role = 'HOST' then 0 else 1 end,
              users.name
            """.trimIndent(),
            { resultSet, _ ->
                SessionAttendee(
                    membershipId = resultSet.uuid("membership_id").toString(),
                    displayName = resultSet.getString("display_name"),
                    shortName = resultSet.getString("short_name"),
                    role = resultSet.getString("role"),
                    rsvpStatus = resultSet.getString("rsvp_status"),
                    attendanceStatus = resultSet.getString("attendance_status"),
                )
            },
            sessionId.dbString(),
            clubId.dbString(),
        )

    private fun findMyCheckin(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        member: CurrentMember,
    ): CurrentSessionCheckin? =
        jdbcTemplate.query(
            """
            select reading_progress
            from reading_checkins
            where reading_checkins.session_id = ?
              and reading_checkins.club_id = ?
              and membership_id = ?
              and exists (
                select 1
                from session_participants
                where session_participants.session_id = reading_checkins.session_id
                  and session_participants.club_id = reading_checkins.club_id
                  and session_participants.membership_id = reading_checkins.membership_id
                  and session_participants.participation_status = 'ACTIVE'
              )
            """.trimIndent(),
            { resultSet, _ ->
                CurrentSessionCheckin(
                    readingProgress = resultSet.getInt("reading_progress"),
                )
            },
            sessionId.dbString(),
            member.clubId.dbString(),
            member.membershipId.dbString(),
        ).firstOrNull()

    private fun findQuestions(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        clubId: UUID,
        membershipId: UUID? = null,
    ): List<CurrentSessionQuestion> {
        val membershipFilter = if (membershipId == null) "" else "and questions.membership_id = ?"
        val args = mutableListOf<Any>(sessionId.dbString(), clubId.dbString())
        if (membershipId != null) {
            args.add(membershipId.dbString())
        }

        return jdbcTemplate.query(
            """
            select
              questions.priority,
              questions.text,
              questions.draft_thought,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name
            from questions
            join memberships on memberships.id = questions.membership_id
              and memberships.club_id = questions.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = questions.session_id
              and session_participants.club_id = questions.club_id
              and session_participants.membership_id = questions.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where questions.session_id = ?
              and questions.club_id = ?
              $membershipFilter
            order by questions.priority, questions.created_at, users.name
            """.trimIndent(),
            { resultSet, _ ->
                CurrentSessionQuestion(
                    priority = resultSet.getInt("priority"),
                    text = resultSet.getString("text"),
                    draftThought = resultSet.getString("draft_thought"),
                    authorName = resultSet.getString("author_name"),
                    authorShortName = resultSet.getString("author_short_name"),
                )
            },
            *args.toTypedArray(),
        )
    }

    private fun findMyOneLineReview(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        member: CurrentMember,
    ): CurrentSessionOneLineReview? =
        jdbcTemplate.query(
            """
            select text
            from one_line_reviews
            where one_line_reviews.session_id = ?
              and one_line_reviews.club_id = ?
              and membership_id = ?
              and exists (
                select 1
                from session_participants
                where session_participants.session_id = one_line_reviews.session_id
                  and session_participants.club_id = one_line_reviews.club_id
                  and session_participants.membership_id = one_line_reviews.membership_id
                  and session_participants.participation_status = 'ACTIVE'
              )
            """.trimIndent(),
            { resultSet, _ -> CurrentSessionOneLineReview(text = resultSet.getString("text")) },
            sessionId.dbString(),
            member.clubId.dbString(),
            member.membershipId.dbString(),
        ).firstOrNull()

    private fun findMyLongReview(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        member: CurrentMember,
    ): CurrentSessionLongReview? =
        jdbcTemplate.query(
            """
            select body
            from long_reviews
            where long_reviews.session_id = ?
              and long_reviews.club_id = ?
              and membership_id = ?
              and exists (
                select 1
                from session_participants
                where session_participants.session_id = long_reviews.session_id
                  and session_participants.club_id = long_reviews.club_id
                  and session_participants.membership_id = long_reviews.membership_id
                  and session_participants.participation_status = 'ACTIVE'
              )
            """.trimIndent(),
            { resultSet, _ -> CurrentSessionLongReview(body = resultSet.getString("body")) },
            sessionId.dbString(),
            member.clubId.dbString(),
            member.membershipId.dbString(),
        ).firstOrNull()

    private fun findBoardOneLineReviews(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        member: CurrentMember,
    ): List<BoardOneLineReview> =
        jdbcTemplate.query(
            """
            select
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name,
              one_line_reviews.text
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = one_line_reviews.session_id
              and session_participants.club_id = one_line_reviews.club_id
              and session_participants.membership_id = one_line_reviews.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where one_line_reviews.session_id = ?
              and one_line_reviews.club_id = ?
              and one_line_reviews.visibility in ('SESSION', 'PUBLIC')
              and exists (
                select 1
                from session_participants requester_participants
                where requester_participants.session_id = one_line_reviews.session_id
                  and requester_participants.club_id = one_line_reviews.club_id
                  and requester_participants.membership_id = ?
                  and requester_participants.participation_status = 'ACTIVE'
              )
            order by one_line_reviews.created_at, users.name
            """.trimIndent(),
            { resultSet, _ ->
                BoardOneLineReview(
                    authorName = resultSet.getString("author_name"),
                    authorShortName = resultSet.getString("author_short_name"),
                    text = resultSet.getString("text"),
                )
            },
            sessionId.dbString(),
            member.clubId.dbString(),
            member.membershipId.dbString(),
        )

    private fun findBoardLongReviews(
        jdbcTemplate: JdbcTemplate,
        sessionId: UUID,
        member: CurrentMember,
    ): List<BoardLongReview> =
        jdbcTemplate.query(
            """
            select
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name,
              long_reviews.body
            from long_reviews
            join memberships on memberships.id = long_reviews.membership_id
              and memberships.club_id = long_reviews.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = long_reviews.session_id
              and session_participants.club_id = long_reviews.club_id
              and session_participants.membership_id = long_reviews.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where long_reviews.session_id = ?
              and long_reviews.club_id = ?
              and exists (
                select 1
                from session_participants requester_participants
                where requester_participants.session_id = long_reviews.session_id
                  and requester_participants.club_id = long_reviews.club_id
                  and requester_participants.membership_id = ?
                  and requester_participants.participation_status = 'ACTIVE'
              )
            order by long_reviews.created_at, users.name
            """.trimIndent(),
            { resultSet, _ ->
                BoardLongReview(
                    authorName = resultSet.getString("author_name"),
                    authorShortName = resultSet.getString("author_short_name"),
                    body = resultSet.getString("body"),
                )
            },
            sessionId.dbString(),
            member.clubId.dbString(),
            member.membershipId.dbString(),
        )

    private fun findBoardHighlights(jdbcTemplate: JdbcTemplate, sessionId: UUID, clubId: UUID): List<BoardHighlight> =
        jdbcTemplate.query(
            """
            select highlights.text, highlights.sort_order
            from highlights
            left join session_participants on session_participants.session_id = highlights.session_id
              and session_participants.club_id = highlights.club_id
              and session_participants.membership_id = highlights.membership_id
            where highlights.session_id = ?
              and highlights.club_id = ?
              and (
                highlights.membership_id is null
                or session_participants.participation_status = 'ACTIVE'
              )
            order by highlights.sort_order, highlights.created_at
            """.trimIndent(),
            { resultSet, _ ->
                BoardHighlight(
                    text = resultSet.getString("text"),
                    sortOrder = resultSet.getInt("sort_order"),
                )
            },
            sessionId.dbString(),
            clubId.dbString(),
        )

    private fun ResultSet.toCurrentSessionDetail(member: CurrentMember, jdbcTemplate: JdbcTemplate): CurrentSessionDetail {
        val sessionId = uuid("id")
        val myRsvpStatus = jdbcTemplate.query(
            """
            select rsvp_status
            from session_participants
            where session_id = ?
              and membership_id = ?
              and club_id = ?
              and participation_status = 'ACTIVE'
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("rsvp_status") },
            sessionId.dbString(),
            member.membershipId.dbString(),
            member.clubId.dbString(),
        ).firstOrNull() ?: "NO_RESPONSE"

        return CurrentSessionDetail(
            sessionId = sessionId.toString(),
            sessionNumber = getInt("number"),
            title = getString("title"),
            bookTitle = getString("book_title"),
            bookAuthor = getString("book_author"),
            bookLink = getString("book_link"),
            bookImageUrl = getString("book_image_url"),
            date = getObject("session_date", LocalDate::class.java).toString(),
            startTime = getObject("start_time", LocalTime::class.java).toString(),
            endTime = getObject("end_time", LocalTime::class.java).toString(),
            locationLabel = getString("location_label"),
            meetingUrl = getString("meeting_url"),
            meetingPasscode = getString("meeting_passcode"),
            questionDeadlineAt = utcOffsetDateTime("question_deadline_at").toString(),
            myRsvpStatus = myRsvpStatus,
            attendees = emptyList(),
            myCheckin = findMyCheckin(jdbcTemplate, sessionId, member),
            myQuestions = findQuestions(jdbcTemplate, sessionId, member.clubId, member.membershipId),
            myOneLineReview = findMyOneLineReview(jdbcTemplate, sessionId, member),
            myLongReview = findMyLongReview(jdbcTemplate, sessionId, member),
            board = CurrentSessionBoard(
                questions = findQuestions(jdbcTemplate, sessionId, member.clubId),
                longReviews = findBoardLongReviews(jdbcTemplate, sessionId, member),
            ),
        )
    }

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateOrThrow(jdbcTemplateProvider)
}
