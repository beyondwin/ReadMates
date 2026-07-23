package com.readmates.sessionimport.application.port.`in`

import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import com.readmates.sessionimport.application.model.SessionImportDraftResult
import com.readmates.sessionimport.application.model.SessionImportPreviewResult
import com.readmates.sessionrecord.application.model.SessionRecordDraftSource
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import java.util.UUID

interface PreviewSessionImportUseCase {
    fun preview(command: SessionImportCommand): SessionImportPreviewResult
}

interface CommitSessionImportUseCase {
    fun commit(command: SessionImportCommand): SessionImportDraftResult
}

interface SaveValidatedSessionRecordDraftUseCase {
    fun saveValidated(input: ValidatedSessionImportDraftInput): SessionImportDraftResult
}

interface ValidateSessionImportUseCase {
    fun validate(
        command: SessionImportCommand,
        trustedAuthorBindings: Map<String, UUID> = emptyMap(),
    ): SessionImportPreviewResult
}

interface ReplaceValidatedSessionImportUseCase {
    fun replace(input: ValidatedSessionImportReplacement): SessionImportCommitResult
}

data class ValidatedSessionImportReplacement(
    val command: SessionImportCommand,
    val preview: SessionImportPreviewResult,
    val snapshot: SessionRecordSnapshot,
)

/**
 * A [SessionImportCommand] whose caller has already validated it against the target session.
 */
data class ValidatedSessionImportDraftInput(
    val command: SessionImportCommand,
    /** Trusted author binding supplied only by grounded AI commit after membership revalidation. */
    val authorMembershipIdsByName: Map<String, UUID> = emptyMap(),
    val source: SessionRecordDraftSource,
)
