package com.readmates.feedback.application.port.`in`

import com.readmates.feedback.application.model.FeedbackDocumentListItemResult
import com.readmates.feedback.application.model.FeedbackDocumentResult
import com.readmates.feedback.application.model.FeedbackDocumentStatusResult
import com.readmates.feedback.application.model.FeedbackDocumentUploadCommand
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface ListMyReadableFeedbackDocumentsUseCase {
    fun listMyReadableFeedbackDocuments(currentMember: CurrentMember): List<FeedbackDocumentListItemResult>
}

interface GetReadableFeedbackDocumentUseCase {
    fun getReadableFeedbackDocument(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): FeedbackDocumentResult?
}

interface GetHostFeedbackDocumentStatusUseCase {
    fun getHostFeedbackDocumentStatus(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): FeedbackDocumentStatusResult
}

interface AuthorizeHostFeedbackDocumentUploadUseCase {
    fun authorizeHostFeedbackDocumentUpload(currentMember: CurrentMember)
}

interface UploadHostFeedbackDocumentUseCase {
    fun uploadHostFeedbackDocument(
        currentMember: CurrentMember,
        command: FeedbackDocumentUploadCommand,
    ): FeedbackDocumentResult
}
