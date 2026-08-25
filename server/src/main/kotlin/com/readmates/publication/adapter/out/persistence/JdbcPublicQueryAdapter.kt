package com.readmates.publication.adapter.out.persistence

import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_SLUG
import com.readmates.publication.application.model.PublicClubProjectionGeneration
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicClubStatsResult
import com.readmates.publication.application.model.PublicHighlightResult
import com.readmates.publication.application.model.PublicOneLinerResult
import com.readmates.publication.application.model.PublicProjectionGeneration
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.model.PublicSessionSummaryResult
import com.readmates.publication.application.port.out.LoadPublishedPublicDataPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.util.UUID

@Component
class JdbcPublicQueryAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadPublishedPublicDataPort {
    override fun loadClubProjectionGeneration(clubSlug: String): PublicClubProjectionGeneration? =
        jdbcTemplate
            .query(
                """
                select clubs.id,
                       coalesce(generations.generation, 0) as generation,
                       case
                         when generations.club_id is null then
                           binary clubs.status = binary 'ACTIVE'
                           and binary clubs.public_visibility = binary 'PUBLIC'
                         else
                           generations.origin_readable
                           and binary clubs.status = binary 'ACTIVE'
                           and binary clubs.public_visibility = binary 'PUBLIC'
                       end as origin_readable
                from clubs
                left join public_club_projection_generations generations on generations.club_id = clubs.id
                where clubs.slug = ?
                """.trimIndent(),
                { rs, _ ->
                    PublicClubProjectionGeneration(
                        clubId = rs.uuid("id"),
                        generation = rs.getLong("generation"),
                        originReadable = rs.getBoolean("origin_readable"),
                    )
                },
                clubSlug,
            ).firstOrNull()

    override fun loadSessionProjectionGeneration(
        clubSlug: String,
        sessionId: UUID,
    ): PublicProjectionGeneration? =
        jdbcTemplate
            .query(
                """
                select sessions.id as session_id,
                       sessions.club_id,
                       publications.id as publication_id,
                       coalesce(current_projection.generation, 0) as generation,
                       coalesce(current_projection.club_generation, club_generation.generation, 0) as club_generation,
                       coalesce(
                         current_projection.live_record_revision,
                         (select max(revisions.version)
                          from session_record_revisions revisions
                          where revisions.club_id = sessions.club_id
                            and revisions.session_id = sessions.id),
                         0
                       ) as live_record_revision,
                       case
                         when current_projection.session_id is null then
                           sessions.deleted_at is null
                           and binary clubs.status = binary 'ACTIVE'
                           and binary clubs.public_visibility = binary 'PUBLIC'
                           and binary sessions.state = binary 'PUBLISHED'
                           and binary sessions.access_scope = binary 'GUEST_READABLE'
                           and binary publications.site_visibility = binary 'PUBLIC_RECORD'
                         else
                           current_projection.origin_readable
                           and sessions.deleted_at is null
                           and binary clubs.status = binary 'ACTIVE'
                           and binary clubs.public_visibility = binary 'PUBLIC'
                           and binary sessions.state = binary 'PUBLISHED'
                           and binary sessions.access_scope = binary 'GUEST_READABLE'
                           and binary publications.site_visibility = binary 'PUBLIC_RECORD'
                       end as origin_readable
                from active_sessions sessions
                join clubs on clubs.id = sessions.club_id
                left join public_session_publications publications
                  on publications.club_id = sessions.club_id and publications.session_id = sessions.id
                left join public_projection_current current_projection on current_projection.session_id = sessions.id
                left join public_club_projection_generations club_generation on club_generation.club_id = sessions.club_id
                where clubs.slug = ? and sessions.id = ?
                """.trimIndent(),
                { rs, _ ->
                    PublicProjectionGeneration(
                        publicationId = rs.getString("publication_id")?.let(UUID::fromString),
                        clubId = rs.uuid("club_id"),
                        sessionId = rs.uuid("session_id"),
                        generation = rs.getLong("generation"),
                        clubGeneration = rs.getLong("club_generation"),
                        liveRecordRevision = rs.getLong("live_record_revision"),
                        originReadable = rs.getBoolean("origin_readable"),
                    )
                },
                clubSlug,
                sessionId.dbString(),
            ).firstOrNull()

    override fun loadClub(): PublicClubResult? = loadClub(LEGACY_PUBLIC_CLUB_SLUG)

    override fun loadClub(clubSlug: String): PublicClubResult? =
        jdbcTemplate
            .query(
                """
                select id, name, tagline, about
                from clubs
                where slug = ?
                  and status = 'ACTIVE'
                  and public_visibility = 'PUBLIC'
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
                clubSlug,
            ).firstOrNull()

    override fun loadSession(sessionId: UUID): PublicSessionDetailResult? = loadSession(LEGACY_PUBLIC_CLUB_SLUG, sessionId)

    override fun loadSession(
        clubSlug: String,
        sessionId: UUID,
    ): PublicSessionDetailResult? =
        jdbcTemplate
            .query(
                """
                select sessions.id, sessions.club_id, sessions.number, sessions.book_title, sessions.book_author, sessions.book_image_url, sessions.session_date,
                       public_session_publications.public_summary
                from active_sessions sessions
                join clubs on clubs.id = sessions.club_id
                join public_session_publications on public_session_publications.session_id = sessions.id
                  and public_session_publications.club_id = sessions.club_id
                where clubs.slug = ?
                  and clubs.status = 'ACTIVE'
                  and clubs.public_visibility = 'PUBLIC'
                  and sessions.id = ?
                  and sessions.state = 'PUBLISHED'
                  and sessions.access_scope = 'GUEST_READABLE'
                  and public_session_publications.site_visibility = 'PUBLIC_RECORD'
                """.trimIndent(),
                { rs, _ ->
                    val content = publicContent(jdbcTemplate, rs.uuid("club_id"), sessionId)
                    PublicSessionDetailResult(
                        sessionId = rs.uuid("id").toString(),
                        sessionNumber = rs.getInt("number"),
                        bookTitle = rs.getString("book_title"),
                        bookAuthor = rs.getString("book_author"),
                        bookImageUrl = rs.getString("book_image_url"),
                        date = rs.getObject("session_date", LocalDate::class.java).toString(),
                        summary = rs.getString("public_summary"),
                        highlights = content.highlights,
                        oneLiners = content.oneLiners,
                    )
                },
                clubSlug,
                sessionId.dbString(),
            ).firstOrNull()

    // for_next_tasks: task_3 will rewrite publicSessions() — do not touch lines 125-188
    private fun publicStats(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
    ): PublicClubStatsResult =
        jdbcTemplate.queryForObject(
            """
            select
              (
                select count(*)
                from active_sessions sessions
                join public_session_publications on public_session_publications.session_id = sessions.id
                  and public_session_publications.club_id = sessions.club_id
                join public_projection_current projection on projection.session_id = sessions.id
                  and projection.club_id = sessions.club_id
                  and projection.origin_readable = true
                where sessions.club_id = ?
                  and sessions.state = 'PUBLISHED'
                  and sessions.access_scope = 'GUEST_READABLE'
                  and public_session_publications.site_visibility = 'PUBLIC_RECORD'
              ) as session_count,
              (
                select count(distinct sessions.book_title)
                from active_sessions sessions
                join public_session_publications on public_session_publications.session_id = sessions.id
                  and public_session_publications.club_id = sessions.club_id
                join public_projection_current projection on projection.session_id = sessions.id
                  and projection.club_id = sessions.club_id
                  and projection.origin_readable = true
                where sessions.club_id = ?
                  and sessions.state = 'PUBLISHED'
                  and sessions.access_scope = 'GUEST_READABLE'
                  and public_session_publications.site_visibility = 'PUBLIC_RECORD'
              ) as book_count,
              (
                select count(*)
                from memberships
                where club_id = ?
                  and status = 'ACTIVE'
              ) as member_count
            """.trimIndent(),
            { rs, _ ->
                PublicClubStatsResult(
                    sessions = rs.getInt("session_count"),
                    books = rs.getInt("book_count"),
                    members = rs.getInt("member_count"),
                )
            },
            clubId.dbString(),
            clubId.dbString(),
            clubId.dbString(),
        )

    private fun publicSessions(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
    ): List<PublicSessionSummaryResult> =
        jdbcTemplate.query(
            """
            with active_participants as (
              select session_id, club_id, membership_id
              from session_participants
              where club_id = ?
                and participation_status = 'ACTIVE'
            )
            select
              sessions.id,
              sessions.number,
              sessions.book_title,
              sessions.book_author,
              sessions.book_image_url,
              sessions.session_date,
              public_session_publications.public_summary,
              coalesce(highlight_counts.cnt, 0) as highlight_count,
              coalesce(one_liner_counts.cnt, 0) as one_liner_count
            from active_sessions sessions
            join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            join public_projection_current projection on projection.session_id = sessions.id
              and projection.club_id = sessions.club_id
              and projection.origin_readable = true
            left join (
              select highlights.session_id, count(*) as cnt
              from highlights
              left join active_participants on active_participants.session_id = highlights.session_id
                and active_participants.club_id = highlights.club_id
                and active_participants.membership_id = highlights.membership_id
              where highlights.club_id = ?
                and (highlights.membership_id is null or active_participants.membership_id is not null)
              group by highlights.session_id
            ) highlight_counts on highlight_counts.session_id = sessions.id
            left join (
              select one_line_reviews.session_id, count(*) as cnt
              from one_line_reviews
              join active_participants on active_participants.session_id = one_line_reviews.session_id
                and active_participants.club_id = one_line_reviews.club_id
                and active_participants.membership_id = one_line_reviews.membership_id
              where one_line_reviews.club_id = ?
                and one_line_reviews.visibility = 'PUBLIC'
              group by one_line_reviews.session_id
            ) one_liner_counts on one_liner_counts.session_id = sessions.id
            where sessions.club_id = ?
              and sessions.state = 'PUBLISHED'
              and sessions.access_scope = 'GUEST_READABLE'
              and public_session_publications.site_visibility = 'PUBLIC_RECORD'
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
            clubId.dbString(),
            clubId.dbString(),
            clubId.dbString(),
        )

    @Suppress("LongMethod")
    private fun publicContent(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ): PublicSessionContent {
        val highlights = mutableListOf<PublicHighlightResult>()
        val oneLiners = mutableListOf<PublicOneLinerResult>()
        jdbcTemplate.query(
            """
            select
              'HIGHLIGHT' as content_kind,
              highlights.text,
              highlights.sort_order,
              highlights.created_at,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name,
              case when memberships.status = 'LEFT' then null else memberships.avatar_key end as avatar_key
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
            union all
            select
              'ONE_LINER' as content_kind,
              one_line_reviews.text,
              0 as sort_order,
              one_line_reviews.created_at,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else users.name end as author_name,
              case when memberships.status = 'LEFT' then '탈퇴한 멤버' else coalesce(memberships.short_name, users.name) end as author_short_name,
              case when memberships.status = 'LEFT' then null else memberships.avatar_key end as avatar_key
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
            order by content_kind, sort_order, created_at, author_name
            """.trimIndent(),
            { rs, _ ->
                if (rs.getString("content_kind") == "HIGHLIGHT") {
                    highlights +=
                        PublicHighlightResult(
                            text = rs.getString("text"),
                            sortOrder = rs.getInt("sort_order"),
                            authorName = rs.getString("author_name"),
                            authorShortName = rs.getString("author_short_name"),
                            avatarKey = rs.getString("avatar_key"),
                        )
                } else {
                    oneLiners +=
                        PublicOneLinerResult(
                            authorName = rs.getString("author_name"),
                            authorShortName = rs.getString("author_short_name"),
                            avatarKey = rs.getString("avatar_key"),
                            text = rs.getString("text"),
                        )
                }
            },
            clubId.dbString(),
            sessionId.dbString(),
            clubId.dbString(),
            sessionId.dbString(),
        )
        return PublicSessionContent(highlights, oneLiners)
    }
}

private data class PublicSessionContent(
    val highlights: List<PublicHighlightResult>,
    val oneLiners: List<PublicOneLinerResult>,
)
