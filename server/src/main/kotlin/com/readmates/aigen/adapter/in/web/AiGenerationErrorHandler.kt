package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.messaging.AiGenerationJobPublishException
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.shared.security.AccessDeniedException
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MaxUploadSizeExceededException

private const val INTERNAL_ERROR_DETAIL = "internal error"

private const val PROBLEM_JOB_NOT_FOUND = "/problems/aigen/job-not-found"
private const val PROBLEM_JOB_SESSION_MISMATCH = "/problems/aigen/job-session-mismatch"
private const val PROBLEM_ILLEGAL_GENERATION_STATE = "/problems/aigen/illegal-generation-state"
private const val PROBLEM_AI_OPS_ACTION = "/problems/aigen/ops-action"

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
@Suppress("TooManyFunctions")
class AiGenerationErrorHandler {
    @ExceptionHandler(AiGenerationException.Coded::class)
    fun handleCoded(error: AiGenerationException.Coded): ResponseEntity<ProblemDetail> {
        val status = error.code.toHttpStatus()
        return problem(status, error.code.name, error.message)
    }

    @ExceptionHandler(AiGenerationException.JobNotFound::class)
    fun handleJobNotFound(error: AiGenerationException.JobNotFound): ResponseEntity<ProblemDetail> =
        problem(
            status = HttpStatus.GONE,
            code = ErrorCode.JOB_EXPIRED.name,
            detail = "Job ${error.jobId} not found or expired",
            type = PROBLEM_JOB_NOT_FOUND,
        )

    @ExceptionHandler(AiGenerationException.JobSessionMismatch::class)
    fun handleJobSessionMismatch(
        @Suppress("UNUSED_PARAMETER") error: AiGenerationException.JobSessionMismatch,
    ): ResponseEntity<ProblemDetail> =
        problem(
            status = HttpStatus.NOT_FOUND,
            code = "JOB_NOT_FOUND",
            detail = "Job not found for this session",
            type = PROBLEM_JOB_SESSION_MISMATCH,
        )

    @Suppress("MaxLineLength")
    @ExceptionHandler(AiGenerationException.IllegalGenerationState::class)
    fun handleIllegalGenerationState(error: AiGenerationException.IllegalGenerationState): ResponseEntity<ProblemDetail> =
        problem(
            status = HttpStatus.CONFLICT,
            code = "ILLEGAL_GENERATION_STATE",
            detail = error.message,
            type = PROBLEM_ILLEGAL_GENERATION_STATE,
        )

    @ExceptionHandler(AiGenerationException.SafeOpsError::class)
    fun handleSafeOpsError(error: AiGenerationException.SafeOpsError): ResponseEntity<ProblemDetail> =
        problem(
            status = if (error.code == "JOB_EXPIRED") HttpStatus.GONE else HttpStatus.CONFLICT,
            code = error.code,
            detail = "AI Ops action is not available for job ${error.jobId}",
            type = PROBLEM_AI_OPS_ACTION,
        )

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

    @Suppress("MaxLineLength")
    @ExceptionHandler(MaxUploadSizeExceededException::class)
    fun handleUploadTooLarge(
        @Suppress("UNUSED_PARAMETER") error: MaxUploadSizeExceededException,
    ): ResponseEntity<ProblemDetail> = problem(HttpStatus.BAD_REQUEST, "TRANSCRIPT_TOO_LARGE", "Transcript exceeds 1MB limit")

    @ExceptionHandler(TranscriptTooLargeException::class)
    fun handleTranscriptTooLarge(error: TranscriptTooLargeException): ResponseEntity<ProblemDetail> =
        problem(HttpStatus.BAD_REQUEST, "TRANSCRIPT_TOO_LARGE", error.message)

    @ExceptionHandler(RuntimeException::class)
    fun handleUnknown(error: RuntimeException): ResponseEntity<ProblemDetail> {
        val log = org.slf4j.LoggerFactory.getLogger(AiGenerationErrorHandler::class.java)
        if (error is com.readmates.sessionimport.application.service.InvalidSessionImportException) {
            val issueCodes = error.issues.map { it.code }.distinct()
            log.error(
                "Unhandled AI generation exception. issueCount={}, issueCodes={}",
                error.issues.size,
                issueCodes,
                error,
            )
        } else {
            log.error("Unhandled AI generation exception", error)
        }
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.UNKNOWN.name, INTERNAL_ERROR_DETAIL)
    }

    private fun problem(
        status: HttpStatus,
        code: String,
        detail: String?,
        type: String = "about:blank",
    ): ResponseEntity<ProblemDetail> =
        ResponseEntity
            .status(status)
            .body(
                ProblemDetail(
                    type = type,
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
        ErrorCode.MAX_CALLS_EXCEEDED -> HttpStatus.TOO_MANY_REQUESTS
        ErrorCode.QUEUE_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE
        ErrorCode.PROVIDER_UNAVAILABLE,
        ErrorCode.PROVIDER_RATE_LIMITED,
        -> HttpStatus.BAD_GATEWAY
        ErrorCode.SCHEMA_INVALID,
        ErrorCode.AUTHOR_NAME_MISMATCH,
        ErrorCode.HIGHLIGHTS_OUT_OF_RANGE,
        ErrorCode.ONE_LINE_REVIEWS_DUPLICATE,
        ErrorCode.FEEDBACK_TEMPLATE_INVALID,
        ErrorCode.TRANSCRIPT_FORMAT_INVALID,
        ErrorCode.TRANSCRIPT_EMPTY,
        ErrorCode.TRANSCRIPT_DURATION_EXCEEDED,
        -> HttpStatus.UNPROCESSABLE_ENTITY
        ErrorCode.UNKNOWN -> HttpStatus.INTERNAL_SERVER_ERROR
    }
