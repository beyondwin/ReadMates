package com.readmates.feedback.application.service

import com.readmates.feedback.application.FeedbackDocumentError
import com.readmates.feedback.application.FeedbackDocumentException
import com.readmates.feedback.application.FeedbackDocumentParser
import com.readmates.feedback.application.ParsedFeedbackDocument
import com.readmates.feedback.application.model.FeedbackDocumentListItemResult
import com.readmates.feedback.application.model.FeedbackDocumentResult
import com.readmates.feedback.application.model.FeedbackDocumentSessionResult
import com.readmates.feedback.application.model.FeedbackDocumentStatusResult
import com.readmates.feedback.application.model.FeedbackMetadataItemResult
import com.readmates.feedback.application.model.FeedbackParticipantResult
import com.readmates.feedback.application.model.FeedbackProblemResult
import com.readmates.feedback.application.model.FeedbackRevealingQuoteResult
import com.readmates.feedback.application.model.StoredFeedbackDocumentListResult
import com.readmates.feedback.application.model.StoredFeedbackDocumentResult
import com.readmates.feedback.application.port.`in`.GetHostFeedbackDocumentPreviewUseCase
import com.readmates.feedback.application.port.`in`.GetHostFeedbackDocumentStatusUseCase
import com.readmates.feedback.application.port.`in`.GetReadableFeedbackDocumentUseCase
import com.readmates.feedback.application.port.`in`.ListMyReadableFeedbackDocumentsUseCase
import com.readmates.feedback.application.port.out.FeedbackDocumentStorePort
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class FeedbackDocumentService(
    private val feedbackDocumentStorePort: FeedbackDocumentStorePort,
) : ListMyReadableFeedbackDocumentsUseCase,
    GetReadableFeedbackDocumentUseCase,
    GetHostFeedbackDocumentPreviewUseCase,
    GetHostFeedbackDocumentStatusUseCase {
    private val parser = FeedbackDocumentParser()

    override fun listMyReadableFeedbackDocuments(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<FeedbackDocumentListItemResult> {
        requireReadableFeedbackMember(currentMember)
        val page = feedbackDocumentStorePort.listLatestReadableDocuments(currentMember, pageRequest)
        return CursorPage(
            items =
                page.items.mapNotNull { document ->
                    when {
                        document.title != null -> document.toListItem(document.title)
                        document.legacySourceText != null -> {
                            val parsedDocument = parseStoredListDocument(document.legacySourceText)
                            when {
                                parsedDocument != null -> document.toListItem(parsedDocument.title)
                                currentMember.isHost -> document.toListItem(FALLBACK_INVALID_DOCUMENT_TITLE)
                                else -> null
                            }
                        }
                        currentMember.isHost -> document.toListItem(FALLBACK_INVALID_DOCUMENT_TITLE)
                        else -> null
                    }
                },
            nextCursor = page.nextCursor,
        )
    }

    override fun getReadableFeedbackDocument(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): FeedbackDocumentResult? {
        requireReadableFeedbackMember(currentMember)
        val session = feedbackDocumentStorePort.findReadableSession(currentMember.clubId, sessionId) ?: return null

        val document = feedbackDocumentStorePort.findLatestDocument(currentMember.clubId, sessionId) ?: return null
        val parsedDocument = parseStoredDetailDocument(currentMember, document.sourceText)
        return document.toResponse(session, parsedDocument)
    }

    override fun getHostFeedbackDocumentPreview(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): FeedbackDocumentResult? {
        requireHostFeedbackDocumentAccess(currentMember)
        return feedbackDocumentStorePort.findSession(currentMember.clubId, sessionId)?.let { session ->
            feedbackDocumentStorePort.findLatestDocument(currentMember.clubId, sessionId)?.let { document ->
                val parsedDocument = parseStoredDetailDocument(currentMember, document.sourceText)
                document.toResponse(session, parsedDocument)
            }
        }
    }

    override fun getHostFeedbackDocumentStatus(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): FeedbackDocumentStatusResult {
        requireHostFeedbackDocumentAccess(currentMember)
        feedbackDocumentStorePort.findReadableSession(currentMember.clubId, sessionId)
            ?: throw FeedbackDocumentException(FeedbackDocumentError.NOT_FOUND, "Feedback session not found")

        val document = feedbackDocumentStorePort.findLatestDocument(currentMember.clubId, sessionId)
        return FeedbackDocumentStatusResult(
            uploaded = document != null,
            fileName = document?.fileName,
            uploadedAt = document?.uploadedAt?.toString(),
        )
    }

    private fun requireHostFeedbackDocumentAccess(currentMember: CurrentMember) {
        if (!currentMember.isHost) {
            throw AccessDeniedException("Host role required")
        }
    }

    private fun requireReadableFeedbackMember(currentMember: CurrentMember) {
        if (!currentMember.isActive) {
            throw FeedbackDocumentException(
                FeedbackDocumentError.ACTIVE_MEMBERSHIP_REQUIRED,
                "Feedback documents require active membership",
            )
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
                val reason =
                    if (currentMember.isHost) {
                        FALLBACK_INVALID_DOCUMENT_TITLE
                    } else {
                        "피드백 문서를 불러올 수 없습니다."
                    }
                throw FeedbackDocumentException(FeedbackDocumentError.INVALID_STORED_DOCUMENT, reason)
            }

    private fun StoredFeedbackDocumentListResult.toListItem(title: String): FeedbackDocumentListItemResult =
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
            participants =
                parsedDocument.participants.map { participant ->
                    FeedbackParticipantResult(
                        number = participant.number,
                        name = participant.name,
                        role = participant.role,
                        style = participant.styleParagraphs,
                        contributions = participant.contributionBullets,
                        problems =
                            participant.problems.map { problem ->
                                FeedbackProblemResult(
                                    title = problem.title,
                                    core = problem.core,
                                    evidence = problem.evidence,
                                    interpretation = problem.interpretation,
                                )
                            },
                        actionItems = participant.actionItems,
                        revealingQuote =
                            FeedbackRevealingQuoteResult(
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
