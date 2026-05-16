package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.messaging.AiGenerationJobPublishException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.shared.security.AccessDeniedException
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MaxUploadSizeExceededException

/**
 * Exception thrown by the AI generation controller / use cases that
 * carries a stable [ErrorCode]. The handler maps each code to an HTTP
 * status per spec §9.2 and emits an RFC 7807 problem-detail body.
 */
class AiGenerationException(
    val code: ErrorCode,
    message: String? = null,
) : RuntimeException(message ?: code.name)

private const val INTERNAL_ERROR_DETAIL = "internal error"

/**
 * REST advice scoped to [AiGenerationController]. Translates domain
 * exceptions into RFC 7807 problem-detail JSON with the contract
 *   { type, title, status, detail, code }
 * — matching the spec §7/§9.2 wire format. `detail` is intentionally
 * scrubbed for the catch-all path to avoid leaking transcript text or
 * other PII through the exception message.
 */
@RestControllerAdvice(basePackageClasses = [AiGenerationController::class])
@Order(0)
class AiGenerationErrorHandler {
    @ExceptionHandler(AiGenerationException::class)
    fun handleAiGenerationException(error: AiGenerationException): ResponseEntity<ProblemDetail> {
        val status = error.code.toHttpStatus()
        return problem(status, error.code.name, error.message)
    }

    @ExceptionHandler(JobNotFoundException::class)
    fun handleJobNotFound(error: JobNotFoundException): ResponseEntity<ProblemDetail> =
        problem(HttpStatus.GONE, ErrorCode.JOB_EXPIRED.name, "Job ${error.jobId} not found or expired")

    @ExceptionHandler(JobSessionMismatchException::class)
    fun handleJobSessionMismatch(
        @Suppress("UNUSED_PARAMETER") error: JobSessionMismatchException,
    ): ResponseEntity<ProblemDetail> = problem(HttpStatus.NOT_FOUND, "JOB_NOT_FOUND", "Job not found for this session")

    @ExceptionHandler(AiGenerationJobPublishException::class)
    fun handleQueueFailure(
        @Suppress("UNUSED_PARAMETER") error: AiGenerationJobPublishException,
    ): ResponseEntity<ProblemDetail> =
        problem(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.QUEUE_UNAVAILABLE.name, "Generation queue unavailable")

    @ExceptionHandler(LlmGenerationException::class)
    fun handleLlmGeneration(error: LlmGenerationException): ResponseEntity<ProblemDetail> {
        val status = error.error.code.toHttpStatus()
        return problem(status, error.error.code.name, error.error.message)
    }

    @ExceptionHandler(AccessDeniedException::class)
    fun handleAccessDenied(
        @Suppress("UNUSED_PARAMETER") error: AccessDeniedException,
    ): ResponseEntity<ProblemDetail> = problem(HttpStatus.FORBIDDEN, "PERMISSION_DENIED", "Access denied")

    @ExceptionHandler(MaxUploadSizeExceededException::class)
    fun handleUploadTooLarge(
        @Suppress("UNUSED_PARAMETER") error: MaxUploadSizeExceededException,
    ): ResponseEntity<ProblemDetail> = problem(HttpStatus.BAD_REQUEST, "TRANSCRIPT_TOO_LARGE", "Transcript exceeds 1MB limit")

    @ExceptionHandler(TranscriptTooLargeException::class)
    fun handleTranscriptTooLarge(error: TranscriptTooLargeException): ResponseEntity<ProblemDetail> =
        problem(HttpStatus.BAD_REQUEST, "TRANSCRIPT_TOO_LARGE", error.message)

    @ExceptionHandler(RuntimeException::class)
    fun handleUnknown(
        @Suppress("UNUSED_PARAMETER") error: RuntimeException,
    ): ResponseEntity<ProblemDetail> = problem(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.UNKNOWN.name, INTERNAL_ERROR_DETAIL)

    private fun problem(
        status: HttpStatus,
        code: String,
        detail: String?,
    ): ResponseEntity<ProblemDetail> =
        ResponseEntity
            .status(status)
            .body(
                ProblemDetail(
                    type = "about:blank",
                    title = status.reasonPhrase,
                    status = status.value(),
                    detail = detail,
                    code = code,
                ),
            )
}

internal fun ErrorCode.toHttpStatus(): HttpStatus =
    when (this) {
        ErrorCode.AI_DISABLED -> HttpStatus.SERVICE_UNAVAILABLE
        ErrorCode.JOB_EXPIRED -> HttpStatus.GONE
        ErrorCode.HOST_DAILY_CAP_EXCEEDED,
        ErrorCode.CLUB_MONTHLY_CAP_EXCEEDED,
        -> HttpStatus.BAD_REQUEST
        ErrorCode.RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS
        ErrorCode.QUEUE_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE
        ErrorCode.PROVIDER_UNAVAILABLE,
        ErrorCode.PROVIDER_RATE_LIMITED,
        -> HttpStatus.BAD_GATEWAY
        ErrorCode.SCHEMA_INVALID,
        ErrorCode.AUTHOR_NAME_MISMATCH,
        ErrorCode.HIGHLIGHTS_OUT_OF_RANGE,
        ErrorCode.ONE_LINE_REVIEWS_DUPLICATE,
        ErrorCode.FEEDBACK_TEMPLATE_INVALID,
        -> HttpStatus.UNPROCESSABLE_ENTITY
        ErrorCode.UNKNOWN -> HttpStatus.INTERNAL_SERVER_ERROR
    }
