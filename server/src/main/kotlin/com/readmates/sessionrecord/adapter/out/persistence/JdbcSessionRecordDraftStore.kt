package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.sessionrecord.application.model.EncodedSessionRecordSnapshot
import com.readmates.sessionrecord.application.model.LiveSessionRecord
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordRevision
import com.readmates.sessionrecord.application.port.out.SessionRecordDraftStorePort
import com.readmates.sessionrecord.application.port.out.SessionRecordReadStorePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.security.AuthenticatedClubActor
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

internal class JdbcSessionRecordDraftStore(
    private val jdbcTemplate: JdbcTemplate,
    private val readStore: SessionRecordReadStorePort,
) : SessionRecordDraftStorePort {
    override fun insertDraft(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        command: SaveSessionRecordDraftCommand,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft {
        jdbcTemplate.update(
            """
            insert into session_record_drafts (
              session_id, club_id, base_live_revision, base_session_updated_at,
              draft_revision, source, restored_from_revision_id,
              snapshot_json, snapshot_sha256, updated_by_membership_id
            ) values (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
            """.trimIndent(),
            live.sessionId.dbString(),
            host.clubId.dbString(),
            live.revision,
            live.sessionUpdatedAt.toUtcLocalDateTime(),
            command.source.name,
            command.restoredFromRevisionId?.dbString(),
            encoded.json,
            encoded.sha256,
            host.membershipId.dbString(),
        )
        return requireNotNull(readStore.loadDraft(host, live.sessionId))
    }

    override fun compareAndSetDraft(
        host: AuthenticatedClubActor,
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
        return if (updated == 1) readStore.loadDraft(host, command.sessionId) else null
    }

    override fun rebaseDraft(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        expectedDraftRevision: Long,
    ): SessionRecordDraft? {
        val updated =
            jdbcTemplate.update(
                """
                update session_record_drafts
                set base_live_revision = ?,
                    base_session_updated_at = ?,
                    draft_revision = draft_revision + 1,
                    updated_by_membership_id = ?,
                    updated_at = utc_timestamp(6)
                where club_id = ? and session_id = ? and draft_revision = ?
                """.trimIndent(),
                live.revision,
                live.sessionUpdatedAt.toUtcLocalDateTime(),
                host.membershipId.dbString(),
                host.clubId.dbString(),
                live.sessionId.dbString(),
                expectedDraftRevision,
            )
        return if (updated == 1) readStore.loadDraft(host, live.sessionId) else null
    }

    override fun deleteDraft(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        expectedDraftRevision: Long,
    ): Boolean =
        jdbcTemplate.update(
            """
            delete from session_record_drafts
            where club_id = ? and session_id = ? and draft_revision = ?
            """.trimIndent(),
            host.clubId.dbString(),
            sessionId.dbString(),
            expectedDraftRevision,
        ) == 1

    override fun insertRestoredDraft(
        host: AuthenticatedClubActor,
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
                      session_id, club_id, base_live_revision, base_session_updated_at,
                      draft_revision, source, restored_from_revision_id,
                      snapshot_json, snapshot_sha256, updated_by_membership_id
                    )
                    select ?, ?, ?, ?, 1, 'RESTORED', ?, ?, ?, ?
                    where not exists (
                      select 1 from session_record_drafts where club_id = ? and session_id = ?
                    )
                    """.trimIndent(),
                    live.sessionId.dbString(),
                    host.clubId.dbString(),
                    live.revision,
                    live.sessionUpdatedAt.toUtcLocalDateTime(),
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
                        base_session_updated_at = ?,
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
                    live.sessionUpdatedAt.toUtcLocalDateTime(),
                    revision.id.dbString(),
                    encoded.json,
                    encoded.sha256,
                    host.membershipId.dbString(),
                    host.clubId.dbString(),
                    live.sessionId.dbString(),
                    expectedDraftRevision,
                )
            }
        return if (updated == 1) readStore.loadDraft(host, live.sessionId) else null
    }
}
