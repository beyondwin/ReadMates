package com.readmates.aigen.application.model

import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

enum class Provider { CLAUDE, OPENAI, GEMINI }

data class ModelId(
    val provider: Provider,
    val name: String,
) {
    override fun toString(): String = name
}

data class ModelPricing(
    val inputPerMTokenUsd: BigDecimal,
    val cachedInputPerMTokenUsd: BigDecimal,
    val outputPerMTokenUsd: BigDecimal,
)

data class TokenUsage(
    val inputTokens: Long,
    val cachedInputTokens: Long,
    val outputTokens: Long,
)

enum class GenerationItem { SUMMARY, HIGHLIGHTS, ONE_LINE_REVIEWS, FEEDBACK_DOCUMENT }

enum class JobStatus {
    PENDING,
    RUNNING,
    SUCCEEDED,
    COMMITTING,
    COMMITTED,
    FAILED,
    CANCELLED,
}

enum class JobStage {
    QUEUED,
    TRANSCRIPT_LOADED,
    GENERATING_SUMMARY,
    GENERATING_HIGHLIGHTS,
    GENERATING_ONE_LINE_REVIEWS,
    GENERATING_FEEDBACK_DOCUMENT,
    VALIDATING,
    READY,
}

enum class AuthorNameMode { REAL, ALIAS }

data class SessionMeta(
    val sessionId: UUID,
    val clubId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String?,
    val meetingDate: LocalDate,
    val expectedAuthorNames: List<String>,
    val authorNameMode: AuthorNameMode,
)

data class GenerationInput(
    val transcript: String,
    val sessionMeta: SessionMeta,
    val model: ModelId,
    val instructions: String?,
)

data class RegenerationInput(
    val transcript: String,
    val currentResult: SessionImportV1Snapshot,
    val item: GenerationItem,
    val sessionMeta: SessionMeta,
    val model: ModelId,
    val instructions: String?,
)

data class GenerationOutput(
    val result: SessionImportV1Snapshot,
    val usage: TokenUsage,
)

data class RegenerationOutput(
    val patchedItem: GenerationItem,
    val patchedValue: Any,
    val usage: TokenUsage,
)

/**
 * In-memory snapshot mirroring the readmates-session-import:v1 JSON.
 * Reuses the same shape as sessionimport.application.model.SessionImportCommand fields,
 * but lives in aigen for module independence. Conversion is in AiGenerationCommitService.
 */
data class SessionImportV1Snapshot(
    val format: String, // "readmates-session-import:v1"
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val summary: String,
    val highlights: List<AuthoredText>,
    val oneLineReviews: List<AuthoredText>,
    val feedbackDocumentFileName: String,
    val feedbackDocumentMarkdown: String,
) {
    data class AuthoredText(
        val authorName: String,
        val text: String,
    )
}

enum class ErrorCode {
    PROVIDER_UNAVAILABLE,
    PROVIDER_RATE_LIMITED,
    SCHEMA_INVALID,
    AUTHOR_NAME_MISMATCH,
    HIGHLIGHTS_OUT_OF_RANGE,
    ONE_LINE_REVIEWS_DUPLICATE,
    FEEDBACK_TEMPLATE_INVALID,
    HOST_DAILY_CAP_EXCEEDED,
    CLUB_MONTHLY_CAP_EXCEEDED,
    RATE_LIMITED,
    AI_DISABLED,
    JOB_EXPIRED,
    QUEUE_UNAVAILABLE,

    /**
     * The per-job hard cap on LLM calls (start + validation retry + regenerations) has
     * been exceeded. See spec §9.2 ("총 LLM 호출 ≤ 3회/job") and
     * `AiGenerationProperties.Job.maxLlmCallsPerJob`. Surfaces to clients as 429.
     */
    MAX_CALLS_EXCEEDED,

    UNKNOWN,
}

data class GenerationError(
    val code: ErrorCode,
    val message: String,
)

data class JobView(
    val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val status: JobStatus,
    val stage: JobStage?,
    val progressPct: Int,
    val model: ModelId,
    val result: SessionImportV1Snapshot?,
    val error: GenerationError?,
    val tokens: TokenUsage?,
    val costEstimateUsd: BigDecimal,
    val warnings: List<String>,
    val expiresAt: Instant,
)
