package com.readmates.sessionrecord.application.service

import com.readmates.sessionrecord.application.model.RestoreSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import com.readmates.sessionrecord.application.port.`in`.ManageSessionRecordDraftUseCase
import com.readmates.sessionrecord.application.port.out.SessionRecordStorePort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class SessionRecordDraftService(
    private val store: SessionRecordStorePort,
    private val codec: SessionRecordSnapshotCodec,
) : ManageSessionRecordDraftUseCase {
    override fun getEditor(host: CurrentMember, sessionId: UUID): SessionRecordEditor {
        requireHost(host)
        val live = requireLive(host, sessionId)
        val draft = store.loadDraft(host, sessionId)
        return SessionRecordEditor(
            live = live,
            draft = draft,
            draftLiveBaseStale = draft != null && draft.baseLiveRevision != live.revision,
        )
    }

    @Transactional
    @Suppress("ThrowsCount")
    override fun save(host: CurrentMember, command: SaveSessionRecordDraftCommand): SessionRecordDraft {
        requireHost(host)
        val live = requireLive(host, command.sessionId, forUpdate = true)
        val current = store.loadDraft(host, command.sessionId, forUpdate = true)
        val encoded = codec.encode(command.snapshot)

        if (current == null) {
            if (command.expectedDraftRevision != null) throw draftStale()
            return store.insertDraft(host, live, encoded)
        }
        if (current.draftRevision != command.expectedDraftRevision) throw draftStale()
        return store.compareAndSetDraft(host, command, encoded) ?: throw draftStale()
    }

    @Transactional
    override fun discard(host: CurrentMember, sessionId: UUID, expectedDraftRevision: Long) {
        requireHost(host)
        requireLive(host, sessionId, forUpdate = true)
        if (!store.deleteDraft(host, sessionId, expectedDraftRevision)) throw draftStale()
    }

    @Transactional
    override fun restore(host: CurrentMember, command: RestoreSessionRecordDraftCommand): SessionRecordDraft {
        requireHost(host)
        val live = requireLive(host, command.sessionId, forUpdate = true)
        val revision =
            store.loadRevision(host, command.sessionId, command.revisionId)
                ?: throw SessionRecordException(
                    SessionRecordError.REVISION_NOT_FOUND,
                    "Session record revision not found",
                )
        return store.insertRestoredDraft(
            host = host,
            live = live,
            revision = revision,
            expectedDraftRevision = command.expectedDraftRevision,
            encoded = codec.encode(revision.snapshot),
        ) ?: throw draftStale()
    }

    private fun requireLive(host: CurrentMember, sessionId: UUID, forUpdate: Boolean = false) =
        store.loadLive(host, sessionId, forUpdate)
            ?: throw SessionRecordException(SessionRecordError.SESSION_NOT_FOUND, "Session record not found")

    private fun requireHost(host: CurrentMember) {
        if (!host.isHost) throw AccessDeniedException("Host role required")
    }

    private fun draftStale() = SessionRecordException(SessionRecordError.DRAFT_STALE, "Session record draft is stale")
}
