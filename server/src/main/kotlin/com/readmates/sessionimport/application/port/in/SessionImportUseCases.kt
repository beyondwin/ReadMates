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
