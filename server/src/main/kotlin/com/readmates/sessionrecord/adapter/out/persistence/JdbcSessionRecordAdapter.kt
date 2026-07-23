package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.notification.application.model.NotificationDecision
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionrecord.application.model.CompletedSessionRecordApply
import com.readmates.sessionrecord.application.model.EncodedSessionRecordSnapshot
import com.readmates.sessionrecord.application.model.LiveSessionRecord
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordDraftSource
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordEntry
import com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument
import com.readmates.sessionrecord.application.model.SessionRecordRevision
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.sessionrecord.application.model.SessionRecordSource
import com.readmates.sessionrecord.application.port.out.SessionRecordStorePort
import com.readmates.sessionrecord.application.service.SessionRecordSnapshotCodec
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.db.uuidOrNull
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.LocalDate
import java.util.UUID

@Repository
@Suppress("TooManyFunctions")
class JdbcSessionRecordAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val codec: SessionRecordSnapshotCodec,
) : SessionRecordStorePort {
    override fun lockEditor(host: CurrentMember, sessionId: UUID): SessionRecordEditor? {
        val live = loadLive(host, sessionId, forUpdate = true) ?: return null
        val draft = loadDraft(host, sessionId, forUpdate = true)
        return SessionRecordEditor(
            live = live,
            draft = draft,
            draftLiveBaseStale = draft != null && draft.baseLiveRevision != live.revision,
        )
    }

    override fun findCompletedApply(
        host: CurrentMember,
        previewId: UUID,
    ): CompletedSessionRecordApply? =
        jdbcTemplate.query(
            """
            select p.id as preview_id,
                   p.expected_draft_revision,
                   p.expected_live_revision,
                   d.id as decision_id,
                   d.decision,
                   d.event_id,
                   r.id, r.session_id, r.club_id, r.version, r.source, r.restored_from_revision_id,
                   r.snapshot_json, r.applied_by_membership_id, r.applied_at
            from host_action_notification_previews p
            join host_action_notification_decisions d
              on d.preview_id = p.id and d.club_id = p.club_id and d.session_id = p.session_id
            join session_record_revisions r
              on r.club_id = d.club_id and r.session_id = d.session_id and r.version = d.live_revision
            where p.id = ?
              and p.club_id = ?
              and p.host_membership_id = ?
              and p.action_type = 'RECORD_APPLY'
            """.trimIndent(),
            { rs, _ ->
                CompletedSessionRecordApply(
                    previewId = rs.uuid("preview_id"),
                    expectedDraftRevision = rs.getLong("expected_draft_revision"),
                    expectedLiveRevision = rs.getLong("expected_live_revision"),
                    notificationDecision = NotificationDecision.valueOf(rs.getString("decision")),
                    decisionId = rs.uuid("decision_id"),
                    eventId = rs.uuidOrNull("event_id"),
                    revision = revision(rs),
                )
            },
            previewId.dbString(),
            host.clubId.dbString(),
            host.membershipId.dbString(),
        ).firstOrNull()

    override fun insertBaselineIfAbsent(
        host: CurrentMember,
        live: LiveSessionRecord,
        encoded: EncodedSessionRecordSnapshot,
    ) {
        if (live.revision != 0L) return
        jdbcTemplate.update(
            """
            insert into session_record_revisions (
              id, session_id, club_id, version, source, restored_from_revision_id,
              snapshot_json, snapshot_sha256, applied_by_membership_id
            )
            select ?, ?, ?, 1, 'BASELINE', null, ?, ?, ?
            where not exists (
              select 1 from session_record_revisions where club_id = ? and session_id = ?
            )
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            live.sessionId.dbString(),
            host.clubId.dbString(),
            encoded.json,
            encoded.sha256,
            host.membershipId.dbString(),
            host.clubId.dbString(),
            live.sessionId.dbString(),
        )
    }

    override fun insertAppliedRevision(
        host: CurrentMember,
        editor: SessionRecordEditor,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordRevision {
        val draft = requireNotNull(editor.draft)
        val id = UUID.randomUUID()
        val version = if (editor.live.revision == 0L) 2L else editor.live.revision + 1
        jdbcTemplate.update(
            """
            insert into session_record_revisions (
              id, session_id, club_id, version, source, restored_from_revision_id,
              snapshot_json, snapshot_sha256, applied_by_membership_id
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id.dbString(),
            draft.sessionId.dbString(),
            host.clubId.dbString(),
            version,
            draft.source.name,
            draft.restoredFromRevisionId?.dbString(),
            encoded.json,
            encoded.sha256,
            host.membershipId.dbString(),
        )
        return requireNotNull(loadRevision(host, draft.sessionId, id))
    }

    override fun deleteAppliedDraft(
        host: CurrentMember,
        sessionId: UUID,
        expectedDraftRevision: Long,
    ): Boolean = deleteDraft(host, sessionId, expectedDraftRevision)

    override fun loadLive(
        host: CurrentMember,
        sessionId: UUID,
        forUpdate: Boolean,
    ): LiveSessionRecord? {
        val session =
            jdbcTemplate.query(
                """
                select s.visibility, s.number, s.book_title, s.session_date,
                       coalesce((
                         select max(r.version)
                         from session_record_revisions r
                         where r.club_id = s.club_id and r.session_id = s.id
                       ), 0) as live_revision
                from sessions s
                where s.id = ? and s.club_id = ?
                ${if (forUpdate) "for update" else ""}
                """.trimIndent(),
                { rs, _ ->
                    LiveRow(
                        visibility = rs.getString("visibility"),
                        revision = rs.getLong("live_revision"),
                        sessionNumber = rs.getInt("number"),
                        bookTitle = rs.getString("book_title"),
                        meetingDate = rs.getObject("session_date", LocalDate::class.java),
                    )
                },
                sessionId.dbString(),
                host.clubId.dbString(),
            ).singleOrNull()
                ?: return null

        val publicationSummary =
            jdbcTemplate.query(
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
        return LiveSessionRecord(
            sessionId = sessionId,
            clubId = host.clubId,
            revision = session.revision,
            snapshot =
                SessionRecordSnapshot(
                    visibility = SessionRecordVisibility.valueOf(session.visibility),
                    publicationSummary = publicationSummary,
                    highlights = highlights,
                    oneLineReviews = oneLineReviews,
                    feedbackDocument = feedback,
                ),
            sessionNumber = session.sessionNumber,
            bookTitle = session.bookTitle,
            meetingDate = session.meetingDate,
        )
    }

    override fun loadDraft(
        host: CurrentMember,
        sessionId: UUID,
        forUpdate: Boolean,
    ): SessionRecordDraft? =
        jdbcTemplate.query(
            """
            select session_id, club_id, base_live_revision, draft_revision, source, restored_from_revision_id,
                   snapshot_json, updated_by_membership_id, created_at, updated_at
            from session_record_drafts
            where club_id = ? and session_id = ?
            ${if (forUpdate) "for update" else ""}
            """.trimIndent(),
            { rs, _ -> draft(rs) },
            host.clubId.dbString(),
            sessionId.dbString(),
        ).singleOrNull()

    override fun insertDraft(
        host: CurrentMember,
        live: LiveSessionRecord,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft {
        jdbcTemplate.update(
            """
            insert into session_record_drafts (
              session_id, club_id, base_live_revision, draft_revision, source, restored_from_revision_id,
              snapshot_json, snapshot_sha256, updated_by_membership_id
            ) values (?, ?, ?, 1, 'MANUAL', null, ?, ?, ?)
            """.trimIndent(),
            live.sessionId.dbString(),
            host.clubId.dbString(),
            live.revision,
            encoded.json,
            encoded.sha256,
            host.membershipId.dbString(),
        )
        return requireNotNull(loadDraft(host, live.sessionId))
    }

    override fun compareAndSetDraft(
        host: CurrentMember,
        command: SaveSessionRecordDraftCommand,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft? {
        val expected = command.expectedDraftRevision ?: return null
        val updated =
            jdbcTemplate.update(
                """
                update session_record_drafts
                set draft_revision = draft_revision + 1,
                    source = ?,
                    restored_from_revision_id = ?,
                    snapshot_json = ?,
                    snapshot_sha256 = ?,
                    updated_by_membership_id = ?,
                    updated_at = utc_timestamp(6)
                where club_id = ? and session_id = ? and draft_revision = ?
                """.trimIndent(),
                command.source.name,
                command.restoredFromRevisionId?.dbString(),
                encoded.json,
                encoded.sha256,
                host.membershipId.dbString(),
                host.clubId.dbString(),
                command.sessionId.dbString(),
                expected,
            )
        return if (updated == 1) loadDraft(host, command.sessionId) else null
    }

    override fun deleteDraft(host: CurrentMember, sessionId: UUID, expectedDraftRevision: Long): Boolean =
        jdbcTemplate.update(
            """
            delete from session_record_drafts
            where club_id = ? and session_id = ? and draft_revision = ?
            """.trimIndent(),
            host.clubId.dbString(),
            sessionId.dbString(),
            expectedDraftRevision,
        ) == 1

    override fun loadRevision(host: CurrentMember, sessionId: UUID, revisionId: UUID): SessionRecordRevision? =
        jdbcTemplate.query(
            """
            select id, session_id, club_id, version, source, restored_from_revision_id, snapshot_json,
                   applied_by_membership_id, applied_at
            from session_record_revisions
            where id = ? and club_id = ? and session_id = ?
            """.trimIndent(),
            { rs, _ -> revision(rs) },
            revisionId.dbString(),
            host.clubId.dbString(),
            sessionId.dbString(),
        ).singleOrNull()

    override fun insertRestoredDraft(
        host: CurrentMember,
        live: LiveSessionRecord,
        revision: SessionRecordRevision,
        expectedDraftRevision: Long?,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft? {
        val updated =
            if (expectedDraftRevision == null) {
                jdbcTemplate.update(
                    """
                    insert into session_record_drafts (
                      session_id, club_id, base_live_revision, draft_revision, source, restored_from_revision_id,
                      snapshot_json, snapshot_sha256, updated_by_membership_id
                    )
                    select ?, ?, ?, 1, 'RESTORED', ?, ?, ?, ?
                    where not exists (
                      select 1 from session_record_drafts where club_id = ? and session_id = ?
                    )
                    """.trimIndent(),
                    live.sessionId.dbString(),
                    host.clubId.dbString(),
                    live.revision,
                    revision.id.dbString(),
                    encoded.json,
                    encoded.sha256,
                    host.membershipId.dbString(),
                    host.clubId.dbString(),
                    live.sessionId.dbString(),
                )
            } else {
                jdbcTemplate.update(
                    """
                    update session_record_drafts
                    set base_live_revision = ?,
                        draft_revision = draft_revision + 1,
                        source = 'RESTORED',
                        restored_from_revision_id = ?,
                        snapshot_json = ?,
                        snapshot_sha256 = ?,
                        updated_by_membership_id = ?,
                        updated_at = utc_timestamp(6)
                    where club_id = ? and session_id = ? and draft_revision = ?
                    """.trimIndent(),
                    live.revision,
                    revision.id.dbString(),
                    encoded.json,
                    encoded.sha256,
                    host.membershipId.dbString(),
                    host.clubId.dbString(),
                    live.sessionId.dbString(),
                    expectedDraftRevision,
                )
            }
        return if (updated == 1) loadDraft(host, live.sessionId) else null
    }

    private fun loadEntries(table: String, host: CurrentMember, sessionId: UUID): List<SessionRecordEntry> {
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
            { rs, _ ->
                SessionRecordEntry(
                    membershipId = rs.uuid("membership_id"),
                    authorDisplayName = rs.getString("author_display_name"),
                    text = rs.getString("text"),
                )
            },
            host.clubId.dbString(),
            sessionId.dbString(),
        )
    }

    private fun loadFeedback(host: CurrentMember, sessionId: UUID): SessionRecordFeedbackDocument =
        jdbcTemplate.query(
            """
            select file_name, coalesce(nullif(document_title, ''), file_name) as document_title, source_text
            from session_feedback_documents
            where club_id = ? and session_id = ?
            order by version desc, id desc
            limit 1
            """.trimIndent(),
            { rs, _ ->
                SessionRecordFeedbackDocument(
                    fileName = rs.getString("file_name"),
                    title = rs.getString("document_title"),
                    markdown = rs.getString("source_text"),
                )
            },
            host.clubId.dbString(),
            sessionId.dbString(),
        ).singleOrNull()
            ?: SessionRecordFeedbackDocument("feedback.md", "", "")

    private fun draft(rs: ResultSet) =
        SessionRecordDraft(
            sessionId = rs.uuid("session_id"),
            clubId = rs.uuid("club_id"),
            baseLiveRevision = rs.getLong("base_live_revision"),
            draftRevision = rs.getLong("draft_revision"),
            source = SessionRecordDraftSource.valueOf(rs.getString("source")),
            restoredFromRevisionId = rs.uuidOrNull("restored_from_revision_id"),
            snapshot = codec.decode(rs.getString("snapshot_json")),
            updatedByMembershipId = rs.uuid("updated_by_membership_id"),
            createdAt = rs.utcOffsetDateTime("created_at"),
            updatedAt = rs.utcOffsetDateTime("updated_at"),
        )

    private fun revision(rs: ResultSet) =
        SessionRecordRevision(
            id = rs.uuid("id"),
            sessionId = rs.uuid("session_id"),
            clubId = rs.uuid("club_id"),
            version = rs.getLong("version"),
            source = SessionRecordSource.valueOf(rs.getString("source")),
            restoredFromRevisionId = rs.uuidOrNull("restored_from_revision_id"),
            snapshot = codec.decode(rs.getString("snapshot_json")),
            appliedByMembershipId = rs.uuid("applied_by_membership_id"),
            appliedAt = rs.utcOffsetDateTime("applied_at"),
        )

    private data class LiveRow(
        val visibility: String,
        val revision: Long,
        val sessionNumber: Int,
        val bookTitle: String,
        val meetingDate: LocalDate,
    )
}
