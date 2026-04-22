package com.readmates.feedback.api

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.feedback.application.FeedbackDocumentRepository
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.UUID

data class FeedbackDocumentListItem(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val date: String,
    val fileName: String,
    val uploadedAt: String,
)

data class FeedbackDocumentResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val subtitle: String,
    val bookTitle: String,
    val date: String,
    val fileName: String,
    val uploadedAt: String,
    val metadata: List<FeedbackMetadataItem>,
    val observerNotes: List<String>,
    val participants: List<FeedbackParticipant>,
)

data class FeedbackMetadataItem(
    val label: String,
    val value: String,
)

data class FeedbackParticipant(
    val number: Int,
    val name: String,
    val role: String,
    val style: List<String>,
    val contributions: List<String>,
    val problems: List<FeedbackProblem>,
    val actionItems: List<String>,
    val revealingQuote: FeedbackRevealingQuote,
)

data class FeedbackProblem(
    val title: String,
    val core: String,
    val evidence: String,
    val interpretation: String,
)

data class FeedbackRevealingQuote(
    val quote: String,
    val context: String,
    val note: String,
)

data class FeedbackDocumentStatus(
    val uploaded: Boolean,
    val fileName: String?,
    val uploadedAt: String?,
)

@RestController
class FeedbackDocumentController(
    private val memberAccountRepository: MemberAccountRepository,
    private val feedbackDocumentRepository: FeedbackDocumentRepository,
) {
    @GetMapping("/api/feedback-documents/me")
    fun myFeedbackDocuments(authentication: Authentication?): List<FeedbackDocumentListItem> =
        feedbackDocumentRepository.listReadableDocuments(readableFeedbackMember(authentication))

    @GetMapping("/api/sessions/{sessionId}/feedback-document")
    fun feedbackDocument(
        authentication: Authentication?,
        @PathVariable sessionId: String,
    ): FeedbackDocumentResponse =
        feedbackDocumentRepository.findReadableDocument(readableFeedbackMember(authentication), parseSessionId(sessionId))
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/api/host/sessions/{sessionId}/feedback-document")
    fun hostFeedbackDocumentStatus(
        authentication: Authentication?,
        @PathVariable sessionId: String,
    ): FeedbackDocumentStatus =
        feedbackDocumentRepository.findHostStatus(currentMember(authentication), parseSessionId(sessionId))

    @PostMapping(
        "/api/host/sessions/{sessionId}/feedback-document",
        consumes = [MediaType.MULTIPART_FORM_DATA_VALUE],
    )
    @ResponseStatus(HttpStatus.CREATED)
    fun uploadFeedbackDocument(
        authentication: Authentication?,
        @PathVariable sessionId: String,
        @RequestParam("file") file: MultipartFile,
    ): FeedbackDocumentResponse {
        val host = currentMember(authentication)
        val sessionUuid = parseSessionId(sessionId)
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        val storedFileName = validatedFileName(file.originalFilename)
        val contentType = contentTypeFor(storedFileName)
        val sourceText = decodeUtf8(file)
        if (sourceText.isBlank()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, EMPTY_DOCUMENT_MESSAGE)
        }

        return feedbackDocumentRepository.saveDocument(
            host = host,
            sessionId = sessionUuid,
            fileName = storedFileName,
            contentType = contentType,
            sourceText = sourceText,
            fileSize = file.size,
        )
    }

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }

    private fun readableFeedbackMember(authentication: Authentication?): CurrentMember {
        val member = currentMember(authentication)
        if (member.isViewer) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Feedback documents require full membership")
        }
        return member
    }

    private fun parseSessionId(value: String): UUID =
        runCatching { UUID.fromString(value) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }

    private fun validatedFileName(originalFilename: String?): String {
        val fileName = originalFilename
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, UNSUPPORTED_FILE_MESSAGE)
        if (
            fileName.length > MAX_FILE_NAME_LENGTH ||
            fileName.contains('/') ||
            fileName.contains('\\') ||
            fileName.contains(NUL)
        ) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, UNSUPPORTED_FILE_MESSAGE)
        }
        val lowercaseFileName = fileName.lowercase(Locale.ROOT)
        if (!lowercaseFileName.endsWith(".md") && !lowercaseFileName.endsWith(".txt")) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, UNSUPPORTED_FILE_MESSAGE)
        }
        return fileName
    }

    private fun contentTypeFor(fileName: String): String =
        when {
            fileName.lowercase(Locale.ROOT).endsWith(".md") -> "text/markdown"
            fileName.lowercase(Locale.ROOT).endsWith(".txt") -> "text/plain"
            else -> throw ResponseStatusException(HttpStatus.BAD_REQUEST, UNSUPPORTED_FILE_MESSAGE)
        }

    private fun decodeUtf8(file: MultipartFile): String {
        if (file.isEmpty || file.size <= 0) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, EMPTY_DOCUMENT_MESSAGE)
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "피드백 문서는 512KB 이하만 업로드할 수 있습니다.")
        }

        val sourceText = try {
            StandardCharsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(file.bytes))
                .toString()
        } catch (ex: CharacterCodingException) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "문서를 UTF-8 텍스트로 읽을 수 없습니다.")
        }
        if (sourceText.contains(NUL)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "문서를 UTF-8 텍스트로 읽을 수 없습니다.")
        }
        return sourceText
    }

    private companion object {
        private const val MAX_FILE_SIZE_BYTES = 512L * 1024L
        private const val MAX_FILE_NAME_LENGTH = 255
        private const val NUL = '\u0000'
        private const val EMPTY_DOCUMENT_MESSAGE = "피드백 문서가 비어 있습니다."
        private const val UNSUPPORTED_FILE_MESSAGE = ".md 또는 .txt 파일만 업로드할 수 있습니다."
    }
}
