package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.sessionrecord.application.model.ApplySessionRecordCommand
import com.readmates.sessionrecord.application.model.CompletedSessionRecordApply
import com.readmates.sessionrecord.application.model.EncodedSessionRecordSnapshot
import com.readmates.sessionrecord.application.model.SessionRecordApplyReceipt
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordRevision
import com.readmates.sessionrecord.application.port.out.SessionRecordApplyStorePort
import com.readmates.sessionrecord.application.port.out.SessionRecordDraftStorePort
import com.readmates.sessionrecord.application.port.out.SessionRecordReadStorePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.db.uuidOrNull
import com.readmates.shared.security.AuthenticatedClubActor
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

internal class JdbcSessionRecordApplyStore(
    private val jdbcTemplate: JdbcTemplate,
    private val readStore: SessionRecordReadStorePort,
    private val draftStore: SessionRecordDraftStorePort,
    private val rows: SessionRecordPersistenceRows,
) : SessionRecordApplyStorePort {
    override fun lockEditor(
        host: AuthenticatedClubActor,
        sessionId: UUID,
    ): SessionRecordEditor? {
        val live = readStore.loadLive(host, sessionId, forUpdate = true) ?: return null
        val draft = readStore.loadDraft(host, sessionId, forUpdate = true)
        return SessionRecordEditor(
            live = live,
            draft = draft,
            draftLiveBaseStale =
                draft != null &&
                    (
                        draft.baseLiveRevision != live.revision ||
                            draft.baseSessionUpdatedAt != live.sessionUpdatedAt
                    ),
        )
    }

    override fun findCompletedApply(
        host: AuthenticatedClubActor,
        previewId: UUID,
    ): CompletedSessionRecordApply? =
        jdbcTemplate
            .query(
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
                        revision = rows.revision(rs),
                    )
                },
                previewId.dbString(),
                host.clubId.dbString(),
                host.membershipId.dbString(),
            ).firstOrNull()

    override fun findApplyReceipt(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        applyRequestId: UUID,
        forUpdate: Boolean,
    ): SessionRecordApplyReceipt? =
        jdbcTemplate
            .query(
                """
                select a.apply_request_id,
                       a.host_membership_id,
                       a.expected_draft_revision,
                       a.expected_live_revision,
                       a.draft_sha256,
                       a.composer_event_type,
                       r.id, r.session_id, r.club_id, r.version, r.source, r.restored_from_revision_id,
                       r.snapshot_json, r.applied_by_membership_id, r.applied_at
                from session_record_apply_receipts a
                join session_record_revisions r
                  on r.id = a.revision_id
                 and r.club_id = a.club_id
                 and r.session_id = a.session_id
                where a.club_id = ?
                  and a.session_id = ?
                  and a.apply_request_id = ?
                ${if (forUpdate) "for update" else ""}
                """.trimIndent(),
                { rs, _ ->
                    SessionRecordApplyReceipt(
                        applyRequestId = rs.uuid("apply_request_id"),
                        hostMembershipId = rs.uuid("host_membership_id"),
                        expectedDraftRevision = rs.getLong("expected_draft_revision"),
                        expectedLiveRevision = rs.getLong("expected_live_revision"),
                        draftSha256 = rs.getString("draft_sha256"),
                        composerEventType = NotificationEventType.valueOf(rs.getString("composer_event_type")),
                        revision = rows.revision(rs),
                    )
                },
                host.clubId.dbString(),
                sessionId.dbString(),
                applyRequestId.dbString(),
            ).singleOrNull()

    override fun insertApplyReceipt(
        host: AuthenticatedClubActor,
        command: ApplySessionRecordCommand,
        draftSha256: String,
        composerEventType: NotificationEventType,
        revision: SessionRecordRevision,
    ): SessionRecordApplyReceipt {
        val applyRequestId = requireNotNull(command.applyRequestId)
        jdbcTemplate.update(
            """
            insert into session_record_apply_receipts (
              id, apply_request_id, club_id, session_id, host_membership_id,
              expected_draft_revision, expected_live_revision, draft_sha256,
              composer_event_type, revision_id
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            applyRequestId.dbString(),
            host.clubId.dbString(),
            command.sessionId.dbString(),
            host.membershipId.dbString(),
            command.expectedDraftRevision,
            command.expectedLiveRevision,
            draftSha256,
            composerEventType.name,
            revision.id.dbString(),
        )
        return requireNotNull(findApplyReceipt(host, command.sessionId, applyRequestId))
    }

    override fun insertAppliedRevision(
        host: AuthenticatedClubActor,
        editor: SessionRecordEditor,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordRevision {
        val draft = requireNotNull(editor.draft)
        val id = UUID.randomUUID()
        val nextVersion = editor.live.revision + 1L
        jdbcTemplate.update(
            INSERT_APPLIED_REVISION_SQL,
            id.dbString(),
            draft.sessionId.dbString(),
            host.clubId.dbString(),
            nextVersion,
            draft.source.name,
            draft.restoredFromRevisionId?.dbString(),
            encoded.json,
            encoded.sha256,
            host.membershipId.dbString(),
        )
        return requireNotNull(readStore.loadRevision(host, draft.sessionId, id))
    }

    override fun deleteAppliedDraft(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        expectedDraftRevision: Long,
    ): Boolean = draftStore.deleteDraft(host, sessionId, expectedDraftRevision)

    @Suppress("MaxLineLength")
    private companion object {
        const val INSERT_APPLIED_REVISION_SQL =
            "insert into session_record_revisions (id, session_id, club_id, version, source, restored_from_revision_id, snapshot_json, snapshot_sha256, applied_by_membership_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    }
}
