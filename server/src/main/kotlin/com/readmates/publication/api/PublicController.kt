package com.readmates.publication.api

import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.LocalDate
import java.util.UUID

data class PublicClubResponse(
    val clubName: String,
    val tagline: String,
    val about: String,
    val stats: PublicClubStats,
    val recentSessions: List<PublicSessionListItem>,
)

data class PublicClubStats(
    val sessions: Int,
    val books: Int,
    val members: Int,
)

data class PublicSessionListItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val summary: String,
    val highlightCount: Int,
    val oneLinerCount: Int,
)

data class PublicSessionDetailResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val summary: String,
    val highlights: List<String>,
    val oneLiners: List<PublicOneLiner>,
)

data class PublicOneLiner(
    val authorName: String,
    val authorShortName: String,
    val text: String,
)

@RestController
@RequestMapping("/api/public")
class PublicController(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    @GetMapping("/club")
    fun club(): PublicClubResponse {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val club = jdbcTemplate.query(
            """
            select id, name, tagline, about
            from clubs
            where slug = 'reading-sai'
            """.trimIndent(),
            { rs, _ ->
                val clubId = rs.uuid("id")
                PublicClubResponse(
                    clubName = rs.getString("name"),
                    tagline = rs.getString("tagline"),
                    about = rs.getString("about"),
                    stats = publicStats(jdbcTemplate, clubId),
                    recentSessions = publicSessions(jdbcTemplate, clubId),
                )
            },
        ).firstOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        return club
    }

    @GetMapping("/sessions/{sessionId}")
    fun session(@PathVariable sessionId: String): PublicSessionDetailResponse {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val id = runCatching { UUID.fromString(sessionId) }.getOrNull()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        return jdbcTemplate.query(
            """
            select sessions.id, sessions.number, sessions.book_title, sessions.book_author, sessions.book_image_url, sessions.session_date,
                   public_session_publications.public_summary
            from sessions
            join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.id = ?
              and sessions.state = 'PUBLISHED'
              and public_session_publications.is_public = true
            """.trimIndent(),
            { rs, _ ->
                PublicSessionDetailResponse(
                    sessionId = rs.uuid("id").toString(),
                    sessionNumber = rs.getInt("number"),
                    bookTitle = rs.getString("book_title"),
                    bookAuthor = rs.getString("book_author"),
                    bookImageUrl = rs.getString("book_image_url"),
                    date = rs.getObject("session_date", LocalDate::class.java).toString(),
                    summary = rs.getString("public_summary"),
                    highlights = publicHighlights(jdbcTemplate, id),
                    oneLiners = publicOneLiners(jdbcTemplate, id),
                )
            },
            id.dbString(),
        ).firstOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
    }

    private fun publicStats(jdbcTemplate: JdbcTemplate, clubId: UUID): PublicClubStats =
        PublicClubStats(
            sessions = jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                join public_session_publications on public_session_publications.session_id = sessions.id
                  and public_session_publications.club_id = sessions.club_id
                where sessions.club_id = ?
                  and sessions.state = 'PUBLISHED'
                  and public_session_publications.is_public = true
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
                  and sessions.state = 'PUBLISHED'
                  and public_session_publications.is_public = true
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

    private fun publicSessions(jdbcTemplate: JdbcTemplate, clubId: UUID): List<PublicSessionListItem> =
        jdbcTemplate.query(
            """
            select sessions.id, sessions.number, sessions.book_title, sessions.book_author, sessions.book_image_url, sessions.session_date,
                   public_session_publications.public_summary,
                   (
                     select count(*)
                     from highlights
                     where highlights.session_id = sessions.id
                   ) as highlight_count,
                   (
                     select count(*)
                     from one_line_reviews
                     where one_line_reviews.session_id = sessions.id
                       and one_line_reviews.visibility = 'PUBLIC'
                   ) as one_liner_count
            from sessions
            join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.club_id = ?
              and sessions.state = 'PUBLISHED'
              and public_session_publications.is_public = true
            order by sessions.number desc
            limit 6
            """.trimIndent(),
            { rs, _ ->
                PublicSessionListItem(
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

    private fun publicHighlights(jdbcTemplate: JdbcTemplate, sessionId: UUID): List<String> =
        jdbcTemplate.query(
            "select text from highlights where session_id = ? order by sort_order",
            { rs, _ -> rs.getString("text") },
            sessionId.dbString(),
        )

    private fun publicOneLiners(jdbcTemplate: JdbcTemplate, sessionId: UUID): List<PublicOneLiner> =
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
            where one_line_reviews.session_id = ?
              and one_line_reviews.visibility = 'PUBLIC'
            order by one_line_reviews.created_at, users.name
            """.trimIndent(),
            { rs, _ ->
                PublicOneLiner(
                    authorName = rs.getString("author_name"),
                    authorShortName = rs.getString("author_short_name"),
                    text = rs.getString("text"),
                )
            },
            sessionId.dbString(),
        )

    private fun shortNameFor(displayName: String): String = when (displayName) {
        "김호스트" -> "호스트"
        "안멤버1" -> "멤버1"
        "최멤버2" -> "멤버2"
        "김멤버3" -> "멤버3"
        "송멤버4" -> "멤버4"
        "이멤버5" -> "멤버5"
        else -> displayName
    }
}
