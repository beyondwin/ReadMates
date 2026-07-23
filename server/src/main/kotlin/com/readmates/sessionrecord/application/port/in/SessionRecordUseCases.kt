package com.readmates.sessionrecord.application.port.`in`

import com.readmates.sessionrecord.application.model.ApplySessionRecordCommand
import com.readmates.sessionrecord.application.model.HostSessionHistoryItem
import com.readmates.sessionrecord.application.model.PreviewSessionRecordApplyCommand
import com.readmates.sessionrecord.application.model.RestoreSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordApplyPreview
import com.readmates.sessionrecord.application.model.SessionRecordApplyResult
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AuthenticatedClubActor
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface ManageSessionRecordDraftUseCase {
    fun getEditor(host: AuthenticatedClubActor, sessionId: UUID): SessionRecordEditor

    fun save(host: CurrentMember, command: SaveSessionRecordDraftCommand): SessionRecordDraft

    fun saveValidatedSnapshot(
        host: AuthenticatedClubActor,
        command: SaveSessionRecordDraftCommand,
    ): SessionRecordDraft

    fun discard(host: CurrentMember, sessionId: UUID, expectedDraftRevision: Long)

    fun restore(host: CurrentMember, command: RestoreSessionRecordDraftCommand): SessionRecordDraft
}

interface ApplySessionRecordUseCase {
    fun preview(host: CurrentMember, command: PreviewSessionRecordApplyCommand): SessionRecordApplyPreview

    fun apply(host: CurrentMember, command: ApplySessionRecordCommand): SessionRecordApplyResult
}

interface GetHostSessionHistoryUseCase {
    fun history(
        host: CurrentMember,
        sessionId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<HostSessionHistoryItem>
}
