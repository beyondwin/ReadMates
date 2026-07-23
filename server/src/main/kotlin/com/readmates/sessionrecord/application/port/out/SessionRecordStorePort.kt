package com.readmates.sessionrecord.application.port.out

import com.readmates.notification.domain.NotificationEventType
import com.readmates.sessionrecord.application.model.ApplySessionRecordCommand
import com.readmates.sessionrecord.application.model.CompletedSessionRecordApply
import com.readmates.sessionrecord.application.model.EncodedSessionRecordSnapshot
import com.readmates.sessionrecord.application.model.LiveSessionRecord
import com.readmates.sessionrecord.application.model.RestoreSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordApplyReceipt
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordRevision
import com.readmates.shared.security.AuthenticatedClubActor
import java.util.UUID

@Suppress("TooManyFunctions")
interface SessionRecordStorePort {
    fun lockEditor(
        host: AuthenticatedClubActor,
        sessionId: UUID,
    ): SessionRecordEditor?

    fun findCompletedApply(
        host: AuthenticatedClubActor,
        previewId: UUID,
    ): CompletedSessionRecordApply?

    fun findApplyReceipt(
        host: AuthenticatedClubActor,
        applyRequestId: UUID,
    ): SessionRecordApplyReceipt? = null

    fun insertApplyReceipt(
        host: AuthenticatedClubActor,
        command: ApplySessionRecordCommand,
        draftSha256: String,
        composerEventType: NotificationEventType,
        revision: SessionRecordRevision,
    ): SessionRecordApplyReceipt

    fun insertBaselineIfAbsent(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        encoded: EncodedSessionRecordSnapshot,
    )

    fun insertAppliedRevision(
        host: AuthenticatedClubActor,
        editor: SessionRecordEditor,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordRevision

    fun deleteAppliedDraft(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        expectedDraftRevision: Long,
    ): Boolean

    fun loadLive(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        forUpdate: Boolean = false,
    ): LiveSessionRecord?

    fun loadDraft(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        forUpdate: Boolean = false,
    ): SessionRecordDraft?

    fun insertDraft(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        command: SaveSessionRecordDraftCommand,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft

    fun compareAndSetDraft(
        host: AuthenticatedClubActor,
        command: SaveSessionRecordDraftCommand,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft?

    fun deleteDraft(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        expectedDraftRevision: Long,
    ): Boolean

    fun loadRevision(
        host: AuthenticatedClubActor,
        sessionId: UUID,
        revisionId: UUID,
    ): SessionRecordRevision?

    fun insertRestoredDraft(
        host: AuthenticatedClubActor,
        live: LiveSessionRecord,
        revision: SessionRecordRevision,
        expectedDraftRevision: Long?,
        encoded: EncodedSessionRecordSnapshot,
    ): SessionRecordDraft?
}
