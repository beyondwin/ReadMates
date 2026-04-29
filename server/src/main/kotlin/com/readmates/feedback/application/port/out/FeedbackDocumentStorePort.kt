package com.readmates.feedback.application.port.out

import com.readmates.feedback.application.model.FeedbackDocumentSessionResult
import com.readmates.feedback.application.model.FeedbackDocumentUploadCommand
import com.readmates.feedback.application.model.StoredFeedbackDocumentListResult
import com.readmates.feedback.application.model.StoredFeedbackDocumentResult
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface FeedbackDocumentStorePort {
    fun listLatestReadableDocuments(currentMember: CurrentMember): List<StoredFeedbackDocumentListResult>

    fun findReadableSession(
        clubId: UUID,
        sessionId: UUID,
    ): FeedbackDocumentSessionResult?

    fun hasActiveAttendedSession(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): Boolean

    fun findLatestDocument(
        clubId: UUID,
        sessionId: UUID,
    ): StoredFeedbackDocumentResult?

    fun findSessionForUpload(
        clubId: UUID,
        sessionId: UUID,
    ): FeedbackDocumentSessionResult?

    fun nextDocumentVersion(
        clubId: UUID,
        sessionId: UUID,
    ): Int

    fun insertDocument(
        currentMember: CurrentMember,
        command: FeedbackDocumentUploadCommand,
        version: Int,
        documentId: UUID,
        title: String,
    )
}
