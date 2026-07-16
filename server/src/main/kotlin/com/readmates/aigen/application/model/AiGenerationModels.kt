package com.readmates.aigen.application.model

import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

enum class Provider { CLAUDE, OPENAI, GEMINI }

const val GROUNDED_PIPELINE_VERSION = "grounded-session-generation-v2"

data class ModelId(
    val provider: Provider,
    val name: String,
) {
    override fun toString(): String = name
}

data class ModelPricing(
    val inputPerMTokenUsd: BigDecimal,
    val cacheWriteInputPerMTokenUsd: BigDecimal,
    val cachedInputPerMTokenUsd: BigDecimal,
    val outputPerMTokenUsd: BigDecimal,
)

data class ModelCapability(
    val contextWindowTokens: Long,
    val maxOutputTokens: Long,
    val structuredOutputSupported: Boolean,
)

data class ParsedTranscriptTurn(
    val turnId: String,
    val speakerName: String,
    val startSeconds: Int,
    val text: String,
)

data class ParsedTranscript(
    val normalizedTranscript: String,
    val turns: List<ParsedTranscriptTurn>,
)

data class ValidatedTranscriptTurn(
    val turnId: String,
    val speakerName: String,
    val speakerMembershipId: UUID,
    val startSeconds: Int,
    val text: String,
)

data class GroundedGenerationDraft(
    val format: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val summaryBlocks: List<GroundedTextBlock>,
    val highlights: List<GroundedAuthoredText>,
    val oneLineReviews: List<GroundedAuthoredText>,
    val feedbackDocumentFileName: String,
    val feedbackSections: List<GroundedFeedbackSection>,
)

data class GroundedTextBlock(
    val text: String,
    val evidenceTurnIds: List<String>,
)

data class GroundedAuthoredText(
    val authorName: String,
    val text: String,
    val evidenceTurnIds: List<String>,
)

data class GroundedFeedbackSection(
    val heading: String,
    val markdown: String,
    val evidenceTurnIds: List<String>,
)

enum class GroundingFailureReason {
    SESSION_METADATA_MISMATCH,
    SOURCE_TURNS_INVALID,
    SECTION_EMPTY,
    HIGHLIGHTS_OUT_OF_RANGE,
    ONE_LINE_AUTHOR_SET_MISMATCH,
    AUTHOR_NOT_ALLOWED,
    EVIDENCE_REQUIRED,
    EVIDENCE_TURN_NOT_FOUND,
    AUTHOR_EVIDENCE_MISMATCH,
    FEEDBACK_TEMPLATE_INVALID,
    PII_DETECTED,
}

data class GroundedEvidenceTarget(
    val targetId: String,
    val section: GenerationItem,
    val ordinal: Int,
    val turnIds: List<String>,
)

data class GroundedEvidenceExcerpt(
    val turnId: String,
    val speakerName: String,
    val startSeconds: Int,
    val excerpt: String,
    val truncated: Boolean,
)

data class GroundedEvidenceBundle(
    val revision: Long,
    val targets: List<GroundedEvidenceTarget>,
    val excerpts: List<GroundedEvidenceExcerpt>,
)

data class TokenUsage(
    val nonCachedInputTokens: Long,
    val cacheWriteInputTokens: Long,
    val cacheReadInputTokens: Long,
    val outputTokens: Long,
) {
    init {
        require(nonCachedInputTokens >= 0) { "nonCachedInputTokens must be non-negative" }
        require(cacheWriteInputTokens >= 0) { "cacheWriteInputTokens must be non-negative" }
        require(cacheReadInputTokens >= 0) { "cacheReadInputTokens must be non-negative" }
        require(outputTokens >= 0) { "outputTokens must be non-negative" }
    }

    val publicInputTokens: Long get() = nonCachedInputTokens + cacheWriteInputTokens
    val publicCachedInputTokens: Long get() = cacheReadInputTokens

    operator fun plus(other: TokenUsage): TokenUsage =
        TokenUsage(
            nonCachedInputTokens = nonCachedInputTokens + other.nonCachedInputTokens,
            cacheWriteInputTokens = cacheWriteInputTokens + other.cacheWriteInputTokens,
            cacheReadInputTokens = cacheReadInputTokens + other.cacheReadInputTokens,
            outputTokens = outputTokens + other.outputTokens,
        )

    companion object {
        val ZERO =
            TokenUsage(
                nonCachedInputTokens = 0,
                cacheWriteInputTokens = 0,
                cacheReadInputTokens = 0,
                outputTokens = 0,
            )
    }
}

enum class GenerationItem { SUMMARY, HIGHLIGHTS, ONE_LINE_REVIEWS, FEEDBACK_DOCUMENT }

enum class JobStatus {
    PENDING,
    RUNNING,
    SUCCEEDED,
    COMMITTING,
    COMMIT_RETRY,
    COMMITTED,
    FAILED,
    CANCELLED,
}

enum class GroundingStatus { PENDING, VALID, INVALID }

enum class SectionReviewStatus { AI_GROUNDED_REVIEWED, USER_EDITED_CONFIRMED }

enum class JobStage {
    QUEUED,
    PREPARING_TRANSCRIPT,
    GENERATING_RECORD,
    VALIDATING_GROUNDING,
    REPAIRING_RECORD,
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
    TRANSCRIPT_FORMAT_INVALID,
    TRANSCRIPT_EMPTY,
    TRANSCRIPT_DURATION_EXCEEDED,
    TRANSCRIPT_SPEAKER_NOT_MEMBER,
    TRANSCRIPT_SPEAKER_AMBIGUOUS,
    MODEL_CAPABILITY_UNAVAILABLE,
    TRANSCRIPT_TOO_LONG_FOR_MODEL,
    TRANSCRIPT_ALIAS_MODE_UNSUPPORTED,
    STALE_GENERATION_REVISION,
    MEMBERSHIP_CHANGED,

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
    val actualModel: ModelId? = null,
    val result: SessionImportV1Snapshot?,
    val error: GenerationError?,
    val tokens: TokenUsage?,
    val costEstimateUsd: BigDecimal,
    val warnings: List<String>,
    val expiresAt: Instant,
    val createdAt: Instant,
    val lastUpdatedAt: Instant,
    val revision: Long = 0,
    val groundingStatus: GroundingStatus? = null,
    val evidence: GroundedEvidenceBundle? = null,
)
