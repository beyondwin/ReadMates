package com.readmates.sessionimport.application.port.`in`

import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import com.readmates.sessionimport.application.model.SessionImportPreviewResult

interface PreviewSessionImportUseCase {
    fun preview(command: SessionImportCommand): SessionImportPreviewResult
}

interface CommitSessionImportUseCase {
    fun commit(command: SessionImportCommand): SessionImportCommitResult
}

/**
 * Commits a session import using a command that the caller has already validated
 * (e.g. the AI generation flow, which re-runs SessionImportV1Validator before invoking this).
 *
 * Trust boundary: implementations skip the standard validate(...) step but still load the
 * target session and run the same record-replacement + cache-invalidation tail as
 * [CommitSessionImportUseCase.commit]. Callers MUST validate the command first.
 */
interface CommitValidatedSessionImportUseCase {
    fun commitValidated(input: ValidatedSessionImportInput): SessionImportCommitResult
}

/**
 * A [SessionImportCommand] whose caller has already validated it against the target session.
 */
data class ValidatedSessionImportInput(
    val command: SessionImportCommand,
)
