package com.readmates.archive.application

import com.readmates.note.api.NoteFeedItem
import com.readmates.note.api.NoteSessionItem
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.LocalDate
import java.util.UUID

@Repository
class NotesFeedQueryRepository(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    fun findNoteSessions(clubId: UUID): List<NoteSessionItem> {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return emptyList()

        return jdbcTemplate.query(
            """
            select
              sessions.id,
              sessions.number,
              sessions.book_title,
              sessions.session_date,
              (
                select count(*)
                from questions
                where questions.club_id = sessions.club_id
                  and questions.session_id = sessions.id
                  and exists (
                    select 1
                    from session_participants
                    where session_participants.session_id = questions.session_id
                      and session_participants.club_id = questions.club_id
                      and session_participants.membership_id = questions.membership_id
                      and session_participants.participation_status = 'ACTIVE'
                  )
              ) as question_count,
              (
                select count(*)
                from one_line_reviews
                where one_line_reviews.club_id = sessions.club_id
                  and one_line_reviews.session_id = sessions.id
                  and one_line_reviews.visibility = 'PUBLIC'
                  and exists (
                    select 1
                    from session_participants
                    where session_participants.session_id = one_line_reviews.session_id
                      and session_participants.club_id = one_line_reviews.club_id
                      and session_participants.membership_id = one_line_reviews.membership_id
                      and session_participants.participation_status = 'ACTIVE'
                  )
              ) as one_liner_count,
              (
                select count(*)
                from long_reviews
                where long_reviews.club_id = sessions.club_id
                  and long_reviews.session_id = sessions.id
                  and long_reviews.visibility = 'PUBLIC'
                  and exists (
                    select 1
                    from session_participants
                    where session_participants.session_id = long_reviews.session_id
                      and session_participants.club_id = long_reviews.club_id
                      and session_participants.membership_id = long_reviews.membership_id
                      and session_participants.participation_status = 'ACTIVE'
                  )
              ) as long_review_count,
              (
                select count(*)
                from highlights
                where highlights.club_id = sessions.club_id
                  and highlights.session_id = sessions.id
                  and (
                    highlights.membership_id is null
                    or exists (
                      select 1
                      from session_participants
                      where session_participants.session_id = highlights.session_id
                        and session_participants.club_id = highlights.club_id
                        and session_participants.membership_id = highlights.membership_id
                        and session_participants.participation_status = 'ACTIVE'
                    )
                  )
              ) as highlight_count
            from sessions
            where sessions.club_id = ?
              and sessions.state = 'PUBLISHED'
            order by sessions.number desc
            """.trimIndent(),
            { resultSet, _ ->
                val questionCount = resultSet.getInt("question_count")
                val oneLinerCount = resultSet.getInt("one_liner_count")
                val longReviewCount = resultSet.getInt("long_review_count")
                val highlightCount = resultSet.getInt("highlight_count")

                NoteSessionItem(
                    sessionId = resultSet.uuid("id").toString(),
                    sessionNumber = resultSet.getInt("number"),
                    bookTitle = resultSet.getString("book_title"),
                    date = resultSet.getObject("session_date", LocalDate::class.java).toString(),
                    questionCount = questionCount,
                    oneLinerCount = oneLinerCount,
                    longReviewCount = longReviewCount,
                    highlightCount = highlightCount,
                    totalCount = questionCount + oneLinerCount + longReviewCount + highlightCount,
                )
            },
            clubId.dbString(),
        )
    }

    fun findNotesFeed(clubId: UUID): List<NoteFeedItem> {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return emptyList()

        return jdbcTemplate.query(
            """
            select session_id, session_number, book_title, session_date, author_name, author_short_name_source, kind, text
            from (
              select
                sessions.id as session_id,
                sessions.number as session_number,
                sessions.book_title as book_title,
                sessions.session_date as session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name_source,
                'QUESTION' as kind,
                questions.text as text,
                questions.created_at as created_at,
                10 as source_order,
                questions.priority as item_order
              from questions
              join sessions on sessions.id = questions.session_id
                and sessions.club_id = questions.club_id
              join memberships on memberships.id = questions.membership_id
                and memberships.club_id = questions.club_id
              join users on users.id = memberships.user_id
              join session_participants on session_participants.session_id = questions.session_id
                and session_participants.club_id = questions.club_id
                and session_participants.membership_id = questions.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where questions.club_id = ?
                and sessions.state = 'PUBLISHED'

              union all

              select
                sessions.id as session_id,
                sessions.number as session_number,
                sessions.book_title as book_title,
                sessions.session_date as session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name_source,
                'LONG_REVIEW' as kind,
                long_reviews.body as text,
                long_reviews.created_at as created_at,
                40 as source_order,
                0 as item_order
              from long_reviews
              join sessions on sessions.id = long_reviews.session_id
                and sessions.club_id = long_reviews.club_id
              join memberships on memberships.id = long_reviews.membership_id
                and memberships.club_id = long_reviews.club_id
              join users on users.id = memberships.user_id
              join session_participants on session_participants.session_id = long_reviews.session_id
                and session_participants.club_id = long_reviews.club_id
                and session_participants.membership_id = long_reviews.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where long_reviews.club_id = ?
                and long_reviews.visibility = 'PUBLIC'
                and sessions.state = 'PUBLISHED'

              union all

              select
                sessions.id as session_id,
                sessions.number as session_number,
                sessions.book_title as book_title,
                sessions.session_date as session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name_source,
                'ONE_LINE_REVIEW' as kind,
                one_line_reviews.text as text,
                one_line_reviews.created_at as created_at,
                30 as source_order,
                0 as item_order
              from one_line_reviews
              join sessions on sessions.id = one_line_reviews.session_id
                and sessions.club_id = one_line_reviews.club_id
              join memberships on memberships.id = one_line_reviews.membership_id
                and memberships.club_id = one_line_reviews.club_id
              join users on users.id = memberships.user_id
              join session_participants on session_participants.session_id = one_line_reviews.session_id
                and session_participants.club_id = one_line_reviews.club_id
                and session_participants.membership_id = one_line_reviews.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where one_line_reviews.club_id = ?
                and one_line_reviews.visibility = 'PUBLIC'
                and sessions.state = 'PUBLISHED'

              union all

              select
                sessions.id as session_id,
                sessions.number as session_number,
                sessions.book_title as book_title,
                sessions.session_date as session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name_source,
                'HIGHLIGHT' as kind,
                highlights.text as text,
                highlights.created_at as created_at,
                20 as source_order,
                highlights.sort_order as item_order
              from highlights
              join sessions on sessions.id = highlights.session_id
                and sessions.club_id = highlights.club_id
              left join memberships on memberships.id = highlights.membership_id
                and memberships.club_id = highlights.club_id
              left join users on users.id = memberships.user_id
              left join session_participants on session_participants.session_id = highlights.session_id
                and session_participants.club_id = highlights.club_id
                and session_participants.membership_id = highlights.membership_id
              where highlights.club_id = ?
                and sessions.state = 'PUBLISHED'
                and (
                  highlights.membership_id is null
                  or session_participants.participation_status = 'ACTIVE'
                )
            ) feed_items
            order by
              created_at desc,
              source_order,
              session_number desc,
              item_order,
              author_name,
              text
            limit 120
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNoteFeedItem() },
            clubId.dbString(),
            clubId.dbString(),
            clubId.dbString(),
            clubId.dbString(),
        )
    }

    fun findNotesFeedForSession(clubId: UUID, sessionId: UUID): List<NoteFeedItem> {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return emptyList()

        return jdbcTemplate.query(
            """
            select session_id, session_number, book_title, session_date, author_name, author_short_name_source, kind, text
            from (
              select
                sessions.id as session_id,
                sessions.number as session_number,
                sessions.book_title as book_title,
                sessions.session_date as session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name_source,
                'QUESTION' as kind,
                questions.text as text,
                questions.created_at as created_at,
                10 as source_order,
                questions.priority as item_order
              from questions
              join sessions on sessions.id = questions.session_id
                and sessions.club_id = questions.club_id
              join memberships on memberships.id = questions.membership_id
                and memberships.club_id = questions.club_id
              join users on users.id = memberships.user_id
              join session_participants on session_participants.session_id = questions.session_id
                and session_participants.club_id = questions.club_id
                and session_participants.membership_id = questions.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where questions.club_id = ?
                and sessions.id = ?
                and sessions.state = 'PUBLISHED'

              union all

              select
                sessions.id as session_id,
                sessions.number as session_number,
                sessions.book_title as book_title,
                sessions.session_date as session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name_source,
                'LONG_REVIEW' as kind,
                long_reviews.body as text,
                long_reviews.created_at as created_at,
                40 as source_order,
                0 as item_order
              from long_reviews
              join sessions on sessions.id = long_reviews.session_id
                and sessions.club_id = long_reviews.club_id
              join memberships on memberships.id = long_reviews.membership_id
                and memberships.club_id = long_reviews.club_id
              join users on users.id = memberships.user_id
              join session_participants on session_participants.session_id = long_reviews.session_id
                and session_participants.club_id = long_reviews.club_id
                and session_participants.membership_id = long_reviews.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where long_reviews.club_id = ?
                and sessions.id = ?
                and long_reviews.visibility = 'PUBLIC'
                and sessions.state = 'PUBLISHED'

              union all

              select
                sessions.id as session_id,
                sessions.number as session_number,
                sessions.book_title as book_title,
                sessions.session_date as session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name_source,
                'ONE_LINE_REVIEW' as kind,
                one_line_reviews.text as text,
                one_line_reviews.created_at as created_at,
                30 as source_order,
                0 as item_order
              from one_line_reviews
              join sessions on sessions.id = one_line_reviews.session_id
                and sessions.club_id = one_line_reviews.club_id
              join memberships on memberships.id = one_line_reviews.membership_id
                and memberships.club_id = one_line_reviews.club_id
              join users on users.id = memberships.user_id
              join session_participants on session_participants.session_id = one_line_reviews.session_id
                and session_participants.club_id = one_line_reviews.club_id
                and session_participants.membership_id = one_line_reviews.membership_id
                and session_participants.participation_status = 'ACTIVE'
              where one_line_reviews.club_id = ?
                and sessions.id = ?
                and one_line_reviews.visibility = 'PUBLIC'
                and sessions.state = 'PUBLISHED'

              union all

              select
                sessions.id as session_id,
                sessions.number as session_number,
                sessions.book_title as book_title,
                sessions.session_date as session_date,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
                case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(users.short_name, users.name) end as author_short_name_source,
                'HIGHLIGHT' as kind,
                highlights.text as text,
                highlights.created_at as created_at,
                20 as source_order,
                highlights.sort_order as item_order
              from highlights
              join sessions on sessions.id = highlights.session_id
                and sessions.club_id = highlights.club_id
              left join memberships on memberships.id = highlights.membership_id
                and memberships.club_id = highlights.club_id
              left join users on users.id = memberships.user_id
              left join session_participants on session_participants.session_id = highlights.session_id
                and session_participants.club_id = highlights.club_id
                and session_participants.membership_id = highlights.membership_id
              where highlights.club_id = ?
                and sessions.id = ?
                and sessions.state = 'PUBLISHED'
                and (
                  highlights.membership_id is null
                  or session_participants.participation_status = 'ACTIVE'
                )
            ) feed_items
            order by
              created_at desc,
              source_order,
              session_number desc,
              item_order,
              author_name,
              text
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNoteFeedItem() },
            clubId.dbString(),
            sessionId.dbString(),
            clubId.dbString(),
            sessionId.dbString(),
            clubId.dbString(),
            sessionId.dbString(),
            clubId.dbString(),
            sessionId.dbString(),
        )
    }

    private fun ResultSet.toNoteFeedItem(): NoteFeedItem {
        val authorName = getString("author_name")
        val authorShortNameSource = getString("author_short_name_source")

        return NoteFeedItem(
            sessionId = uuid("session_id").toString(),
            sessionNumber = getInt("session_number"),
            bookTitle = getString("book_title"),
            date = getObject("session_date", LocalDate::class.java).toString(),
            authorName = authorName,
            authorShortName = authorShortNameSource?.let(::shortNameFor),
            kind = getString("kind"),
            text = getString("text"),
        )
    }

}
