package com.readmates.publication.adapter.out.persistence

import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicClubStatsResult
import com.readmates.publication.application.model.PublicHighlightResult
import com.readmates.publication.application.model.PublicOneLinerResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.model.PublicSessionSummaryResult
import com.readmates.publication.application.port.out.LoadPublishedPublicDataPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.util.UUID

@Component
class JdbcPublicQueryAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : LoadPublishedPublicDataPort {
    override fun loadClub(): PublicClubResult? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null

        return jdbcTemplate.query(
            """
            select id, name, tagline, about
            from clubs
            where slug = 'reading-sai'
            """.trimIndent(),
            { rs, _ ->
                val clubId = rs.uuid("id")
                PublicClubResult(
                    clubName = rs.getString("name"),
                    tagline = rs.getString("tagline"),
                    about = rs.getString("about"),
                    stats = publicStats(jdbcTemplate, clubId),
                    recentSessions = publicSessions(jdbcTemplate, clubId),
                )
            },
        ).firstOrNull()
    }

    override fun loadSession(sessionId: UUID): PublicSessionDetailResult? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null

        return jdbcTemplate.query(
            """
            select sessions.id, sessions.club_id, sessions.number, sessions.book_title, sessions.book_author, sessions.book_image_url, sessions.session_date,
                   public_session_publications.public_summary
            from sessions
            join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.id = ?
              and public_session_publications.visibility = 'PUBLIC'
            """.trimIndent(),
            { rs, _ ->
                PublicSessionDetailResult(
                    sessionId = rs.uuid("id").toString(),
                    sessionNumber = rs.getInt("number"),
                    bookTitle = rs.getString("book_title"),
                    bookAuthor = rs.getString("book_author"),
                    bookImageUrl = rs.getString("book_image_url"),
                    date = rs.getObject("session_date", LocalDate::class.java).toString(),
                    summary = rs.getString("public_summary"),
                    highlights = publicHighlights(jdbcTemplate, rs.uuid("club_id"), sessionId),
                    oneLiners = publicOneLiners(jdbcTemplate, rs.uuid("club_id"), sessionId),
                )
            },
            sessionId.dbString(),
        ).firstOrNull()
    }

    private fun publicStats(jdbcTemplate: JdbcTemplate, clubId: UUID): PublicClubStatsResult =
        PublicClubStatsResult(
            sessions = jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                join public_session_publications on public_session_publications.session_id = sessions.id
                  and public_session_publications.club_id = sessions.club_id
                where sessions.club_id = ?
                  and public_session_publications.visibility = 'PUBLIC'
                """.trimIndent(),
                Int::class.java,
                clubId.dbString(),
            ) ?: 0,
            books = jdbcTemplate.queryForObject(
                """
                select count(distinct sessions.book_title)
                from sessions
                join public_session_publications on public_session_publications.session_id = sessions.id
                  and public_session_publications.club_id = sessions.club_id
                where sessions.club_id = ?
                  and public_session_publications.visibility = 'PUBLIC'
                """.trimIndent(),
                Int::class.java,
                clubId.dbString(),
            ) ?: 0,
            members = jdbcTemplate.queryForObject(
                "select count(*) from memberships where club_id = ? and status = 'ACTIVE'",
                Int::class.java,
                clubId.dbString(),
            ) ?: 0,
        )

    private fun publicSessions(jdbcTemplate: JdbcTemplate, clubId: UUID): List<PublicSessionSummaryResult> =
        jdbcTemplate.query(
            """
            select sessions.id, sessions.number, sessions.book_title, sessions.book_author, sessions.book_image_url, sessions.session_date,
                   public_session_publications.public_summary,
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
                   ) as highlight_count,
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
                   ) as one_liner_count
            from sessions
            join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.club_id = ?
              and public_session_publications.visibility = 'PUBLIC'
            order by sessions.number desc
            limit 6
            """.trimIndent(),
            { rs, _ ->
                PublicSessionSummaryResult(
                    sessionId = rs.uuid("id").toString(),
                    sessionNumber = rs.getInt("number"),
                    bookTitle = rs.getString("book_title"),
                    bookAuthor = rs.getString("book_author"),
                    bookImageUrl = rs.getString("book_image_url"),
                    date = rs.getObject("session_date", LocalDate::class.java).toString(),
                    summary = rs.getString("public_summary"),
                    highlightCount = rs.getInt("highlight_count"),
                    oneLinerCount = rs.getInt("one_liner_count"),
                )
            },
            clubId.dbString(),
        )

    private fun publicHighlights(jdbcTemplate: JdbcTemplate, clubId: UUID, sessionId: UUID): List<PublicHighlightResult> =
        jdbcTemplate.query(
            """
            select
              highlights.text,
              highlights.sort_order,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
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
            { rs, _ ->
                PublicHighlightResult(
                    text = rs.getString("text"),
                    sortOrder = rs.getInt("sort_order"),
                    authorName = rs.getString("author_name"),
                    authorShortName = rs.getString("author_short_name"),
                )
            },
            clubId.dbString(),
            sessionId.dbString(),
        )

    private fun publicOneLiners(jdbcTemplate: JdbcTemplate, clubId: UUID, sessionId: UUID): List<PublicOneLinerResult> =
        jdbcTemplate.query(
            """
            select
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
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
            order by one_line_reviews.created_at, users.name
            """.trimIndent(),
            { rs, _ ->
                PublicOneLinerResult(
                    authorName = rs.getString("author_name"),
                    authorShortName = rs.getString("author_short_name"),
                    text = rs.getString("text"),
                )
            },
            clubId.dbString(),
            sessionId.dbString(),
        )
}
