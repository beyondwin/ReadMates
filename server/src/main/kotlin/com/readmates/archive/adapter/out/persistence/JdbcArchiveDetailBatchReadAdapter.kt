package com.readmates.archive.adapter.out.persistence

import com.readmates.archive.application.model.ArchiveDetailFragments
import com.readmates.archive.application.model.MemberArchiveCheckinResult
import com.readmates.archive.application.model.MemberArchiveFeedbackDocumentStatusResult
import com.readmates.archive.application.model.MemberArchiveHighlightResult
import com.readmates.archive.application.model.MemberArchiveLongReviewResult
import com.readmates.archive.application.model.MemberArchiveOneLineReviewResult
import com.readmates.archive.application.model.MemberArchiveOneLinerResult
import com.readmates.archive.application.model.MemberArchiveQuestionResult
import com.readmates.archive.application.port.out.ArchiveDetailBatchReadPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcArchiveDetailBatchReadAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : ArchiveDetailBatchReadPort {
    override fun loadDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
        sessionNumber: Int,
        myAttendanceStatus: String?,
    ): ArchiveDetailFragments {
        val publicRows = loadPublicBatch(currentMember.clubId, sessionId)
        val personalRows = loadPersonalBatch(currentMember, sessionId)
        val feedbackDocument = loadFeedbackDocument(currentMember, sessionId, sessionNumber, myAttendanceStatus)

        val publicHighlights =
            publicRows
                .filter { it.section == "HIGHLIGHT" }
                .map { row ->
                    MemberArchiveHighlightResult(
                        text = row.text ?: "",
                        sortOrder = row.sortOrder ?: 0,
                        authorName = row.authorName,
                        authorShortName = row.authorShortName,
                    )
                }

        val clubQuestions =
            publicRows
                .filter { it.section == "CLUB_QUESTION" }
                .map { row ->
                    MemberArchiveQuestionResult(
                        priority = row.priority ?: 0,
                        text = row.text ?: "",
                        draftThought = row.draftThought,
                        authorName = row.authorName ?: "",
                        authorShortName = row.authorShortName ?: "",
                    )
                }

        val clubOneLiners =
            publicRows
                .filter { it.section == "CLUB_ONE_LINER" }
                .map { row ->
                    MemberArchiveOneLinerResult(
                        authorName = row.authorName ?: "",
                        authorShortName = row.authorShortName ?: "",
                        text = row.text ?: "",
                    )
                }

        val publicOneLiners =
            publicRows
                .filter { it.section == "PUBLIC_ONE_LINER" }
                .map { row ->
                    MemberArchiveOneLinerResult(
                        authorName = row.authorName ?: "",
                        authorShortName = row.authorShortName ?: "",
                        text = row.text ?: "",
                    )
                }

        val myQuestions =
            personalRows
                .filter { it.section == "MY_QUESTION" }
                .map { row ->
                    MemberArchiveQuestionResult(
                        priority = row.priority ?: 0,
                        text = row.text ?: "",
                        draftThought = row.draftThought,
                        authorName = row.authorName ?: "",
                        authorShortName = row.authorShortName ?: row.authorName ?: "",
                    )
                }

        val myCheckin =
            personalRows
                .firstOrNull { it.section == "MY_CHECKIN" }
                ?.readingProgress
                ?.let { MemberArchiveCheckinResult(readingProgress = it) }

        val myOneLineReview =
            personalRows
                .firstOrNull { it.section == "MY_ONE_LINE_REVIEW" }
                ?.text
                ?.let { MemberArchiveOneLineReviewResult(text = it) }

        val myLongReview =
            personalRows
                .firstOrNull { it.section == "MY_LONG_REVIEW" }
                ?.body
                ?.let { MemberArchiveLongReviewResult(body = it) }

        return ArchiveDetailFragments(
            publicHighlights = publicHighlights,
            clubQuestions = clubQuestions,
            clubOneLiners = clubOneLiners,
            publicOneLiners = publicOneLiners,
            myQuestions = myQuestions,
            myCheckin = myCheckin,
            myOneLineReview = myOneLineReview,
            myLongReview = myLongReview,
            feedbackDocument = feedbackDocument,
        )
    }

    private data class PublicBatchRow(
        val section: String,
        val sortOrder: Int?,
        val priority: Int?,
        val text: String?,
        val draftThought: String?,
        val authorName: String?,
        val authorShortName: String?,
    )

    private data class PersonalBatchRow(
        val section: String,
        val priority: Int?,
        val text: String?,
        val draftThought: String?,
        val readingProgress: Int?,
        val body: String?,
        val authorName: String?,
        val authorShortName: String?,
    )

    private fun loadPublicBatch(
        clubId: UUID,
        sessionId: UUID,
    ): List<PublicBatchRow> =
        jdbcTemplate.query(
            """
            select 'HIGHLIGHT' as section,
              highlights.sort_order,
              null as priority,
              highlights.text,
              null as draft_thought,
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

            UNION ALL

            select 'CLUB_QUESTION' as section,
              null as sort_order,
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

            UNION ALL

            select 'CLUB_ONE_LINER' as section,
              null as sort_order,
              null as priority,
              one_line_reviews.text,
              null as draft_thought,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
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

            UNION ALL

            select 'PUBLIC_ONE_LINER' as section,
              null as sort_order,
              null as priority,
              one_line_reviews.text,
              null as draft_thought,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name
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
            """.trimIndent(),
            { rs, _ ->
                PublicBatchRow(
                    section = rs.getString("section"),
                    sortOrder = rs.getObject("sort_order") as Int?,
                    priority = rs.getObject("priority") as Int?,
                    text = rs.getString("text"),
                    draftThought = rs.getString("draft_thought"),
                    authorName = rs.getString("author_name"),
                    authorShortName = rs.getString("author_short_name"),
                )
            },
            clubId.dbString(),
            sessionId.dbString(),
            clubId.dbString(),
            sessionId.dbString(),
            clubId.dbString(),
            sessionId.dbString(),
            clubId.dbString(),
            sessionId.dbString(),
        )

    private fun loadPersonalBatch(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): List<PersonalBatchRow> =
        jdbcTemplate.query(
            """
            select 'MY_QUESTION' as section,
              questions.priority,
              questions.text,
              questions.draft_thought,
              null as reading_progress,
              null as body,
              coalesce(memberships.short_name, users.name) as author_name,
              CASE WHEN memberships.status = 'LEFT' THEN '탈퇴한 멤버' ELSE coalesce(memberships.short_name, users.name) END as author_short_name
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

            UNION ALL

            select 'MY_CHECKIN' as section,
              null as priority,
              null as text,
              null as draft_thought,
              reading_checkins.reading_progress,
              null as body,
              null as author_name,
              null as author_short_name
            from reading_checkins
            join session_participants on session_participants.session_id = reading_checkins.session_id
              and session_participants.club_id = reading_checkins.club_id
              and session_participants.membership_id = reading_checkins.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where reading_checkins.club_id = ?
              and reading_checkins.session_id = ?
              and reading_checkins.membership_id = ?

            UNION ALL

            select 'MY_ONE_LINE_REVIEW' as section,
              null as priority,
              one_line_reviews.text,
              null as draft_thought,
              null as reading_progress,
              null as body,
              coalesce(memberships.short_name, users.name) as author_name,
              CASE WHEN memberships.status = 'LEFT' THEN '탈퇴한 멤버' ELSE coalesce(memberships.short_name, users.name) END as author_short_name
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            where one_line_reviews.club_id = ?
              and one_line_reviews.session_id = ?
              and one_line_reviews.membership_id = ?
              and exists (
                select 1
                from session_participants
                where session_participants.session_id = one_line_reviews.session_id
                  and session_participants.club_id = one_line_reviews.club_id
                  and session_participants.membership_id = one_line_reviews.membership_id
                  and session_participants.participation_status = 'ACTIVE'
              )

            UNION ALL

            select 'MY_LONG_REVIEW' as section,
              null as priority,
              null as text,
              null as draft_thought,
              null as reading_progress,
              long_reviews.body,
              null as author_name,
              null as author_short_name
            from long_reviews
            where long_reviews.club_id = ?
              and long_reviews.session_id = ?
              and long_reviews.membership_id = ?
              and exists (
                select 1
                from session_participants
                where session_participants.session_id = long_reviews.session_id
                  and session_participants.club_id = long_reviews.club_id
                  and session_participants.membership_id = long_reviews.membership_id
                  and session_participants.participation_status = 'ACTIVE'
              )
            """.trimIndent(),
            { rs, _ ->
                PersonalBatchRow(
                    section = rs.getString("section"),
                    priority = rs.getObject("priority") as Int?,
                    text = rs.getString("text"),
                    draftThought = rs.getString("draft_thought"),
                    readingProgress = rs.getObject("reading_progress") as Int?,
                    body = rs.getString("body"),
                    authorName = rs.getString("author_name"),
                    authorShortName = rs.getString("author_short_name"),
                )
            },
            currentMember.clubId.dbString(),
            sessionId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            sessionId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            sessionId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            sessionId.dbString(),
            currentMember.membershipId.dbString(),
        )

    private fun loadFeedbackDocument(
        currentMember: CurrentMember,
        sessionId: UUID,
        sessionNumber: Int,
        myAttendanceStatus: String?,
    ): MemberArchiveFeedbackDocumentStatusResult {
        val uploadedAt =
            jdbcTemplate
                .query(
                    """
                    select created_at
                    from session_feedback_documents
                    where club_id = ?
                      and session_id = ?
                    order by version desc, created_at desc
                    limit 1
                    """.trimIndent(),
                    { rs, _ -> rs.utcOffsetDateTime("created_at").toString() },
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
}
