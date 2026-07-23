package com.readmates.sessionrecord.application.port.out

import com.readmates.sessionrecord.application.model.CompletedSessionRecordApply
import com.readmates.sessionrecord.application.model.EncodedSessionRecordSnapshot
import com.readmates.sessionrecord.application.model.LiveSessionRecord
import com.readmates.sessionrecord.application.model.RestoreSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordRevision
import com.readmates.shared.security.CurrentMember
import java.util.UUID

@Suppress("TooManyFunctions")
interface SessionRecordStorePort {
    fun lockEditor(host: CurrentMember, sessionId: UUID): SessionRecordEditor?

    fun findCompletedApply(host: CurrentMember, previewId: UUID): CompletedSessionRecordApply?

    fun insertBaselineIfAbsent(
        host: CurrentMember,
        live: LiveSessionRecord,
        encoded: EncodedSessionRecordSnapshot,
    )

    fun insertAppliedRevision(
        host: CurrentMember,
        editor: SessionRecordEditor,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordRevision

    fun deleteAppliedDraft(host: CurrentMember, sessionId: UUID, expectedDraftRevision: Long): Boolean

    fun loadLive(host: CurrentMember, sessionId: UUID, forUpdate: Boolean = false): LiveSessionRecord?

    fun loadDraft(host: CurrentMember, sessionId: UUID, forUpdate: Boolean = false): SessionRecordDraft?

    fun insertDraft(
        host: CurrentMember,
        live: LiveSessionRecord,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft

    fun compareAndSetDraft(
        host: CurrentMember,
        command: SaveSessionRecordDraftCommand,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft?

    fun deleteDraft(host: CurrentMember, sessionId: UUID, expectedDraftRevision: Long): Boolean

    fun loadRevision(host: CurrentMember, sessionId: UUID, revisionId: UUID): SessionRecordRevision?

    fun insertRestoredDraft(
        host: CurrentMember,
        live: LiveSessionRecord,
        revision: SessionRecordRevision,
        expectedDraftRevision: Long?,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft?
}
