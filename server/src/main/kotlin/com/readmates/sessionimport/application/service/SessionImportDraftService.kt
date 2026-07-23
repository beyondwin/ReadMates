package com.readmates.sessionimport.application.service

import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportDraftResult
import com.readmates.sessionimport.application.model.SessionImportPreviewResult
import com.readmates.sessionimport.application.port.`in`.CommitSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.SaveValidatedSessionRecordDraftUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportDraftInput
import com.readmates.sessionimport.application.port.`in`.ValidateSessionImportUseCase
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordDraftSource
import com.readmates.sessionrecord.application.port.`in`.ManageSessionRecordDraftUseCase
import org.springframework.stereotype.Service

@Service
class SessionImportDraftService(
    private val validator: ValidateSessionImportUseCase,
    private val drafts: ManageSessionRecordDraftUseCase,
) : CommitSessionImportUseCase,
    SaveValidatedSessionRecordDraftUseCase {
    override fun commit(command: SessionImportCommand): SessionImportDraftResult =
        save(
            command = command,
            preview = validator.validate(command),
            source = SessionRecordDraftSource.JSON_IMPORT,
        )

    override fun saveValidated(input: ValidatedSessionImportDraftInput): SessionImportDraftResult =
        save(
            command = input.command,
            preview = validator.validate(input.command, input.authorMembershipIdsByName),
            source = input.source,
        )

    private fun save(
        command: SessionImportCommand,
        preview: SessionImportPreviewResult,
        source: SessionRecordDraftSource,
    ): SessionImportDraftResult {
        if (!preview.valid) throw InvalidSessionImportException(preview.issues)
        val draft =
            drafts.saveValidatedSnapshot(
                command.host,
                SaveSessionRecordDraftCommand(
                    sessionId = command.sessionId,
                    snapshot = command.toCanonicalSnapshot(preview),
                    expectedDraftRevision = null,
                    source = source,
                ),
            )
        return SessionImportDraftResult(
            sessionId = draft.sessionId.toString(),
            draftRevision = draft.draftRevision,
            baseLiveRevision = draft.baseLiveRevision,
        )
    }

}
