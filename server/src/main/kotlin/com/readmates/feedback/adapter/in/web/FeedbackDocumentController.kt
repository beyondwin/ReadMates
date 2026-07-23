package com.readmates.feedback.adapter.`in`.web

import com.readmates.feedback.application.port.`in`.GetHostFeedbackDocumentPreviewUseCase
import com.readmates.feedback.application.port.`in`.GetHostFeedbackDocumentStatusUseCase
import com.readmates.feedback.application.port.`in`.GetReadableFeedbackDocumentUseCase
import com.readmates.feedback.application.port.`in`.ListMyReadableFeedbackDocumentsUseCase
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
class FeedbackDocumentController(
    private val listMyReadableFeedbackDocumentsUseCase: ListMyReadableFeedbackDocumentsUseCase,
    private val getReadableFeedbackDocumentUseCase: GetReadableFeedbackDocumentUseCase,
    private val getHostFeedbackDocumentPreviewUseCase: GetHostFeedbackDocumentPreviewUseCase,
    private val getHostFeedbackDocumentStatusUseCase: GetHostFeedbackDocumentStatusUseCase,
) {
    @GetMapping("/api/feedback-documents/me")
    fun myFeedbackDocuments(
        currentMember: CurrentMember,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): FeedbackDocumentListPage =
        listMyReadableFeedbackDocumentsUseCase
            .listMyReadableFeedbackDocuments(
                currentMember,
                PageRequest.cursor(limit, cursor, defaultLimit = 30, maxLimit = 100),
            ).toWebDto()

    @GetMapping("/api/sessions/{sessionId}/feedback-document")
    fun feedbackDocument(
        currentMember: CurrentMember,
        @PathVariable sessionId: String,
    ): FeedbackDocumentResponse =
        getReadableFeedbackDocumentUseCase
            .getReadableFeedbackDocument(currentMember, parseSessionId(sessionId))
            ?.toWebDto()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/api/host/sessions/{sessionId}/feedback-document/preview")
    fun hostFeedbackDocumentPreview(
        currentMember: CurrentMember,
        @PathVariable sessionId: String,
    ): FeedbackDocumentResponse =
        getHostFeedbackDocumentPreviewUseCase
            .getHostFeedbackDocumentPreview(currentMember, parseSessionId(sessionId))
            ?.toWebDto()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/api/host/sessions/{sessionId}/feedback-document")
    fun hostFeedbackDocumentStatus(
        currentMember: CurrentMember,
        @PathVariable sessionId: String,
    ): FeedbackDocumentStatus =
        getHostFeedbackDocumentStatusUseCase
            .getHostFeedbackDocumentStatus(currentMember, parseSessionId(sessionId))
            .toWebDto()

    private fun parseSessionId(value: String): UUID =
        runCatching { UUID.fromString(value) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }
}
