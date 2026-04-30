package com.readmates.feedback.adapter.`in`.web

import com.readmates.feedback.application.model.FeedbackDocumentUploadCommand
import com.readmates.feedback.application.port.`in`.AuthorizeHostFeedbackDocumentUploadUseCase
import com.readmates.feedback.application.port.`in`.GetHostFeedbackDocumentStatusUseCase
import com.readmates.feedback.application.port.`in`.GetReadableFeedbackDocumentUseCase
import com.readmates.feedback.application.port.`in`.ListMyReadableFeedbackDocumentsUseCase
import com.readmates.feedback.application.port.`in`.UploadHostFeedbackDocumentUseCase
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
class FeedbackDocumentController(
    private val listMyReadableFeedbackDocumentsUseCase: ListMyReadableFeedbackDocumentsUseCase,
    private val getReadableFeedbackDocumentUseCase: GetReadableFeedbackDocumentUseCase,
    private val getHostFeedbackDocumentStatusUseCase: GetHostFeedbackDocumentStatusUseCase,
    private val authorizeHostFeedbackDocumentUploadUseCase: AuthorizeHostFeedbackDocumentUploadUseCase,
    private val uploadHostFeedbackDocumentUseCase: UploadHostFeedbackDocumentUseCase,
    private val feedbackDocumentUploadValidator: FeedbackDocumentUploadValidator,
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
            )
            .toWebDto()

    @GetMapping("/api/sessions/{sessionId}/feedback-document")
    fun feedbackDocument(
        currentMember: CurrentMember,
        @PathVariable sessionId: String,
    ): FeedbackDocumentResponse =
        getReadableFeedbackDocumentUseCase.getReadableFeedbackDocument(currentMember, parseSessionId(sessionId))
            ?.toWebDto()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/api/host/sessions/{sessionId}/feedback-document")
    fun hostFeedbackDocumentStatus(
        currentMember: CurrentMember,
        @PathVariable sessionId: String,
    ): FeedbackDocumentStatus =
        getHostFeedbackDocumentStatusUseCase.getHostFeedbackDocumentStatus(currentMember, parseSessionId(sessionId))
            .toWebDto()

    @PostMapping(
        "/api/host/sessions/{sessionId}/feedback-document",
        consumes = [MediaType.MULTIPART_FORM_DATA_VALUE],
    )
    @ResponseStatus(HttpStatus.CREATED)
    fun uploadFeedbackDocument(
        currentMember: CurrentMember,
        @PathVariable sessionId: String,
        @RequestParam("file") file: MultipartFile,
    ): FeedbackDocumentResponse {
        val sessionUuid = parseSessionId(sessionId)
        authorizeHostFeedbackDocumentUploadUseCase.authorizeHostFeedbackDocumentUpload(currentMember)
        val upload = feedbackDocumentUploadValidator.validate(file)

        return uploadHostFeedbackDocumentUseCase.uploadHostFeedbackDocument(
            currentMember = currentMember,
            command = FeedbackDocumentUploadCommand(
                sessionId = sessionUuid,
                fileName = upload.fileName,
                contentType = upload.contentType,
                sourceText = upload.sourceText,
                fileSize = upload.fileSize,
            ),
        ).toWebDto()
    }

    private fun parseSessionId(value: String): UUID =
        runCatching { UUID.fromString(value) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }
}
