package com.readmates.browse.adapter.out.persistence

import com.readmates.browse.application.model.GuestAttendeeResult
import com.readmates.browse.application.model.GuestBrowseNavigationResult
import com.readmates.browse.application.model.GuestBrowseShellResult
import com.readmates.browse.application.model.GuestCurrentSessionResult
import com.readmates.browse.application.model.GuestLongReviewResult
import com.readmates.browse.application.model.GuestQuestionResult
import com.readmates.browse.application.model.GuestUpcomingSessionCursor
import com.readmates.browse.application.model.GuestUpcomingSessionResult
import com.readmates.browse.application.port.out.LoadGuestSessionBrowsePort
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

@Component
class JdbcGuestSessionBrowseAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadGuestSessionBrowsePort {
    override fun loadShell(clubSlug: String): GuestBrowseShellResult? =
        jdbcTemplate
            .query(
                """
                select clubs.name, clubs.tagline
                from clubs
                where clubs.slug = ?
                  and clubs.status = 'ACTIVE'
                  and clubs.public_visibility = 'PUBLIC'
                """.trimIndent(),
                { resultSet, _ ->
                    GuestBrowseShellResult(
                        clubName = resultSet.getString("name"),
                        tagline = resultSet.getString("tagline"),
                        navigation = GuestBrowseNavigationResult(),
                    )
                },
                clubSlug,
            ).singleOrNull()

    override fun loadCurrentSession(clubSlug: String): GuestCurrentSessionResult? {
        val session =
            jdbcTemplate
                .query(
                    SESSION_SELECT +
                        """
                        where clubs.slug = ?
                          and clubs.status = 'ACTIVE'
                          and clubs.public_visibility = 'PUBLIC'
                          and sessions.access_scope = 'GUEST_READABLE'
                          and sessions.state = 'OPEN'
                        order by sessions.number desc, sessions.id desc
                        limit 1
                        """.trimIndent(),
                    { resultSet, _ -> resultSet.toCurrentSession() },
                    clubSlug,
                ).singleOrNull()
                ?: return null
        return session.copy(
            attendees = loadAttendees(session.sessionId),
            questions = loadQuestions(session.sessionId),
            longReviews = loadLongReviews(session.sessionId),
        )
    }

    override fun loadUpcomingSessions(
        clubSlug: String,
        cursor: GuestUpcomingSessionCursor?,
        limit: Int,
    ): List<GuestUpcomingSessionResult> {
        val cursorClause =
            if (cursor == null) {
                ""
            } else {
                """
                and (
                  sessions.session_date > ?
                  or (sessions.session_date = ? and sessions.start_time > ?)
                  or (sessions.session_date = ? and sessions.start_time = ? and sessions.id > ?)
                )
                """.trimIndent()
            }
        val arguments =
            buildList<Any> {
                add(clubSlug)
                if (cursor != null) {
                    add(cursor.date)
                    add(cursor.date)
                    add(cursor.startTime)
                    add(cursor.date)
                    add(cursor.startTime)
                    add(cursor.sessionId)
                }
                add(limit)
            }.toTypedArray()
        return jdbcTemplate.query(
            SESSION_SELECT +
                """
                where clubs.slug = ?
                  and clubs.status = 'ACTIVE'
                  and clubs.public_visibility = 'PUBLIC'
                  and sessions.access_scope = 'GUEST_READABLE'
                  and sessions.state = 'DRAFT'
                $cursorClause
                order by sessions.session_date, sessions.start_time, sessions.id
                limit ?
                """.trimIndent(),
            { resultSet, _ -> resultSet.toUpcomingSession() },
            *arguments,
        )
    }

    private fun loadAttendees(sessionId: String): List<GuestAttendeeResult> =
        jdbcTemplate.query(
            """
            select
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as display_name,
              case when memberships.status = 'LEFT' then 'archive-box' else memberships.avatar_key end as avatar_key,
              session_participants.rsvp_status,
              session_participants.attendance_status
            from session_participants
            join memberships on memberships.id = session_participants.membership_id
              and memberships.club_id = session_participants.club_id
            where session_participants.session_id = ?
              and session_participants.participation_status = 'ACTIVE'
            order by display_name, memberships.avatar_key
            limit 100
            """.trimIndent(),
            { resultSet, _ ->
                GuestAttendeeResult(
                    displayName = resultSet.getString("display_name"),
                    avatarKey = resultSet.getString("avatar_key"),
                    rsvpStatus = resultSet.getString("rsvp_status"),
                    attendanceStatus = resultSet.getString("attendance_status"),
                )
            },
            sessionId,
        )

    private fun loadQuestions(sessionId: String): List<GuestQuestionResult> =
        jdbcTemplate.query(
            """
            select
              questions.priority,
              questions.text,
              questions.draft_thought,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_short_name,
              case when memberships.status = 'LEFT' then 'archive-box' else memberships.avatar_key end as avatar_key
            from questions
            join memberships on memberships.id = questions.membership_id
              and memberships.club_id = questions.club_id
            join session_participants on session_participants.session_id = questions.session_id
              and session_participants.club_id = questions.club_id
              and session_participants.membership_id = questions.membership_id
            where questions.session_id = ?
              and session_participants.participation_status = 'ACTIVE'
            order by questions.priority, questions.created_at
            limit 100
            """.trimIndent(),
            { resultSet, _ ->
                GuestQuestionResult(
                    priority = resultSet.getInt("priority"),
                    text = resultSet.getString("text"),
                    draftThought = resultSet.getString("draft_thought"),
                    authorName = resultSet.getString("author_name"),
                    authorShortName = resultSet.getString("author_short_name"),
                    avatarKey = resultSet.getString("avatar_key"),
                )
            },
            sessionId,
        )

    private fun loadLongReviews(sessionId: String): List<GuestLongReviewResult> =
        jdbcTemplate.query(
            """
            select
              long_reviews.body,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_short_name,
              case when memberships.status = 'LEFT' then 'archive-box' else memberships.avatar_key end as avatar_key
            from long_reviews
            join memberships on memberships.id = long_reviews.membership_id
              and memberships.club_id = long_reviews.club_id
            join session_participants on session_participants.session_id = long_reviews.session_id
              and session_participants.club_id = long_reviews.club_id
              and session_participants.membership_id = long_reviews.membership_id
            where long_reviews.session_id = ?
              and long_reviews.visibility = 'PUBLIC'
              and session_participants.participation_status = 'ACTIVE'
            order by long_reviews.created_at, author_name
            limit 100
            """.trimIndent(),
            { resultSet, _ ->
                val authorShortName = resultSet.getString("author_short_name")
                GuestLongReviewResult(
                    title = "${authorShortName}의 서평",
                    content = resultSet.getString("body"),
                    authorName = resultSet.getString("author_name"),
                    authorShortName = authorShortName,
                    avatarKey = resultSet.getString("avatar_key"),
                )
            },
            sessionId,
        )

    private fun java.sql.ResultSet.toCurrentSession() =
        GuestCurrentSessionResult(
            sessionId = getString("session_id"),
            sessionNumber = getInt("session_number"),
            title = getString("title"),
            bookTitle = getString("book_title"),
            bookAuthor = getString("book_author"),
            bookLink = getString("book_link"),
            bookImageUrl = getString("book_image_url"),
            date = getString("date"),
            startTime = getString("start_time"),
            endTime = getString("end_time"),
            questionDeadlineAt = getString("question_deadline_at"),
            attendees = emptyList(),
            questions = emptyList(),
            longReviews = emptyList(),
        )

    private fun java.sql.ResultSet.toUpcomingSession() =
        GuestUpcomingSessionResult(
            sessionId = getString("session_id"),
            sessionNumber = getInt("session_number"),
            title = getString("title"),
            bookTitle = getString("book_title"),
            bookAuthor = getString("book_author"),
            bookLink = getString("book_link"),
            bookImageUrl = getString("book_image_url"),
            date = getString("date"),
            startTime = getString("start_time"),
            endTime = getString("end_time"),
            questionDeadlineAt = getString("question_deadline_at"),
            state = getString("state"),
        )

    private companion object {
        val SESSION_SELECT =
            """
            select
              sessions.id as session_id,
              sessions.number as session_number,
              sessions.title,
              sessions.book_title,
              sessions.book_author,
              sessions.book_link,
              sessions.book_image_url,
              date_format(sessions.session_date, '%Y-%m-%d') as date,
              time_format(sessions.start_time, '%H:%i:%s') as start_time,
              time_format(sessions.end_time, '%H:%i:%s') as end_time,
              date_format(sessions.question_deadline_at, '%Y-%m-%dT%H:%i:%s') as question_deadline_at,
              sessions.state
            from sessions
            join clubs on clubs.id = sessions.club_id
            """.trimIndent() + "\n"
    }
}
