package com.readmates.archive.adapter.out.persistence

import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.model.MyPageResult
import com.readmates.archive.application.model.MyRecentAttendanceResult
import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MemberArchiveCheckinResult
import com.readmates.archive.application.model.MemberArchiveFeedbackDocumentStatusResult
import com.readmates.archive.application.model.MemberArchiveHighlightResult
import com.readmates.archive.application.model.MemberArchiveLongReviewResult
import com.readmates.archive.application.model.MemberArchiveOneLineReviewResult
import com.readmates.archive.application.model.MemberArchiveOneLinerResult
import com.readmates.archive.application.model.MemberArchiveQuestionResult
import com.readmates.archive.application.model.MemberArchiveSessionDetailResult
import com.readmates.archive.application.port.out.LoadArchiveDataPort
import com.readmates.archive.application.shortNameFor
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.LocalDate
import java.util.UUID

@Repository
class JdbcArchiveQueryAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : LoadArchiveDataPort {
    override fun loadArchiveSessions(currentMember: CurrentMember): List<ArchiveSessionResult> {
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
              sessions.state,
              current_participant.attendance_status as my_attendance_status,
              sum(case when session_participants.attendance_status = 'ATTENDED' then 1 else 0 end) as attendance,
              count(session_participants.id) as total,
              coalesce(public_session_publications.visibility = 'PUBLIC', false) as published,
              latest_feedback_document.created_at as feedback_document_uploaded_at
            from sessions
            left join session_participants current_participant on current_participant.session_id = sessions.id
              and current_participant.club_id = sessions.club_id
              and current_participant.membership_id = ?
              and current_participant.participation_status = 'ACTIVE'
            left join session_participants on session_participants.session_id = sessions.id
              and session_participants.club_id = sessions.club_id
              and session_participants.participation_status = 'ACTIVE'
            left join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            left join (
              select session_id, club_id, created_at
              from (
                select
                  session_feedback_documents.session_id,
                  session_feedback_documents.club_id,
                  session_feedback_documents.created_at,
                  row_number() over (
                    partition by session_feedback_documents.session_id
                    order by session_feedback_documents.version desc, session_feedback_documents.created_at desc
                  ) as document_rank
                from session_feedback_documents
                where session_feedback_documents.club_id = ?
              ) ranked_feedback_documents
              where document_rank = 1
            ) latest_feedback_document on latest_feedback_document.session_id = sessions.id
              and latest_feedback_document.club_id = sessions.club_id
            where sessions.club_id = ?
              and sessions.state in ('CLOSED', 'PUBLISHED')
              and sessions.visibility in ('MEMBER', 'PUBLIC')
            group by
              sessions.id,
              sessions.number,
              sessions.title,
              sessions.book_title,
              sessions.book_author,
              sessions.book_image_url,
              sessions.session_date,
              sessions.state,
              current_participant.attendance_status,
              public_session_publications.visibility,
              latest_feedback_document.created_at
            order by sessions.number desc
            """.trimIndent(),
            { resultSet, _ -> resultSet.toArchiveSessionItem(currentMember) },
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            currentMember.clubId.dbString(),
        )
    }

    override fun loadArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveSessionDetailResult? {
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
              sessions.state,
              sessions.location_label,
              (
                select count(*)
                from session_participants
                where session_participants.session_id = sessions.id
                  and session_participants.club_id = sessions.club_id
                  and session_participants.attendance_status = 'ATTENDED'
                  and session_participants.participation_status = 'ACTIVE'
              ) as attendance,
              (
                select count(*)
                from session_participants
                where session_participants.session_id = sessions.id
                  and session_participants.club_id = sessions.club_id
                  and session_participants.participation_status = 'ACTIVE'
              ) as total,
              current_participant.attendance_status as my_attendance_status,
              case
                when public_session_publications.visibility in ('MEMBER', 'PUBLIC')
                  then public_session_publications.public_summary
                else null
              end as public_summary
            from sessions
            left join session_participants current_participant on current_participant.session_id = sessions.id
              and current_participant.club_id = sessions.club_id
              and current_participant.membership_id = ?
              and current_participant.participation_status = 'ACTIVE'
            left join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.id = ?
              and sessions.club_id = ?
              and sessions.state in ('CLOSED', 'PUBLISHED')
              and sessions.visibility in ('MEMBER', 'PUBLIC')
            """.trimIndent(),
            { resultSet, _ ->
                val sessionUuid = resultSet.uuid("id")
                val sessionNumber = resultSet.getInt("number")
                val myAttendanceStatus = resultSet.getString("my_attendance_status")

                MemberArchiveSessionDetailResult(
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
                    state = resultSet.getString("state"),
                    myAttendanceStatus = myAttendanceStatus,
                    isHost = currentMember.isHost,
                    publicSummary = resultSet.getString("public_summary"),
                    publicHighlights = findArchiveHighlights(jdbcTemplate, currentMember.clubId, sessionUuid),
                    clubQuestions = findArchiveClubQuestions(jdbcTemplate, currentMember.clubId, sessionUuid),
                    clubOneLiners = findArchiveClubOneLiners(jdbcTemplate, currentMember.clubId, sessionUuid),
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

    override fun loadMyQuestions(currentMember: CurrentMember): List<MyArchiveQuestionResult> =
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
                MyArchiveQuestionResult(
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

    override fun loadMyReviews(currentMember: CurrentMember): List<MyArchiveReviewResult> =
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
                MyArchiveReviewResult(
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

    override fun loadMyPage(currentMember: CurrentMember): MyPageResult {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable
            ?: return MyPageResult(
                displayName = currentMember.displayName,
                accountName = currentMember.accountName,
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
                MyRecentAttendanceResult(
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
                MyPageResult(
                    displayName = currentMember.displayName,
                    accountName = currentMember.accountName,
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
        ).firstOrNull() ?: MyPageResult(
            displayName = currentMember.displayName,
            accountName = currentMember.accountName,
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

    private fun findArchiveHighlights(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ): List<MemberArchiveHighlightResult> =
        jdbcTemplate.query(
            """
            select
              highlights.text,
              highlights.sort_order,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
            from highlights
            left join memberships on memberships.id = highlights.membership_id
              and memberships.club_id = highlights.club_id
            left join users on users.id = memberships.user_id
            left join session_participants on session_participants.session_id = highlights.session_id
              and session_participants.club_id = highlights.club_id
              and session_participants.membership_id = highlights.membership_id
            where highlights.club_id = ?
              and highlights.session_id = ?
              and (
                highlights.membership_id is null
                or session_participants.participation_status = 'ACTIVE'
              )
            order by highlights.sort_order, highlights.created_at
            """.trimIndent(),
            { resultSet, _ ->
                MemberArchiveHighlightResult(
                    text = resultSet.getString("text"),
                    sortOrder = resultSet.getInt("sort_order"),
                    authorName = resultSet.getString("author_name"),
                    authorShortName = resultSet.getString("author_short_name"),
                )
            },
            clubId.dbString(),
            sessionId.dbString(),
        )

    private fun findArchiveClubQuestions(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ): List<MemberArchiveQuestionResult> =
        jdbcTemplate.query(
            """
            select
              questions.priority,
              questions.text,
              questions.draft_thought,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
            from questions
            join memberships on memberships.id = questions.membership_id
              and memberships.club_id = questions.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = questions.session_id
              and session_participants.club_id = questions.club_id
              and session_participants.membership_id = questions.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where questions.club_id = ?
              and questions.session_id = ?
            order by questions.priority, author_name, questions.created_at
            """.trimIndent(),
            { resultSet, _ ->
                MemberArchiveQuestionResult(
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

    private fun findArchiveClubOneLiners(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ): List<MemberArchiveOneLinerResult> =
        jdbcTemplate.query(
            """
            select
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name,
              one_line_reviews.text
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = one_line_reviews.session_id
              and session_participants.club_id = one_line_reviews.club_id
              and session_participants.membership_id = one_line_reviews.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where one_line_reviews.club_id = ?
              and one_line_reviews.session_id = ?
              and one_line_reviews.visibility in ('SESSION', 'PUBLIC')
            order by one_line_reviews.created_at, author_name
            """.trimIndent(),
            { resultSet, _ ->
                MemberArchiveOneLinerResult(
                    authorName = resultSet.getString("author_name"),
                    authorShortName = resultSet.getString("author_short_name"),
                    text = resultSet.getString("text"),
                )
            },
            clubId.dbString(),
            sessionId.dbString(),
        )

    private fun findArchivePublicOneLiners(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ): List<MemberArchiveOneLinerResult> =
        jdbcTemplate.query(
            """
            select
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name,
              one_line_reviews.text
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = one_line_reviews.session_id
              and session_participants.club_id = one_line_reviews.club_id
              and session_participants.membership_id = one_line_reviews.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where one_line_reviews.club_id = ?
              and one_line_reviews.session_id = ?
              and one_line_reviews.visibility = 'PUBLIC'
            order by one_line_reviews.created_at, author_name
            """.trimIndent(),
            { resultSet, _ ->
                MemberArchiveOneLinerResult(
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
    ): List<MemberArchiveQuestionResult> =
        jdbcTemplate.query(
            """
            select
              questions.priority,
              questions.text,
              questions.draft_thought,
              coalesce(memberships.short_name, users.name) as author_name
            from questions
            join memberships on memberships.id = questions.membership_id
              and memberships.club_id = questions.club_id
            join users on users.id = memberships.user_id
            join session_participants on session_participants.session_id = questions.session_id
              and session_participants.club_id = questions.club_id
              and session_participants.membership_id = questions.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where questions.club_id = ?
              and questions.session_id = ?
              and questions.membership_id = ?
            order by questions.priority
            """.trimIndent(),
            { resultSet, _ ->
                val authorName = resultSet.getString("author_name")
                MemberArchiveQuestionResult(
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
    ): MemberArchiveCheckinResult? =
        jdbcTemplate.query(
            """
            select reading_checkins.reading_progress
            from reading_checkins
            join session_participants on session_participants.session_id = reading_checkins.session_id
              and session_participants.club_id = reading_checkins.club_id
              and session_participants.membership_id = reading_checkins.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where reading_checkins.club_id = ?
              and reading_checkins.session_id = ?
              and reading_checkins.membership_id = ?
            """.trimIndent(),
            { resultSet, _ ->
                MemberArchiveCheckinResult(
                    readingProgress = resultSet.getInt("reading_progress"),
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
    ): MemberArchiveOneLineReviewResult? =
        jdbcTemplate.query(
            """
            select text
            from one_line_reviews
            where club_id = ?
              and session_id = ?
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
            { resultSet, _ -> MemberArchiveOneLineReviewResult(text = resultSet.getString("text")) },
            currentMember.clubId.dbString(),
            sessionId.dbString(),
            currentMember.membershipId.dbString(),
        ).firstOrNull()

    private fun findArchiveMyLongReview(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveLongReviewResult? =
        jdbcTemplate.query(
            """
            select body
            from long_reviews
            where club_id = ?
              and session_id = ?
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
            { resultSet, _ -> MemberArchiveLongReviewResult(body = resultSet.getString("body")) },
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
    ): MemberArchiveFeedbackDocumentStatusResult {
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
            return MemberArchiveFeedbackDocumentStatusResult(
                available = false,
                readable = false,
                lockedReason = "NOT_AVAILABLE",
                title = null,
                uploadedAt = null,
            )
        }

        val readable = canReadArchiveFeedbackDocument(currentMember, myAttendanceStatus)
        return MemberArchiveFeedbackDocumentStatusResult(
            available = true,
            readable = readable,
            lockedReason = if (readable) null else "NOT_ATTENDED",
            title = "독서모임 ${sessionNumber}차 피드백",
            uploadedAt = uploadedAt,
        )
    }

    private fun canReadArchiveFeedbackDocument(currentMember: CurrentMember, myAttendanceStatus: String?): Boolean =
        currentMember.isHost || (currentMember.isActive && myAttendanceStatus == "ATTENDED")

    private fun ResultSet.toArchiveSessionItem(currentMember: CurrentMember): ArchiveSessionResult {
        val sessionNumber = getInt("number")
        val myAttendanceStatus = getString("my_attendance_status")
        val feedbackDocumentUploadedAt = utcOffsetDateTimeOrNull("feedback_document_uploaded_at")?.toString()
        val feedbackDocumentReadable = feedbackDocumentUploadedAt != null &&
            canReadArchiveFeedbackDocument(currentMember, myAttendanceStatus)

        return ArchiveSessionResult(
            sessionId = uuid("id").toString(),
            sessionNumber = sessionNumber,
            title = getString("title"),
            bookTitle = getString("book_title"),
            bookAuthor = getString("book_author"),
            bookImageUrl = getString("book_image_url"),
            date = getObject("session_date", LocalDate::class.java).toString(),
            attendance = getInt("attendance"),
            total = getInt("total"),
            published = getBoolean("published"),
            state = getString("state"),
            feedbackDocument = MemberArchiveFeedbackDocumentStatusResult(
                available = feedbackDocumentUploadedAt != null,
                readable = feedbackDocumentReadable,
                lockedReason = when {
                    feedbackDocumentUploadedAt == null -> "NOT_AVAILABLE"
                    feedbackDocumentReadable -> null
                    else -> "NOT_ATTENDED"
                },
                title = if (feedbackDocumentUploadedAt == null) null else "독서모임 ${sessionNumber}차 피드백",
                uploadedAt = feedbackDocumentUploadedAt,
            ),
        )
    }

}
