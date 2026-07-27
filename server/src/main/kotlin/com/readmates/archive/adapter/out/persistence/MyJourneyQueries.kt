package com.readmates.archive.adapter.out.persistence

import com.readmates.archive.application.model.MyJourneyFeedbackDocumentResult
import com.readmates.archive.application.model.MyJourneyItemResult
import com.readmates.archive.application.model.MyJourneyResult
import com.readmates.archive.application.model.MyJourneySummaryResult
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.time.LocalDate

internal class MyJourneyQueries {
    fun loadMyJourney(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): MyJourneyResult {
        val cursor = MyJourneyCursor.from(pageRequest.cursor)
        val rows =
            jdbcTemplate.query(
                PAGE_SQL,
                { resultSet, _ ->
                    val date = resultSet.getObject("session_date", LocalDate::class.java)
                    val sessionNumber = resultSet.getInt("session_number")
                    val sessionId = resultSet.uuid("session_id").toString()
                    val feedbackAvailable = resultSet.getString("feedback_document_id") != null
                    val feedbackReadable = feedbackAvailable && canReadArchiveFeedbackDocument(currentMember)
                    MyJourneyRow(
                        item =
                            MyJourneyItemResult(
                                sessionId = sessionId,
                                sessionNumber = sessionNumber,
                                bookTitle = resultSet.getString("book_title"),
                                bookAuthor = resultSet.getString("book_author"),
                                bookImageUrl = resultSet.getString("book_image_url"),
                                date = date.toString(),
                                readingProgress = resultSet.getObject("reading_progress") as Int?,
                                questionCount = resultSet.getInt("question_count"),
                                reviewCount = resultSet.getInt("review_count"),
                                feedbackDocument =
                                    MyJourneyFeedbackDocumentResult(
                                        available = feedbackAvailable,
                                        readable = feedbackReadable,
                                        lockedReason =
                                            when {
                                                !feedbackAvailable -> "NOT_AVAILABLE"
                                                feedbackReadable -> null
                                                else -> "ACTIVE_MEMBERSHIP_REQUIRED"
                                            },
                                    ),
                            ),
                        cursor = MyJourneyCursor(date, sessionNumber, sessionId),
                    )
                },
                *pageArgs(currentMember, cursor, pageRequest.limit),
            )
        val visibleRows = rows.take(pageRequest.limit)

        return MyJourneyResult(
            items = visibleRows.map(MyJourneyRow::item),
            summary = loadSummary(jdbcTemplate, currentMember),
            nextCursor = if (rows.size > pageRequest.limit) visibleRows.lastOrNull()?.cursor?.encode() else null,
        )
    }

    private fun loadSummary(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
    ): MyJourneySummaryResult =
        jdbcTemplate
            .query(
                SUMMARY_SQL,
                { resultSet, _ ->
                    MyJourneySummaryResult(
                        attendedSessionCount = resultSet.getInt("attended_session_count"),
                        completedReadingCount = resultSet.getInt("completed_reading_count"),
                        questionCount = resultSet.getInt("question_count"),
                        reviewCount = resultSet.getInt("review_count"),
                        readableFeedbackDocumentCount = resultSet.getInt("readable_feedback_document_count"),
                    )
                },
                *summaryArgs(currentMember),
            ).single()

    private fun pageArgs(
        currentMember: CurrentMember,
        cursor: MyJourneyCursor?,
        limit: Int,
    ): Array<Any?> =
        arrayOf(
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            currentMember.clubId.dbString(),
            cursor?.date,
            cursor?.date,
            cursor?.date,
            cursor?.sessionNumber,
            cursor?.date,
            cursor?.sessionNumber,
            cursor?.sessionId,
            limit + 1,
        )

    private fun summaryArgs(currentMember: CurrentMember): Array<Any?> =
        arrayOf(
            currentMember.isActive,
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            currentMember.clubId.dbString(),
        )
}

private data class MyJourneyRow(
    val item: MyJourneyItemResult,
    val cursor: MyJourneyCursor,
)

private data class MyJourneyCursor(
    val date: LocalDate,
    val sessionNumber: Int,
    val sessionId: String,
) {
    fun encode(): String? =
        CursorCodec.encode(
            mapOf(
                "date" to date.toString(),
                "sessionNumber" to sessionNumber.toString(),
                "sessionId" to sessionId,
            ),
        )

    companion object {
        fun from(cursor: Map<String, String>): MyJourneyCursor? {
            val date = cursor["date"]?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            val sessionNumber = cursor["sessionNumber"]?.toIntOrNull()
            val sessionId = cursor["sessionId"]?.takeIf { it.isNotBlank() }
            return if (date != null && sessionNumber != null && sessionId != null) {
                MyJourneyCursor(date, sessionNumber, sessionId)
            } else {
                null
            }
        }
    }
}

private val PAGE_SQL =
    """
    select
      sessions.id as session_id,
      sessions.number as session_number,
      sessions.book_title,
      sessions.book_author,
      sessions.book_image_url,
      sessions.session_date,
      my_checkin.reading_progress,
      coalesce(my_questions.question_count, 0) as question_count,
      coalesce(my_reviews.review_count, 0) as review_count,
      latest_feedback_document.id as feedback_document_id
    from sessions
    left join (
      select session_participants.session_id, session_participants.attendance_status
      from session_participants
      where session_participants.club_id = ?
        and session_participants.membership_id = ?
        and session_participants.participation_status = 'ACTIVE'
    ) current_participant on current_participant.session_id = sessions.id
    left join (
      select questions.session_id, count(*) as question_count
      from questions
      where questions.club_id = ?
        and questions.membership_id = ?
      group by questions.session_id
    ) my_questions on my_questions.session_id = sessions.id
    left join (
      select long_reviews.session_id, count(*) as review_count
      from long_reviews
      where long_reviews.club_id = ?
        and long_reviews.membership_id = ?
      group by long_reviews.session_id
    ) my_reviews on my_reviews.session_id = sessions.id
    left join (
      select reading_checkins.session_id, reading_checkins.reading_progress
      from reading_checkins
      where reading_checkins.club_id = ?
        and reading_checkins.membership_id = ?
    ) my_checkin on my_checkin.session_id = sessions.id
    left join (
      select ranked_feedback_documents.id, ranked_feedback_documents.session_id
      from (
        select
          session_feedback_documents.id,
          session_feedback_documents.session_id,
          row_number() over (
            partition by session_feedback_documents.session_id
            order by
              session_feedback_documents.version desc,
              session_feedback_documents.created_at desc,
              session_feedback_documents.id desc
          ) as document_rank
        from session_feedback_documents
        where session_feedback_documents.club_id = ?
      ) ranked_feedback_documents
      where ranked_feedback_documents.document_rank = 1
    ) latest_feedback_document on latest_feedback_document.session_id = sessions.id
    where sessions.club_id = ?
      and sessions.state in ('CLOSED', 'PUBLISHED')
      and sessions.visibility in ('MEMBER', 'PUBLIC')
      and (
        current_participant.attendance_status = 'ATTENDED'
        or coalesce(my_questions.question_count, 0) > 0
        or coalesce(my_reviews.review_count, 0) > 0
        or latest_feedback_document.id is not null
      )
      and (
        ? is null
        or sessions.session_date < ?
        or (sessions.session_date = ? and sessions.number < ?)
        or (sessions.session_date = ? and sessions.number = ? and sessions.id < ?)
      )
    order by sessions.session_date desc, sessions.number desc, sessions.id desc
    limit ?
    """.trimIndent()

private val SUMMARY_SQL =
    """
    select
      count(distinct case
        when current_participant.attendance_status = 'ATTENDED' then sessions.id
      end) as attended_session_count,
      count(distinct case
        when my_checkin.reading_progress >= 100 then sessions.id
      end) as completed_reading_count,
      coalesce(sum(my_questions.question_count), 0) as question_count,
      coalesce(sum(my_reviews.review_count), 0) as review_count,
      count(distinct case
        when ? = true and latest_feedback_document.id is not null then sessions.id
      end) as readable_feedback_document_count
    from sessions
    left join (
      select session_participants.session_id, session_participants.attendance_status
      from session_participants
      where session_participants.club_id = ?
        and session_participants.membership_id = ?
        and session_participants.participation_status = 'ACTIVE'
    ) current_participant on current_participant.session_id = sessions.id
    left join (
      select questions.session_id, count(*) as question_count
      from questions
      where questions.club_id = ?
        and questions.membership_id = ?
      group by questions.session_id
    ) my_questions on my_questions.session_id = sessions.id
    left join (
      select long_reviews.session_id, count(*) as review_count
      from long_reviews
      where long_reviews.club_id = ?
        and long_reviews.membership_id = ?
      group by long_reviews.session_id
    ) my_reviews on my_reviews.session_id = sessions.id
    left join (
      select reading_checkins.session_id, reading_checkins.reading_progress
      from reading_checkins
      where reading_checkins.club_id = ?
        and reading_checkins.membership_id = ?
    ) my_checkin on my_checkin.session_id = sessions.id
    left join (
      select ranked_feedback_documents.id, ranked_feedback_documents.session_id
      from (
        select
          session_feedback_documents.id,
          session_feedback_documents.session_id,
          row_number() over (
            partition by session_feedback_documents.session_id
            order by
              session_feedback_documents.version desc,
              session_feedback_documents.created_at desc,
              session_feedback_documents.id desc
          ) as document_rank
        from session_feedback_documents
        where session_feedback_documents.club_id = ?
      ) ranked_feedback_documents
      where ranked_feedback_documents.document_rank = 1
    ) latest_feedback_document on latest_feedback_document.session_id = sessions.id
    where sessions.club_id = ?
      and sessions.state in ('CLOSED', 'PUBLISHED')
      and sessions.visibility in ('MEMBER', 'PUBLIC')
      and (
        current_participant.attendance_status = 'ATTENDED'
        or coalesce(my_questions.question_count, 0) > 0
        or coalesce(my_reviews.review_count, 0) > 0
        or latest_feedback_document.id is not null
      )
    """.trimIndent()
