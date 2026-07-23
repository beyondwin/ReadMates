package com.readmates.sessionimport.application.service

import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportDraftResult
import com.readmates.sessionimport.application.model.SessionImportPreviewResult
import com.readmates.sessionimport.application.port.`in`.CommitSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.SaveValidatedSessionRecordDraftUseCase
import com.readmates.sessionimport.application.port.`in`.ValidateSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportDraftInput
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
            expectedDraftRevision = command.expectedDraftRevision,
        )

    override fun saveValidated(input: ValidatedSessionImportDraftInput): SessionImportDraftResult {
        val editor = drafts.getEditor(input.command.host, input.command.sessionId)
        val historicalBindings = input.historicalBindings(editor.draft?.snapshot ?: editor.live.snapshot)
        return save(
            command = input.command,
            preview =
                validator.validate(
                    input.command,
                    input.authorMembershipIdsByName,
                    historicalBindings,
                ),
            source = input.source,
            expectedDraftRevision = input.expectedDraftRevision,
        )
    }

    private fun save(
        command: SessionImportCommand,
        preview: SessionImportPreviewResult,
        source: SessionRecordDraftSource,
        expectedDraftRevision: Long?,
    ): SessionImportDraftResult {
        if (!preview.valid) throw InvalidSessionImportException(preview.issues)
        val draft =
            drafts.saveValidatedSnapshot(
                command.host,
                SaveSessionRecordDraftCommand(
                    sessionId = command.sessionId,
                    snapshot = command.toCanonicalSnapshot(preview),
                    expectedDraftRevision = expectedDraftRevision,
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

private fun ValidatedSessionImportDraftInput.historicalBindings(
    baseline: com.readmates.sessionrecord.application.model.SessionRecordSnapshot,
): Map<String, java.util.UUID> {
    if (source == SessionRecordDraftSource.RESTORED) return authorMembershipIdsByName
    val baselineRecords = baseline.highlights + baseline.oneLineReviews
    val submittedRecords = command.highlights + command.oneLineReviews
    return authorMembershipIdsByName.filter { (authorName, membershipId) ->
        submittedRecords
            .filter { it.authorName.trim() == authorName }
            .all { submitted ->
                baselineRecords.any {
                    it.membershipId == membershipId &&
                        it.authorDisplayName == authorName &&
                        it.text == submitted.text.trim()
                }
            }
    }
}
