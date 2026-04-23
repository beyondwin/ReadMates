package com.readmates.archive.application

import com.readmates.archive.api.MyArchiveQuestionItem
import com.readmates.archive.api.MyArchiveReviewItem
import com.readmates.archive.api.MyPageResponse
import com.readmates.archive.api.MyRecentAttendanceItem
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.LocalDate

@Repository
class MyRecordsQueryRepository(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    fun findMyQuestions(currentMember: CurrentMember): List<MyArchiveQuestionItem> =
        jdbcTemplateProvider.ifAvailable?.query(
            """
            select sessions.id, sessions.number, sessions.book_title, sessions.session_date,
                   questions.priority, questions.text, questions.draft_thought
            from questions
            join sessions on sessions.id = questions.session_id
              and sessions.club_id = questions.club_id
            where questions.club_id = ?
              and questions.membership_id = ?
              and sessions.state = 'PUBLISHED'
            order by sessions.number desc, questions.priority
            """.trimIndent(),
            { resultSet, _ ->
                MyArchiveQuestionItem(
                    sessionId = resultSet.uuid("id").toString(),
                    sessionNumber = resultSet.getInt("number"),
                    bookTitle = resultSet.getString("book_title"),
                    date = resultSet.getObject("session_date", LocalDate::class.java).toString(),
                    priority = resultSet.getInt("priority"),
                    text = resultSet.getString("text"),
                    draftThought = resultSet.getString("draft_thought"),
                )
            },
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
        ) ?: emptyList()

    fun findMyReviews(currentMember: CurrentMember): List<MyArchiveReviewItem> =
        jdbcTemplateProvider.ifAvailable?.query(
            """
            select
              sessions.id as session_id,
              sessions.number as session_number,
              sessions.book_title as book_title,
              sessions.session_date as session_date,
              'LONG_REVIEW' as kind,
              long_reviews.body as text
            from long_reviews
            join sessions on sessions.id = long_reviews.session_id
              and sessions.club_id = long_reviews.club_id
            where long_reviews.club_id = ?
              and long_reviews.membership_id = ?
              and sessions.state = 'PUBLISHED'
            order by sessions.number desc, long_reviews.created_at desc
            """.trimIndent(),
            { resultSet, _ ->
                MyArchiveReviewItem(
                    sessionId = resultSet.uuid("session_id").toString(),
                    sessionNumber = resultSet.getInt("session_number"),
                    bookTitle = resultSet.getString("book_title"),
                    date = resultSet.getObject("session_date", LocalDate::class.java).toString(),
                    kind = resultSet.getString("kind"),
                    text = resultSet.getString("text"),
                )
            },
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
        ) ?: emptyList()

    fun findMyPage(currentMember: CurrentMember): MyPageResponse {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable
            ?: return MyPageResponse(
                displayName = currentMember.displayName,
                shortName = currentMember.shortName,
                email = currentMember.email,
                role = currentMember.role.name,
                membershipStatus = currentMember.membershipStatus.name,
                clubName = null,
                joinedAt = "",
                sessionCount = 0,
                totalSessionCount = 0,
                recentAttendances = emptyList(),
            )

        val recentAttendances = jdbcTemplate.query(
            """
            select session_number, attended
            from (
              select
                sessions.number as session_number,
                coalesce(session_participants.attendance_status = 'ATTENDED', false) as attended
              from sessions
              left join session_participants on session_participants.session_id = sessions.id
                and session_participants.club_id = sessions.club_id
                and session_participants.membership_id = ?
              where sessions.club_id = ?
                and sessions.state = 'PUBLISHED'
              order by sessions.number desc
              limit 6
            ) recent
            order by session_number asc
            """.trimIndent(),
            { resultSet, _ ->
                MyRecentAttendanceItem(
                    sessionNumber = resultSet.getInt("session_number"),
                    attended = resultSet.getBoolean("attended"),
                )
            },
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
        )

        return jdbcTemplate.query(
            """
            select
              clubs.name as club_name,
              coalesce(date_format(date_add(memberships.joined_at, interval 9 hour), '%Y-%m'), '') as joined_at,
              (
                select count(*)
                from session_participants
                join sessions on sessions.id = session_participants.session_id
                  and sessions.club_id = session_participants.club_id
                where session_participants.club_id = memberships.club_id
                  and session_participants.membership_id = memberships.id
                  and session_participants.attendance_status = 'ATTENDED'
                  and sessions.state = 'PUBLISHED'
              ) as session_count,
              (
                select count(*)
                from sessions
                where sessions.club_id = memberships.club_id
                  and sessions.state = 'PUBLISHED'
              ) as total_session_count
            from memberships
            join clubs on clubs.id = memberships.club_id
            where memberships.id = ?
              and memberships.club_id = ?
            """.trimIndent(),
            { resultSet, _ ->
                MyPageResponse(
                    displayName = currentMember.displayName,
                    shortName = currentMember.shortName,
                    email = currentMember.email,
                    role = currentMember.role.name,
                    membershipStatus = currentMember.membershipStatus.name,
                    clubName = resultSet.getString("club_name"),
                    joinedAt = resultSet.getString("joined_at"),
                    sessionCount = resultSet.getInt("session_count"),
                    totalSessionCount = resultSet.getInt("total_session_count"),
                    recentAttendances = recentAttendances,
                )
            },
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
        ).firstOrNull() ?: MyPageResponse(
            displayName = currentMember.displayName,
            shortName = currentMember.shortName,
            email = currentMember.email,
            role = currentMember.role.name,
            membershipStatus = currentMember.membershipStatus.name,
            clubName = null,
            joinedAt = "",
            sessionCount = 0,
            totalSessionCount = 0,
            recentAttendances = emptyList(),
        )
    }
}
