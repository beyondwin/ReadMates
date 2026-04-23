package com.readmates.feedback.adapter.out.persistence

import com.readmates.feedback.application.FeedbackDocumentRepository
import com.readmates.feedback.application.model.FeedbackDocumentUploadCommand
import com.readmates.feedback.application.port.out.FeedbackDocumentStorePort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class LegacyFeedbackDocumentAdapter(
    private val feedbackDocumentRepository: FeedbackDocumentRepository,
) : FeedbackDocumentStorePort {
    override fun listLatestReadableDocuments(currentMember: CurrentMember) =
        feedbackDocumentRepository.listLatestReadableDocuments(currentMember)

    override fun findReadableSession(
        clubId: UUID,
        sessionId: UUID,
    ) = feedbackDocumentRepository.findReadableSession(clubId, sessionId)

    override fun hasActiveAttendedSession(
        currentMember: CurrentMember,
        sessionId: UUID,
    ) = feedbackDocumentRepository.hasActiveAttendedSession(currentMember, sessionId)

    override fun findLatestDocument(
        clubId: UUID,
        sessionId: UUID,
    ) = feedbackDocumentRepository.findLatestDocument(clubId, sessionId)

    override fun findSessionForUpload(
        clubId: UUID,
        sessionId: UUID,
    ) = feedbackDocumentRepository.findSessionForUpload(clubId, sessionId)

    override fun nextDocumentVersion(
        clubId: UUID,
        sessionId: UUID,
    ) = feedbackDocumentRepository.nextDocumentVersion(clubId, sessionId)

    override fun insertDocument(
        currentMember: CurrentMember,
        command: FeedbackDocumentUploadCommand,
        version: Int,
        documentId: UUID,
    ) {
        feedbackDocumentRepository.insertDocument(
            member = currentMember,
            command = command,
            version = version,
            documentId = documentId,
        )
    }
}
