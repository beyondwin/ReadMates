package com.readmates.archive.adapter.out.persistence

import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.model.MyPageResult
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.time.OffsetDateTime

internal class ArchiveListQueries {
    fun loadArchiveSessions(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<ArchiveSessionResult> {
        val cursor = ArchiveSessionCursor.from(pageRequest.cursor)

        val rows = jdbcTemplate.query(
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
              and (
                ? is null
                or sessions.number < ?
                or (sessions.number = ? and sessions.id < ?)
              )
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
            order by sessions.number desc, sessions.id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toArchiveSessionItem(currentMember) },
            currentMember.membershipId.dbString(),
            currentMember.clubId.dbString(),
            currentMember.clubId.dbString(),
            cursor?.number,
            cursor?.number,
            cursor?.number,
            cursor?.id,
            pageRequest.limit + 1,
        )
        return pageFromRows(rows, pageRequest.limit, ::archiveSessionCursor)
    }

    fun loadMyQuestions(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<MyArchiveQuestionResult> {
        val cursor = MyQuestionCursor.from(pageRequest.cursor)
        val rows = jdbcTemplate.query(
            """
            select questions.id as question_id, sessions.id, sessions.number, sessions.book_title, sessions.session_date,
                   questions.priority, questions.text, questions.draft_thought
            from questions
            join sessions on sessions.id = questions.session_id
              and sessions.club_id = questions.club_id
            where questions.club_id = ?
              and questions.membership_id = ?
              and sessions.state = 'PUBLISHED'
              and (
                ? is null
                or sessions.number < ?
                or (sessions.number = ? and questions.priority > ?)
                or (sessions.number = ? and questions.priority = ? and questions.id < ?)
              )
            order by sessions.number desc, questions.priority asc, questions.id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toMyArchiveQuestionResult() },
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
            cursor?.sessionNumber,
            cursor?.sessionNumber,
            cursor?.sessionNumber,
            cursor?.priority,
            cursor?.sessionNumber,
            cursor?.priority,
            cursor?.id,
            pageRequest.limit + 1,
        )
        return pageFromRows(rows, pageRequest.limit, ::myQuestionCursor)
    }

    fun loadMyReviews(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<MyArchiveReviewResult> {
        val cursor = MyReviewCursor.from(pageRequest.cursor)
        val rows = jdbcTemplate.query(
            """
            select
              long_reviews.id as review_id,
              long_reviews.created_at as review_created_at,
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
              and (
                ? is null
                or sessions.number < ?
                or (sessions.number = ? and long_reviews.created_at < ?)
                or (sessions.number = ? and long_reviews.created_at = ? and long_reviews.id < ?)
              )
            order by sessions.number desc, long_reviews.created_at desc, long_reviews.id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toMyArchiveReviewResult() },
            currentMember.clubId.dbString(),
            currentMember.membershipId.dbString(),
            cursor?.sessionNumber,
            cursor?.sessionNumber,
            cursor?.sessionNumber,
            cursor?.createdAt?.toUtcLocalDateTime(),
            cursor?.sessionNumber,
            cursor?.createdAt?.toUtcLocalDateTime(),
            cursor?.id,
            pageRequest.limit + 1,
        )
        return pageFromRows(rows, pageRequest.limit, ::myReviewCursor)
    }

    fun loadMyPage(jdbcTemplate: JdbcTemplate, currentMember: CurrentMember): MyPageResult {
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
            { resultSet, _ -> resultSet.toMyRecentAttendanceResult() },
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
        ).firstOrNull() ?: defaultMyPageResult(currentMember)
    }

    fun defaultMyPageResult(currentMember: CurrentMember) =
        MyPageResult(
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

private fun archiveSessionCursor(item: ArchiveSessionResult): String? =
    CursorCodec.encode(
        mapOf(
            "number" to item.sessionNumber.toString(),
            "id" to item.sessionId,
        ),
    )

private fun myQuestionCursor(item: MyArchiveQuestionResult): String? =
    CursorCodec.encode(
        mapOf(
            "sessionNumber" to item.sessionNumber.toString(),
            "priority" to item.priority.toString(),
            "id" to item.questionId,
        ),
    )

private fun myReviewCursor(item: MyArchiveReviewResult): String? =
    CursorCodec.encode(
        mapOf(
            "sessionNumber" to item.sessionNumber.toString(),
            "createdAt" to item.createdAt,
            "id" to item.reviewId,
        ),
    )

private fun <T> pageFromRows(rows: List<T>, limit: Int, cursorFor: (T) -> String?): CursorPage<T> {
    val visibleRows = rows.take(limit)
    return CursorPage(
        items = visibleRows,
        nextCursor = if (rows.size > limit) visibleRows.lastOrNull()?.let(cursorFor) else null,
    )
}

private data class ArchiveSessionCursor(
    val number: Int,
    val id: String,
) {
    companion object {
        fun from(cursor: Map<String, String>): ArchiveSessionCursor? {
            val number = cursor["number"]?.toIntOrNull() ?: return null
            val id = cursor["id"]?.takeIf { it.isNotBlank() } ?: return null
            return ArchiveSessionCursor(number, id)
        }
    }
}

private data class MyQuestionCursor(
    val sessionNumber: Int,
    val priority: Int,
    val id: String,
) {
    companion object {
        fun from(cursor: Map<String, String>): MyQuestionCursor? {
            val sessionNumber = cursor["sessionNumber"]?.toIntOrNull() ?: return null
            val priority = cursor["priority"]?.toIntOrNull() ?: return null
            val id = cursor["id"]?.takeIf { it.isNotBlank() } ?: return null
            return MyQuestionCursor(sessionNumber, priority, id)
        }
    }
}

private data class MyReviewCursor(
    val sessionNumber: Int,
    val createdAt: OffsetDateTime,
    val id: String,
) {
    companion object {
        fun from(cursor: Map<String, String>): MyReviewCursor? {
            val sessionNumber = cursor["sessionNumber"]?.toIntOrNull() ?: return null
            val createdAt = cursor["createdAt"]?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
                ?: return null
            val id = cursor["id"]?.takeIf { it.isNotBlank() } ?: return null
            return MyReviewCursor(sessionNumber, createdAt, id)
        }
    }
}
