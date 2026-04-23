package com.readmates.feedback.adapter.`in`.web

import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.util.Locale

data class ValidatedFeedbackDocumentUpload(
    val fileName: String,
    val contentType: String,
    val sourceText: String,
    val fileSize: Long,
)

@Component
class FeedbackDocumentUploadValidator {
    fun validate(file: MultipartFile): ValidatedFeedbackDocumentUpload {
        val storedFileName = validatedFileName(file.originalFilename)
        val contentType = contentTypeFor(storedFileName)
        val sourceText = decodeUtf8(file)
        if (sourceText.isBlank()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, EMPTY_DOCUMENT_MESSAGE)
        }

        return ValidatedFeedbackDocumentUpload(
            fileName = storedFileName,
            contentType = contentType,
            sourceText = sourceText,
            fileSize = file.size,
        )
    }

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
