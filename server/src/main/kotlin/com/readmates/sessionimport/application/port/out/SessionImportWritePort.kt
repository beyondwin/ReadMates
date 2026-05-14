package com.readmates.sessionimport.application.port.out

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportRecordPreview
import com.readmates.sessionimport.application.model.SessionImportTarget
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface SessionImportWritePort {
    fun loadTarget(
        host: CurrentMember,
        sessionId: UUID,
    ): SessionImportTarget?

    fun replaceRecords(
        host: CurrentMember,
        sessionId: UUID,
        visibility: SessionRecordVisibility,
        publicationSummary: String,
        highlights: List<SessionImportRecordPreview>,
        oneLineReviews: List<SessionImportRecordPreview>,
        feedbackDocument: SessionImportFeedbackDocumentCommand,
        feedbackTitle: String,
    ): SessionImportStoredFeedbackDocument
}

data class SessionImportStoredFeedbackDocument(
    val fileName: String,
    val title: String,
    val uploadedAt: String?,
)
