package com.readmates.sessionimport.application.port.out

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportRecordPreview
import com.readmates.sessionimport.application.model.SessionImportTarget
import com.readmates.shared.security.AuthenticatedClubActor
import java.util.UUID

interface SessionImportWritePort {
    fun loadTarget(
        host: AuthenticatedClubActor,
        sessionId: UUID,
    ): SessionImportTarget?

    fun replaceRecords(command: SessionImportRecordReplacement): SessionImportStoredFeedbackDocument
}

data class SessionImportRecordReplacement(
    val host: AuthenticatedClubActor,
    val sessionId: UUID,
    val visibility: SessionRecordVisibility,
    val publicationSummary: String,
    val highlights: List<SessionImportRecordPreview>,
    val oneLineReviews: List<SessionImportRecordPreview>,
    val feedbackDocument: SessionImportFeedbackDocumentCommand,
    val feedbackTitle: String,
)

data class SessionImportStoredFeedbackDocument(
    val fileName: String,
    val title: String,
    val uploadedAt: String?,
    val version: Int,
)
