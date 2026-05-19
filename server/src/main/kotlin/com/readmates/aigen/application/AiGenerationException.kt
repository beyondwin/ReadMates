package com.readmates.aigen.application

import com.readmates.aigen.application.model.ErrorCode
import java.util.UUID

/**
 * Sealed hierarchy of domain exceptions for the AI generation flow (task_1_7 finding #9).
 *
 * Each subtype carries the structured context the
 * [com.readmates.aigen.adapter.`in`.web.AiGenerationErrorHandler] needs to produce an
 * RFC 7807 problem-detail response with a stable `type` URI — instead of the previous
 * mix of bare [IllegalStateException] (mapped to 500/UNKNOWN by the catch-all) and a
 * single `JobNotFoundException` adapter type.
 *
 * The legacy [Coded] subtype subsumes the old
 * `com.readmates.aigen.adapter.`in`.web.AiGenerationException(code, message)` so the
 * controller's cap-denial / schema-invalid throws keep a single class name.
 */
sealed class AiGenerationException(
    message: String,
    cause: Throwable? = null,
) : RuntimeException(message, cause) {
    /** A job lookup missed (Redis TTL expired or never existed). Maps to 410 GONE / `JOB_EXPIRED`. */
    class JobNotFound(
        val jobId: UUID,
    ) : AiGenerationException("Job $jobId not found or expired")

    /**
     * The sessionId in the URL path did not match the sessionId stored on the job.
     * Maps to 404 with `type: /problems/aigen/job-session-mismatch`.
     */
    class JobSessionMismatch(
        val jobId: UUID,
        val expectedSessionId: UUID,
        val actualSessionId: UUID,
    ) : AiGenerationException(
            "Job $jobId belongs to session $actualSessionId, not $expectedSessionId",
        )

    /**
     * The job is in a status that prevents the attempted action (e.g. commit before
     * generation completed, regenerate without prior result, cancel by a non-host).
     * Maps to 409 CONFLICT with `type: /problems/aigen/illegal-generation-state`.
     */
    class IllegalGenerationState(
        val jobId: UUID,
        val currentStatus: String,
        val attemptedAction: String,
    ) : AiGenerationException(
            "Job $jobId cannot $attemptedAction in status $currentStatus",
        )

    /**
     * Platform-admin AI Ops action failure with a safe, operator-facing code.
     * Keeps Redis expiry/live-state distinctions visible without exposing raw
     * Redis keys or payload details.
     */
    class SafeOpsError(
        val jobId: UUID,
        val code: String,
    ) : AiGenerationException("AI Ops action for job $jobId failed with $code")

    /**
     * Generic code-bearing variant — replaces the legacy adapter-package
     * `AiGenerationException(code, message)` for cap denials, schema parse errors and
     * other paths that already carry an [ErrorCode]. The handler maps via the existing
     * `ErrorCode.toHttpStatus()` switch.
     */
    class Coded(
        val code: ErrorCode,
        detailMessage: String? = null,
    ) : AiGenerationException(detailMessage ?: code.name)
}
