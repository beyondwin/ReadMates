package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.sessionrecord.application.model.LiveSessionRecord
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordEntry
import com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument
import com.readmates.sessionrecord.application.model.SessionRecordRevision
import com.readmates.sessionrecord.application.port.out.SessionRecordReadStorePort
import com.readmates.shared.db.dbString
import com.readmates.shared.security.AuthenticatedClubActor
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

internal class JdbcSessionRecordReadStore(
    private val jdbcTemplate: JdbcTemplate,
    private val rows: SessionRecordPersistenceRows,
) : SessionRecordReadStorePort {
    @Suppress("LongMethod")
    override fun loadLive(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        forUpdate: Boolean,
    ): LiveSessionRecord? {
        val session =
            jdbcTemplate
                .query(
                    """
                    select s.state, s.visibility, s.access_scope,
                           coalesce(p.site_visibility, 'HIDDEN') as site_visibility,
                           s.number, s.book_title, s.session_date, s.updated_at,
                           coalesce((
                             select max(r.version)
                             from session_record_revisions r
                             where r.club_id = s.club_id and r.session_id = s.id
                           ), 0) as live_revision
                    from sessions s
                    left join public_session_publications p
                      on p.club_id = s.club_id and p.session_id = s.id
                    where s.id = ? and s.club_id = ?
                    ${if (forUpdate) "for update" else ""}
                    """.trimIndent(),
                    { rs, _ -> rows.liveRow(rs) },
                    sessionId.dbString(),
                    host.clubId.dbString(),
                ).singleOrNull()
                ?: return null

        val publicationSummary =
            jdbcTemplate
                .query(
                    """
                    select public_summary
                    from public_session_publications
                    where club_id = ? and session_id = ?
                    """.trimIndent(),
                    { rs, _ -> rs.getString("public_summary") },
                    host.clubId.dbString(),
                    sessionId.dbString(),
                ).singleOrNull()
                ?: ""
        val highlights = loadEntries("highlights", host, sessionId)
        val oneLineReviews = loadEntries("one_line_reviews", host, sessionId)
        val feedback = loadFeedback(host, sessionId)
        return rows.live(
            sessionId = sessionId,
            clubId = host.clubId,
            row = session,
            publicationSummary = publicationSummary,
            highlights = highlights,
            oneLineReviews = oneLineReviews,
            feedback = feedback,
        )
    }

    override fun loadDraft(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        forUpdate: Boolean,
    ): SessionRecordDraft? =
        jdbcTemplate
            .query(
                """
                select session_id, club_id, base_live_revision, base_session_updated_at,
                       draft_revision, source, restored_from_revision_id,
                       snapshot_json, updated_by_membership_id, created_at, updated_at
                from session_record_drafts
                where club_id = ? and session_id = ?
                ${if (forUpdate) "for update" else ""}
                """.trimIndent(),
                { rs, _ -> rows.draft(rs) },
                host.clubId.dbString(),
                sessionId.dbString(),
            ).singleOrNull()

    override fun loadRevision(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        revisionId: UUID,
    ): SessionRecordRevision? =
        jdbcTemplate
            .query(
                """
                select id, session_id, club_id, version, source, restored_from_revision_id, snapshot_json,
                       applied_by_membership_id, applied_at
                from session_record_revisions
                where id = ? and club_id = ? and session_id = ?
                """.trimIndent(),
                { rs, _ -> rows.revision(rs) },
                revisionId.dbString(),
                host.clubId.dbString(),
                sessionId.dbString(),
            ).singleOrNull()

    private fun loadEntries(
        table: String,
        host: AuthenticatedClubActor,
        sessionId: UUID,
    ): List<SessionRecordEntry> {
        require(table == "highlights" || table == "one_line_reviews")
        return jdbcTemplate.query(
            """
            select item.membership_id, coalesce(nullif(u.name, ''), m.short_name) as author_display_name, item.text
            from $table item
            join memberships m on m.id = item.membership_id and m.club_id = item.club_id
            join users u on u.id = m.user_id
            where item.club_id = ? and item.session_id = ? and item.membership_id is not null
            order by ${if (table == "highlights") "item.sort_order" else "item.created_at"}, item.id
            """.trimIndent(),
            { rs, _ -> rows.entry(rs) },
            host.clubId.dbString(),
            sessionId.dbString(),
        )
    }

    private fun loadFeedback(
        host: AuthenticatedClubActor,
        sessionId: UUID,
    ): SessionRecordFeedbackDocument =
        jdbcTemplate
            .query(
                """
                select file_name, coalesce(nullif(document_title, ''), file_name) as document_title, source_text
                from session_feedback_documents
                where club_id = ? and session_id = ?
                order by version desc, id desc
                limit 1
                """.trimIndent(),
                { rs, _ -> rows.feedback(rs) },
                host.clubId.dbString(),
                sessionId.dbString(),
            ).singleOrNull()
            ?: SessionRecordFeedbackDocument("feedback.md", "", "")
}
