package com.readmates.feedback.application.service

import com.readmates.feedback.application.FeedbackDocumentParser
import com.readmates.feedback.application.ParsedFeedbackDocument
import com.readmates.feedback.application.model.FeedbackDocumentListItemResult
import com.readmates.feedback.application.model.FeedbackDocumentResult
import com.readmates.feedback.application.model.FeedbackDocumentSessionResult
import com.readmates.feedback.application.model.FeedbackDocumentStatusResult
import com.readmates.feedback.application.model.FeedbackDocumentUploadCommand
import com.readmates.feedback.application.model.FeedbackMetadataItemResult
import com.readmates.feedback.application.model.FeedbackParticipantResult
import com.readmates.feedback.application.model.FeedbackProblemResult
import com.readmates.feedback.application.model.FeedbackRevealingQuoteResult
import com.readmates.feedback.application.model.StoredFeedbackDocumentResult
import com.readmates.feedback.application.port.`in`.AuthorizeHostFeedbackDocumentUploadUseCase
import com.readmates.feedback.application.port.`in`.GetHostFeedbackDocumentStatusUseCase
import com.readmates.feedback.application.port.`in`.GetReadableFeedbackDocumentUseCase
import com.readmates.feedback.application.port.`in`.ListMyReadableFeedbackDocumentsUseCase
import com.readmates.feedback.application.port.`in`.UploadHostFeedbackDocumentUseCase
import com.readmates.feedback.application.port.out.FeedbackDocumentStorePort
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
class FeedbackDocumentService(
    private val feedbackDocumentStorePort: FeedbackDocumentStorePort,
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
) : ListMyReadableFeedbackDocumentsUseCase,
    GetReadableFeedbackDocumentUseCase,
    GetHostFeedbackDocumentStatusUseCase,
    AuthorizeHostFeedbackDocumentUploadUseCase,
    UploadHostFeedbackDocumentUseCase {
    private val parser = FeedbackDocumentParser()

    override fun listMyReadableFeedbackDocuments(currentMember: CurrentMember): List<FeedbackDocumentListItemResult> {
        requireReadableFeedbackMember(currentMember)
        return feedbackDocumentStorePort.listLatestReadableDocuments(currentMember).mapNotNull { document ->
            val parsedDocument = parseStoredListDocument(document.sourceText)
            when {
                parsedDocument != null -> document.toListItem(parsedDocument)
                currentMember.isHost -> document.toListItem(FALLBACK_INVALID_DOCUMENT_TITLE)
                else -> null
            }
        }
    }

    override fun getReadableFeedbackDocument(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): FeedbackDocumentResult? {
        requireReadableFeedbackMember(currentMember)
        val session = feedbackDocumentStorePort.findReadableSession(currentMember.clubId, sessionId) ?: return null

        if (!currentMember.isHost && !feedbackDocumentStorePort.hasActiveAttendedSession(currentMember, sessionId)) {
            throw AccessDeniedException("Feedback document access denied")
        }

        val document = feedbackDocumentStorePort.findLatestDocument(currentMember.clubId, sessionId) ?: return null
        val parsedDocument = parseStoredDetailDocument(currentMember, document.sourceText)
        return document.toResponse(session, parsedDocument)
    }

    override fun getHostFeedbackDocumentStatus(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): FeedbackDocumentStatusResult {
        requireHostFeedbackDocumentUploadAccess(currentMember)
        feedbackDocumentStorePort.findReadableSession(currentMember.clubId, sessionId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        val document = feedbackDocumentStorePort.findLatestDocument(currentMember.clubId, sessionId)
        return FeedbackDocumentStatusResult(
            uploaded = document != null,
            fileName = document?.fileName,
            uploadedAt = document?.uploadedAt?.toString(),
        )
    }

    override fun authorizeHostFeedbackDocumentUpload(currentMember: CurrentMember) =
        requireHostFeedbackDocumentUploadAccess(currentMember)

    @Transactional
    override fun uploadHostFeedbackDocument(
        currentMember: CurrentMember,
        command: FeedbackDocumentUploadCommand,
    ): FeedbackDocumentResult {
        requireHostFeedbackDocumentUploadAccess(currentMember)
        val parsedDocument = parser.parse(command.sourceText)
        val session = feedbackDocumentStorePort.findSessionForUpload(currentMember.clubId, command.sessionId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val version = feedbackDocumentStorePort.nextDocumentVersion(currentMember.clubId, command.sessionId)
        feedbackDocumentStorePort.insertDocument(
            currentMember = currentMember,
            command = command,
            version = version,
            documentId = UUID.randomUUID(),
        )
        recordNotificationEventUseCase.recordFeedbackDocumentPublished(
            clubId = currentMember.clubId,
            sessionId = command.sessionId,
        )

        val storedDocument = feedbackDocumentStorePort.findLatestDocument(currentMember.clubId, command.sessionId)
            ?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR)
        return storedDocument.toResponse(session, parsedDocument)
    }

    private fun requireHostFeedbackDocumentUploadAccess(currentMember: CurrentMember) {
        if (!currentMember.isHost) {
            throw AccessDeniedException("Host role required")
        }
    }

    private fun requireReadableFeedbackMember(currentMember: CurrentMember) {
        if (!currentMember.isActive) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Feedback documents require active membership")
        }
    }

    private fun parseStoredListDocument(sourceText: String): ParsedFeedbackDocument? =
        runCatching { parser.parse(sourceText) }
            .getOrNull()

    private fun parseStoredDetailDocument(
        currentMember: CurrentMember,
        sourceText: String,
    ): ParsedFeedbackDocument =
        runCatching { parser.parse(sourceText) }
            .getOrElse {
                val reason = if (currentMember.isHost) {
                    FALLBACK_INVALID_DOCUMENT_TITLE
                } else {
                    "피드백 문서를 불러올 수 없습니다."
                }
                throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, reason)
            }

    private fun StoredFeedbackDocumentResult.toListItem(parsedDocument: ParsedFeedbackDocument): FeedbackDocumentListItemResult =
        FeedbackDocumentListItemResult(
            sessionId = sessionId.toString(),
            sessionNumber = sessionNumber,
            title = parsedDocument.title,
            bookTitle = bookTitle,
            date = date.toString(),
            fileName = fileName,
            uploadedAt = uploadedAt.toString(),
        )

    private fun StoredFeedbackDocumentResult.toListItem(title: String): FeedbackDocumentListItemResult =
        FeedbackDocumentListItemResult(
            sessionId = sessionId.toString(),
            sessionNumber = sessionNumber,
            title = title,
            bookTitle = bookTitle,
            date = date.toString(),
            fileName = fileName,
            uploadedAt = uploadedAt.toString(),
        )

    private fun StoredFeedbackDocumentResult.toResponse(
        session: FeedbackDocumentSessionResult,
        parsedDocument: ParsedFeedbackDocument,
    ): FeedbackDocumentResult =
        FeedbackDocumentResult(
            sessionId = session.sessionId.toString(),
            sessionNumber = session.sessionNumber,
            title = parsedDocument.title,
            subtitle = parsedDocument.subtitle,
            bookTitle = session.bookTitle,
            date = session.date.toString(),
            fileName = fileName,
            uploadedAt = uploadedAt.toString(),
            metadata = parsedDocument.metadata.map { FeedbackMetadataItemResult(it.label, it.value) },
            observerNotes = parsedDocument.observerNotes,
            participants = parsedDocument.participants.map { participant ->
                FeedbackParticipantResult(
                    number = participant.number,
                    name = participant.name,
                    role = participant.role,
                    style = participant.styleParagraphs,
                    contributions = participant.contributionBullets,
                    problems = participant.problems.map { problem ->
                        FeedbackProblemResult(
                            title = problem.title,
                            core = problem.core,
                            evidence = problem.evidence,
                            interpretation = problem.interpretation,
                        )
                    },
                    actionItems = participant.actionItems,
                    revealingQuote = FeedbackRevealingQuoteResult(
                        quote = participant.revealingQuote.quote,
                        context = participant.revealingQuote.context,
                        note = participant.revealingQuote.note,
                    ),
                )
            },
        )

    private companion object {
        private const val FALLBACK_INVALID_DOCUMENT_TITLE = "문서 형식 확인 필요"
    }
}
