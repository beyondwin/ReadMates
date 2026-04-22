package com.readmates.archive.application

import com.readmates.archive.api.ArchiveSessionItem
import com.readmates.archive.api.MemberArchiveCheckinItem
import com.readmates.archive.api.MemberArchiveFeedbackDocumentStatus
import com.readmates.archive.api.MemberArchiveHighlightItem
import com.readmates.archive.api.MemberArchiveLongReview
import com.readmates.archive.api.MemberArchiveOneLineReview
import com.readmates.archive.api.MemberArchiveOneLinerItem
import com.readmates.archive.api.MemberArchiveQuestionItem
import com.readmates.archive.api.MemberArchiveSessionDetailResponse
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.LocalDate
import java.util.UUID

@Repository
class ArchiveSessionQueryRepository(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    fun findArchiveSessions(clubId: UUID): List<ArchiveSessionItem> {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return emptyList()

        return jdbcTemplate.query(
            """
            select
              sessions.id,
              sessions.number,
              sessions.title,
              sessions.book_title,
              sessions.book_author,
              sessions.book_image_url,
              sessions.session_date,
              sum(case when session_participants.attendance_status = 'ATTENDED' then 1 else 0 end) as attendance,
              count(session_participants.id) as total,
              coalesce(public_session_publications.is_public, false) as published
            from sessions
            left join session_participants on session_participants.session_id = sessions.id
              and session_participants.club_id = sessions.club_id
            left join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.club_id = ?
              and sessions.state = 'PUBLISHED'
            group by
              sessions.id,
              sessions.number,
              sessions.title,
              sessions.book_title,
              sessions.book_author,
              sessions.book_image_url,
              sessions.session_date,
              public_session_publications.is_public
            order by sessions.number desc
            """.trimIndent(),
            { resultSet, _ -> resultSet.toArchiveSessionItem() },
            clubId.dbString(),
        )
    }

    fun findArchiveSessionDetail(currentMember: CurrentMember, sessionId: UUID): MemberArchiveSessionDetailResponse? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null

        return jdbcTemplate.query(
            """
            select
              sessions.id,
              sessions.number,
              sessions.title,
              sessions.book_title,
              sessions.book_author,
              sessions.book_image_url,
              sessions.session_date,
              sessions.location_label,
              (
                select count(*)
                from session_participants
                where session_participants.session_id = sessions.id
                  and session_participants.club_id = sessions.club_id
                  and session_participants.attendance_status = 'ATTENDED'
              ) as attendance,
              (
                select count(*)
                from session_participants
                where session_participants.session_id = sessions.id
                  and session_participants.club_id = sessions.club_id
              ) as total,
              current_participant.attendance_status as my_attendance_status,
              case
                when coalesce(public_session_publications.is_public, false)
                  then public_session_publications.public_summary
                else null
              end as public_summary
            from sessions
            left join session_participants current_participant on current_participant.session_id = sessions.id
              and current_participant.club_id = sessions.club_id
              and current_participant.membership_id = ?
            left join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.id = ?
              and sessions.club_id = ?
              and sessions.state = 'PUBLISHED'
            """.trimIndent(),
            { resultSet, _ ->
                val sessionUuid = resultSet.uuid("id")
                val sessionNumber = resultSet.getInt("number")
                val myAttendanceStatus = resultSet.getString("my_attendance_status")

                MemberArchiveSessionDetailResponse(
                    sessionId = sessionUuid.toString(),
                    sessionNumber = sessionNumber,
                    title = resultSet.getString("title"),
                    bookTitle = resultSet.getString("book_title"),
                    bookAuthor = resultSet.getString("book_author"),
                    bookImageUrl = resultSet.getString("book_image_url"),
                    date = resultSet.getObject("session_date", LocalDate::class.java).toString(),
                    locationLabel = resultSet.getString("location_label"),
                    attendance = resultSet.getInt("attendance"),
                    total = resultSet.getInt("total"),
                    myAttendanceStatus = myAttendanceStatus,
                    isHost = currentMember.isHost,
                    publicSummary = resultSet.getString("public_summary"),
                    publicHighlights = findArchiveHighlights(jdbcTemplate, currentMember.clubId, sessionUuid),
                    clubQuestions = findArchiveClubQuestions(jdbcTemplate, currentMember.clubId, sessionUuid),
                    clubCheckins = findArchiveClubCheckins(jdbcTemplate, currentMember.clubId, sessionUuid),
                    publicOneLiners = findArchivePublicOneLiners(jdbcTemplate, currentMember.clubId, sessionUuid),
                    myQuestions = findArchiveMyQuestions(jdbcTemplate, currentMember, sessionUuid),
                    myCheckin = findArchiveMyCheckin(jdbcTemplate, currentMember, sessionUuid),
                    myOneLineReview = findArchiveMyOneLineReview(jdbcTemplate, currentMember, sessionUuid),
                    myLongReview = findArchiveMyLongReview(jdbcTemplate, currentMember, sessionUuid),
                    feedbackDocument = findArchiveFeedbackDocumentStatus(
                        jdbcTemplate = jdbcTemplate,
                        currentMember = currentMember,
                        sessionId = sessionUuid,
                        sessionNumber = sessionNumber,
                        myAttendanceStatus = myAttendanceStatus,
                    ),
                )
            },
            currentMember.membershipId.dbString(),
            sessionId.dbString(),
            currentMember.clubId.dbString(),
        ).firstOrNull()
    }

    private fun findArchiveHighlights(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ): List<MemberArchiveHighlightItem> =
        jdbcTemplate.query(
            """
            select text, sort_order
            from highlights
            where club_id = ?
              and session_id = ?
            order by sort_order, created_at
            """.trimIndent(),
            { resultSet, _ ->
                MemberArchiveHighlightItem(
                    text = resultSet.getString("text"),
                    sortOrder = resultSet.getInt("sort_order"),
                )
            },
            clubId.dbString(),
            sessionId.dbString(),
        )

    private fun findArchiveClubQuestions(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ): List<MemberArchiveQuestionItem> =
        jdbcTemplate.query(
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
            where questions.club_id = ?
              and questions.session_id = ?
            order by questions.priority, users.name, questions.created_at
            """.trimIndent(),
            { resultSet, _ ->
                MemberArchiveQuestionItem(
                    priority = resultSet.getInt("priority"),
                    text = resultSet.getString("text"),
                    draftThought = resultSet.getString("draft_thought"),
                    authorName = resultSet.getString("author_name"),
                    authorShortName = resultSet.getString("author_short_name"),
                )
            },
            clubId.dbString(),
            sessionId.dbString(),
        )

    private fun findArchiveClubCheckins(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ): List<MemberArchiveCheckinItem> =
        jdbcTemplate.query(
            """
            select
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name,
              reading_checkins.reading_progress,
              reading_checkins.note
            from reading_checkins
            join memberships on memberships.id = reading_checkins.membership_id
              and memberships.club_id = reading_checkins.club_id
            join users on users.id = memberships.user_id
            where reading_checkins.club_id = ?
              and reading_checkins.session_id = ?
              and length(trim(reading_checkins.note)) > 0
            order by users.name, reading_checkins.created_at
            """.trimIndent(),
            { resultSet, _ ->
                MemberArchiveCheckinItem(
                    authorName = resultSet.getString("author_name"),
                    authorShortName = resultSet.getString("author_short_name"),
                    readingProgress = resultSet.getInt("reading_progress"),
                    note = resultSet.getString("note"),
                )
            },
            clubId.dbString(),
            sessionId.dbString(),
        )

    private fun findArchivePublicOneLiners(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ): List<MemberArchiveOneLinerItem> =
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
            where one_line_reviews.club_id = ?
              and one_line_reviews.session_id = ?
              and one_line_reviews.visibility = 'PUBLIC'
            order by one_line_reviews.created_at, users.name
            """.trimIndent(),
            { resultSet, _ ->
                MemberArchiveOneLinerItem(
                    authorName = resultSet.getString("author_name"),
                    authorShortName = resultSet.getString("author_short_name"),
                    text = resultSet.getString("text"),
                )
            },
            clubId.dbString(),
            sessionId.dbString(),
        )

    private fun findArchiveMyQuestions(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        sessionId: UUID,
    ): List<MemberArchiveQuestionItem> =
        jdbcTemplate.query(
            """
            select questions.priority, questions.text, questions.draft_thought, users.name as author_name
            from questions
            join memberships on memberships.id = questions.membership_id
              and memberships.club_id = questions.club_id
            join users on users.id = memberships.user_id
            where questions.club_id = ?
              and questions.session_id = ?
              and questions.membership_id = ?
            order by questions.priority
            """.trimIndent(),
            { resultSet, _ ->
                val authorName = resultSet.getString("author_name")
                MemberArchiveQuestionItem(
                    priority = resultSet.getInt("priority"),
                    text = resultSet.getString("text"),
                    draftThought = resultSet.getString("draft_thought"),
                    authorName = authorName,
                    authorShortName = shortNameFor(authorName),
                )
            },
            currentMember.clubId.dbString(),
            sessionId.dbString(),
            currentMember.membershipId.dbString(),
        )

    private fun findArchiveMyCheckin(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveCheckinItem? =
        jdbcTemplate.query(
            """
            select users.name as author_name, reading_checkins.reading_progress, reading_checkins.note
            from reading_checkins
            join memberships on memberships.id = reading_checkins.membership_id
              and memberships.club_id = reading_checkins.club_id
            join users on users.id = memberships.user_id
            where reading_checkins.club_id = ?
              and reading_checkins.session_id = ?
              and reading_checkins.membership_id = ?
            """.trimIndent(),
            { resultSet, _ ->
                val authorName = resultSet.getString("author_name")
                MemberArchiveCheckinItem(
                    authorName = authorName,
                    authorShortName = shortNameFor(authorName),
                    readingProgress = resultSet.getInt("reading_progress"),
                    note = resultSet.getString("note"),
                )
            },
            currentMember.clubId.dbString(),
            sessionId.dbString(),
            currentMember.membershipId.dbString(),
        ).firstOrNull()

    private fun findArchiveMyOneLineReview(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveOneLineReview? =
        jdbcTemplate.query(
            """
            select text
            from one_line_reviews
            where club_id = ?
              and session_id = ?
              and membership_id = ?
            """.trimIndent(),
            { resultSet, _ -> MemberArchiveOneLineReview(text = resultSet.getString("text")) },
            currentMember.clubId.dbString(),
            sessionId.dbString(),
            currentMember.membershipId.dbString(),
        ).firstOrNull()

    private fun findArchiveMyLongReview(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveLongReview? =
        jdbcTemplate.query(
            """
            select body
            from long_reviews
            where club_id = ?
              and session_id = ?
              and membership_id = ?
            """.trimIndent(),
            { resultSet, _ -> MemberArchiveLongReview(body = resultSet.getString("body")) },
            currentMember.clubId.dbString(),
            sessionId.dbString(),
            currentMember.membershipId.dbString(),
        ).firstOrNull()

    private fun findArchiveFeedbackDocumentStatus(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        sessionId: UUID,
        sessionNumber: Int,
        myAttendanceStatus: String?,
    ): MemberArchiveFeedbackDocumentStatus {
        val uploadedAt = jdbcTemplate.query(
            """
            select created_at
            from session_feedback_documents
            where club_id = ?
              and session_id = ?
            order by version desc, created_at desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.utcOffsetDateTime("created_at").toString() },
            currentMember.clubId.dbString(),
            sessionId.dbString(),
        ).firstOrNull()

        if (uploadedAt == null) {
            return MemberArchiveFeedbackDocumentStatus(
                available = false,
                readable = false,
                lockedReason = "NOT_AVAILABLE",
                title = null,
                uploadedAt = null,
            )
        }

        val readable = currentMember.isHost || myAttendanceStatus == "ATTENDED"
        return MemberArchiveFeedbackDocumentStatus(
            available = true,
            readable = readable,
            lockedReason = if (readable) null else "NOT_ATTENDED",
            title = "독서모임 ${sessionNumber}차 피드백",
            uploadedAt = uploadedAt,
        )
    }

    private fun ResultSet.toArchiveSessionItem(): ArchiveSessionItem =
        ArchiveSessionItem(
            sessionId = uuid("id").toString(),
            sessionNumber = getInt("number"),
            title = getString("title"),
            bookTitle = getString("book_title"),
            bookAuthor = getString("book_author"),
            bookImageUrl = getString("book_image_url"),
            date = getObject("session_date", LocalDate::class.java).toString(),
            attendance = getInt("attendance"),
            total = getInt("total"),
            published = getBoolean("published"),
        )

}
