package com.readmates.sessionrecord.application.port.`in`

import com.readmates.sessionrecord.application.model.RestoreSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface ManageSessionRecordDraftUseCase {
    fun getEditor(host: CurrentMember, sessionId: UUID): SessionRecordEditor

    fun save(host: CurrentMember, command: SaveSessionRecordDraftCommand): SessionRecordDraft

    fun discard(host: CurrentMember, sessionId: UUID, expectedDraftRevision: Long)

    fun restore(host: CurrentMember, command: RestoreSessionRecordDraftCommand): SessionRecordDraft
}
