package com.readmates.browse.adapter.out.persistence

import com.readmates.auth.domain.BookClubAvatarKey
import com.readmates.browse.application.model.GuestArchiveDetailResult
import com.readmates.browse.application.model.GuestArchiveSessionResult
import com.readmates.browse.application.model.GuestHighlightResult
import com.readmates.browse.application.model.GuestLongReviewResult
import com.readmates.browse.application.model.GuestNoteFeedCursor
import com.readmates.browse.application.model.GuestNoteFeedResult
import com.readmates.browse.application.model.GuestNoteSessionResult
import com.readmates.browse.application.model.GuestOneLinerResult
import com.readmates.browse.application.model.GuestQuestionResult
import com.readmates.browse.application.model.GuestRecordCursor
import com.readmates.browse.application.port.out.LoadGuestRecordBrowsePort
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.OffsetDateTime

private val maskedAvatarKey = BookClubAvatarKey.fallback.wireValue

@Component
@Suppress("LongMethod", "TooManyFunctions")
class JdbcGuestRecordBrowseAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadGuestRecordBrowsePort {
    override fun loadNoteSessions(
        clubSlug: String,
        cursor: GuestRecordCursor?,
        limit: Int,
    ): List<GuestNoteSessionResult> {
        val (cursorClause, arguments) = recordCursorSql(clubSlug, cursor, limit)
        return jdbcTemplate.query(
            """
            select
              sessions.id,
              sessions.number,
              sessions.book_title,
              date_format(sessions.session_date, '%Y-%m-%d') as session_date,
              (
                select count(*) from questions
                where questions.club_id = sessions.club_id
                  and questions.session_id = sessions.id
                  and exists (
                    select 1 from session_participants
                    where session_participants.session_id = questions.session_id
                      and session_participants.club_id = questions.club_id
                      and session_participants.membership_id = questions.membership_id
                      and session_participants.participation_status = 'ACTIVE'
                  )
              ) as question_count,
              (
                select count(*) from one_line_reviews
                where one_line_reviews.club_id = sessions.club_id
                  and one_line_reviews.session_id = sessions.id
                  and one_line_reviews.visibility = 'PUBLIC'
                  and exists (
                    select 1 from session_participants
                    where session_participants.session_id = one_line_reviews.session_id
                      and session_participants.club_id = one_line_reviews.club_id
                      and session_participants.membership_id = one_line_reviews.membership_id
                      and session_participants.participation_status = 'ACTIVE'
                  )
              ) as one_liner_count,
              (
                select count(*) from long_reviews
                where long_reviews.club_id = sessions.club_id
                  and long_reviews.session_id = sessions.id
                  and long_reviews.visibility = 'PUBLIC'
                  and exists (
                    select 1 from session_participants
                    where session_participants.session_id = long_reviews.session_id
                      and session_participants.club_id = long_reviews.club_id
                      and session_participants.membership_id = long_reviews.membership_id
                      and session_participants.participation_status = 'ACTIVE'
                  )
              ) as long_review_count,
              (
                select count(*) from highlights
                where highlights.club_id = sessions.club_id
                  and highlights.session_id = sessions.id
                  and (
                    highlights.membership_id is null
                    or exists (
                      select 1 from session_participants
                      where session_participants.session_id = highlights.session_id
                        and session_participants.club_id = highlights.club_id
                        and session_participants.membership_id = highlights.membership_id
                        and session_participants.participation_status = 'ACTIVE'
                    )
                  )
              ) as highlight_count
            from sessions
            join clubs on clubs.id = sessions.club_id
            where clubs.slug = ?
              and clubs.status = 'ACTIVE'
              and clubs.public_visibility = 'PUBLIC'
              and sessions.access_scope = 'GUEST_READABLE'
              and sessions.state = 'PUBLISHED'
              $cursorClause
            order by sessions.number desc, sessions.id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNoteSession() },
            *arguments,
        )
    }

    override fun loadNotesFeed(
        clubSlug: String,
        cursor: GuestNoteFeedCursor?,
        limit: Int,
    ): List<GuestNoteFeedResult> {
        val cursorClause =
            if (cursor == null) {
                ""
            } else {
                """
                and (
                  session_number < ?
                  or (session_number = ? and created_at < ?)
                  or (session_number = ? and created_at = ? and source_order > ?)
                  or (session_number = ? and created_at = ? and source_order = ? and item_order > ?)
                  or (session_number = ? and created_at = ? and source_order = ? and item_order = ? and id < ?)
                )
                """.trimIndent()
            }
        val arguments =
            buildList<Any> {
                add(clubSlug)
                if (cursor != null) {
                    val createdAt = Timestamp.from(OffsetDateTime.parse(cursor.createdAt).toInstant())
                    add(cursor.sessionNumber)
                    add(cursor.sessionNumber)
                    add(createdAt)
                    add(cursor.sessionNumber)
                    add(createdAt)
                    add(cursor.sourceOrder)
                    add(cursor.sessionNumber)
                    add(createdAt)
                    add(cursor.sourceOrder)
                    add(cursor.itemOrder)
                    add(cursor.sessionNumber)
                    add(createdAt)
                    add(cursor.sourceOrder)
                    add(cursor.itemOrder)
                    add(cursor.itemId)
                }
                add(limit)
            }.toTypedArray()
        return jdbcTemplate.query(
            """
            with eligible_sessions as (
              select sessions.id, sessions.club_id, sessions.number, sessions.book_title, sessions.session_date
              from sessions
              join clubs on clubs.id = sessions.club_id
              where clubs.slug = ?
                and clubs.status = 'ACTIVE'
                and clubs.public_visibility = 'PUBLIC'
                and sessions.access_scope = 'GUEST_READABLE'
                and sessions.state = 'PUBLISHED'
            )
            select
              id, session_id, session_number, book_title,
              date_format(session_date, '%Y-%m-%d') as session_date,
              author_name, author_short_name, avatar_key, kind, text,
              date_format(created_at, '%Y-%m-%dT%H:%i:%s.%fZ') as created_at,
              source_order, item_order
            from (
              select
                questions.id, eligible_sessions.id as session_id, eligible_sessions.number as session_number,
                eligible_sessions.book_title, eligible_sessions.session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_name,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_short_name,
                case when memberships.status = 'LEFT' then '$maskedAvatarKey' else memberships.avatar_key end as avatar_key,
                'QUESTION' as kind, questions.text, questions.created_at, 10 as source_order, questions.priority as item_order
              from questions
              join eligible_sessions on eligible_sessions.id = questions.session_id
                and eligible_sessions.club_id = questions.club_id
              join memberships on memberships.id = questions.membership_id and memberships.club_id = questions.club_id
              join session_participants on session_participants.session_id = questions.session_id
                and session_participants.club_id = questions.club_id
                and session_participants.membership_id = questions.membership_id
                and session_participants.participation_status = 'ACTIVE'

              union all

              select
                highlights.id, eligible_sessions.id, eligible_sessions.number,
                eligible_sessions.book_title, eligible_sessions.session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end,
                case when memberships.status = 'LEFT' then '$maskedAvatarKey' else memberships.avatar_key end,
                'HIGHLIGHT', highlights.text, highlights.created_at, 20, highlights.sort_order
              from highlights
              join eligible_sessions on eligible_sessions.id = highlights.session_id
                and eligible_sessions.club_id = highlights.club_id
              left join memberships on memberships.id = highlights.membership_id and memberships.club_id = highlights.club_id
              left join session_participants on session_participants.session_id = highlights.session_id
                and session_participants.club_id = highlights.club_id
                and session_participants.membership_id = highlights.membership_id
              where highlights.membership_id is null or session_participants.participation_status = 'ACTIVE'

              union all

              select
                one_line_reviews.id, eligible_sessions.id, eligible_sessions.number,
                eligible_sessions.book_title, eligible_sessions.session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end,
                case when memberships.status = 'LEFT' then '$maskedAvatarKey' else memberships.avatar_key end,
                'ONE_LINE_REVIEW', one_line_reviews.text, one_line_reviews.created_at, 30, 0
              from one_line_reviews
              join eligible_sessions on eligible_sessions.id = one_line_reviews.session_id
                and eligible_sessions.club_id = one_line_reviews.club_id
              join memberships on memberships.id = one_line_reviews.membership_id and memberships.club_id = one_line_reviews.club_id
              join session_participants on session_participants.session_id = one_line_reviews.session_id
                and session_participants.club_id = one_line_reviews.club_id
                and session_participants.membership_id = one_line_reviews.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where one_line_reviews.visibility = 'PUBLIC'

              union all

              select
                long_reviews.id, eligible_sessions.id, eligible_sessions.number,
                eligible_sessions.book_title, eligible_sessions.session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end,
                case when memberships.status = 'LEFT' then '$maskedAvatarKey' else memberships.avatar_key end,
                'LONG_REVIEW', long_reviews.body, long_reviews.created_at, 40, 0
              from long_reviews
              join eligible_sessions on eligible_sessions.id = long_reviews.session_id
                and eligible_sessions.club_id = long_reviews.club_id
              join memberships on memberships.id = long_reviews.membership_id and memberships.club_id = long_reviews.club_id
              join session_participants on session_participants.session_id = long_reviews.session_id
                and session_participants.club_id = long_reviews.club_id
                and session_participants.membership_id = long_reviews.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where long_reviews.visibility = 'PUBLIC'
            ) feed_items
            where 1 = 1
              $cursorClause
            order by session_number desc, created_at desc, source_order, item_order, id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNoteFeed() },
            *arguments,
        )
    }

    override fun loadArchiveSessions(
        clubSlug: String,
        cursor: GuestRecordCursor?,
        limit: Int,
    ): List<GuestArchiveSessionResult> {
        val (cursorClause, arguments) = recordCursorSql(clubSlug, cursor, limit)
        return jdbcTemplate.query(
            """
            select
              sessions.id, sessions.number, sessions.title, sessions.book_title, sessions.book_author,
              sessions.book_image_url, date_format(sessions.session_date, '%Y-%m-%d') as session_date,
              sessions.state,
              (select count(*) from session_participants
               where session_participants.session_id = sessions.id
                 and session_participants.club_id = sessions.club_id
                 and session_participants.participation_status = 'ACTIVE'
                 and session_participants.attendance_status = 'ATTENDED') as attendance,
              (select count(*) from session_participants
               where session_participants.session_id = sessions.id
                 and session_participants.club_id = sessions.club_id
                 and session_participants.participation_status = 'ACTIVE') as total
            from sessions
            join clubs on clubs.id = sessions.club_id
            where clubs.slug = ?
              and clubs.status = 'ACTIVE'
              and clubs.public_visibility = 'PUBLIC'
              and sessions.access_scope = 'GUEST_READABLE'
              and sessions.state in ('CLOSED', 'PUBLISHED')
              $cursorClause
            order by sessions.number desc, sessions.id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toArchiveSession() },
            *arguments,
        )
    }

    override fun loadArchiveDetail(
        clubSlug: String,
        sessionId: String,
    ): GuestArchiveDetailResult? {
        val header =
            jdbcTemplate
                .query(
                    """
                    select
                      sessions.id, sessions.number, sessions.title, sessions.book_title, sessions.book_author,
                      sessions.book_image_url, date_format(sessions.session_date, '%Y-%m-%d') as session_date,
                      sessions.state, public_session_publications.public_summary,
                      (select count(*) from session_participants
                       where session_participants.session_id = sessions.id
                         and session_participants.club_id = sessions.club_id
                         and session_participants.participation_status = 'ACTIVE'
                         and session_participants.attendance_status = 'ATTENDED') as attendance,
                      (select count(*) from session_participants
                       where session_participants.session_id = sessions.id
                         and session_participants.club_id = sessions.club_id
                         and session_participants.participation_status = 'ACTIVE') as total
                    from sessions
                    join clubs on clubs.id = sessions.club_id
                    left join public_session_publications on public_session_publications.session_id = sessions.id
                      and public_session_publications.club_id = sessions.club_id
                    where clubs.slug = ?
                      and clubs.status = 'ACTIVE'
                      and clubs.public_visibility = 'PUBLIC'
                      and sessions.id = ?
                      and sessions.access_scope = 'GUEST_READABLE'
                      and sessions.state in ('CLOSED', 'PUBLISHED')
                    """.trimIndent(),
                    { resultSet, _ -> resultSet.toArchiveDetailHeader() },
                    clubSlug,
                    sessionId,
                ).singleOrNull() ?: return null
        return header.copy(
            highlights = loadHighlights(sessionId),
            questions = loadQuestions(sessionId),
            oneLiners = loadOneLiners(sessionId),
            longReviews = loadLongReviews(sessionId),
        )
    }

    private fun loadHighlights(sessionId: String): List<GuestHighlightResult> =
        jdbcTemplate.query(
            """
            select highlights.text, highlights.sort_order,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_short_name,
              case when memberships.status = 'LEFT' then '$maskedAvatarKey' else memberships.avatar_key end as avatar_key
            from highlights
            left join memberships on memberships.id = highlights.membership_id and memberships.club_id = highlights.club_id
            left join session_participants on session_participants.session_id = highlights.session_id
              and session_participants.club_id = highlights.club_id
              and session_participants.membership_id = highlights.membership_id
            where highlights.session_id = ?
              and (highlights.membership_id is null or session_participants.participation_status = 'ACTIVE')
            order by highlights.sort_order, highlights.id
            limit 100
            """.trimIndent(),
            { resultSet, _ ->
                GuestHighlightResult(
                    resultSet.getString("text"),
                    resultSet.getInt("sort_order"),
                    resultSet.getString("author_name"),
                    resultSet.getString("author_short_name"),
                    resultSet.getString("avatar_key"),
                )
            },
            sessionId,
        )

    private fun loadQuestions(sessionId: String): List<GuestQuestionResult> =
        jdbcTemplate.query(
            """
            select questions.priority, questions.text, questions.draft_thought,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_short_name,
              case when memberships.status = 'LEFT' then '$maskedAvatarKey' else memberships.avatar_key end as avatar_key
            from questions
            join memberships on memberships.id = questions.membership_id and memberships.club_id = questions.club_id
            join session_participants on session_participants.session_id = questions.session_id
              and session_participants.club_id = questions.club_id
              and session_participants.membership_id = questions.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where questions.session_id = ?
            order by questions.priority, questions.created_at
            limit 100
            """.trimIndent(),
            { resultSet, _ -> resultSet.toQuestion() },
            sessionId,
        )

    private fun loadOneLiners(sessionId: String): List<GuestOneLinerResult> =
        jdbcTemplate.query(
            """
            select one_line_reviews.text,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_short_name,
              case when memberships.status = 'LEFT' then '$maskedAvatarKey' else memberships.avatar_key end as avatar_key
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id and memberships.club_id = one_line_reviews.club_id
            join session_participants on session_participants.session_id = one_line_reviews.session_id
              and session_participants.club_id = one_line_reviews.club_id
              and session_participants.membership_id = one_line_reviews.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where one_line_reviews.session_id = ?
              and one_line_reviews.visibility = 'PUBLIC'
            order by one_line_reviews.created_at, one_line_reviews.id
            limit 100
            """.trimIndent(),
            { resultSet, _ ->
                GuestOneLinerResult(
                    resultSet.getString("text"),
                    resultSet.getString("author_name"),
                    resultSet.getString("author_short_name"),
                    resultSet.getString("avatar_key"),
                )
            },
            sessionId,
        )

    private fun loadLongReviews(sessionId: String): List<GuestLongReviewResult> =
        jdbcTemplate.query(
            """
            select long_reviews.body,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else memberships.short_name end as author_short_name,
              case when memberships.status = 'LEFT' then '$maskedAvatarKey' else memberships.avatar_key end as avatar_key
            from long_reviews
            join memberships on memberships.id = long_reviews.membership_id and memberships.club_id = long_reviews.club_id
            join session_participants on session_participants.session_id = long_reviews.session_id
              and session_participants.club_id = long_reviews.club_id
              and session_participants.membership_id = long_reviews.membership_id
              and session_participants.participation_status = 'ACTIVE'
            where long_reviews.session_id = ?
              and long_reviews.visibility = 'PUBLIC'
            order by long_reviews.created_at, long_reviews.id
            limit 100
            """.trimIndent(),
            { resultSet, _ ->
                val shortName = resultSet.getString("author_short_name")
                GuestLongReviewResult(
                    "${shortName}의 서평",
                    resultSet.getString("body"),
                    resultSet.getString("author_name"),
                    shortName,
                    resultSet.getString("avatar_key"),
                )
            },
            sessionId,
        )

    private fun recordCursorSql(
        clubSlug: String,
        cursor: GuestRecordCursor?,
        limit: Int,
    ): Pair<String, Array<Any>> {
        val clause =
            if (cursor == null) "" else "and (sessions.number < ? or (sessions.number = ? and sessions.id < ?))"
        val arguments =
            buildList<Any> {
                add(clubSlug)
                if (cursor != null) {
                    add(cursor.sessionNumber)
                    add(cursor.sessionNumber)
                    add(cursor.sessionId)
                }
                add(limit)
            }.toTypedArray()
        return clause to arguments
    }

    private fun ResultSet.toNoteSession(): GuestNoteSessionResult {
        val questionCount = getInt("question_count")
        val oneLinerCount = getInt("one_liner_count")
        val longReviewCount = getInt("long_review_count")
        val highlightCount = getInt("highlight_count")
        return GuestNoteSessionResult(
            getString("id"),
            getInt("number"),
            getString("book_title"),
            getString("session_date"),
            questionCount,
            oneLinerCount,
            longReviewCount,
            highlightCount,
            questionCount + oneLinerCount + longReviewCount + highlightCount,
        )
    }

    private fun ResultSet.toNoteFeed() =
        GuestNoteFeedResult(
            getString("id"),
            getString("created_at"),
            getInt("source_order"),
            getInt("item_order"),
            getString("session_id"),
            getInt("session_number"),
            getString("book_title"),
            getString("session_date"),
            getString("author_name"),
            getString("author_short_name"),
            getString("avatar_key"),
            getString("kind"),
            getString("text"),
        )

    private fun ResultSet.toArchiveSession() =
        GuestArchiveSessionResult(
            getString("id"),
            getInt("number"),
            getString("title"),
            getString("book_title"),
            getString("book_author"),
            getString("book_image_url"),
            getString("session_date"),
            getInt("attendance"),
            getInt("total"),
            getString("state"),
        )

    private fun ResultSet.toArchiveDetailHeader() =
        GuestArchiveDetailResult(
            getString("id"),
            getInt("number"),
            getString("title"),
            getString("book_title"),
            getString("book_author"),
            getString("book_image_url"),
            getString("session_date"),
            getInt("attendance"),
            getInt("total"),
            getString("state"),
            getString("public_summary"),
            emptyList(),
            emptyList(),
            emptyList(),
            emptyList(),
        )

    private fun ResultSet.toQuestion() =
        GuestQuestionResult(
            getInt("priority"),
            getString("text"),
            getString("draft_thought"),
            getString("author_name"),
            getString("author_short_name"),
            getString("avatar_key"),
        )
}
