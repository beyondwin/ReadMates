package com.readmates.aigen.adapter.`in`.web

import com.fasterxml.jackson.annotation.JsonProperty
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.JobView
import com.readmates.aigen.application.model.SectionReviewStatus
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.`in`.CommitGenerationResult
import com.readmates.session.application.SessionRecordVisibility
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * REST DTOs for the AI-generated session flow (spec §7).
 *
 * Conversions to/from [SessionImportV1Snapshot] live here so the controller
 * stays thin. Field names match the JSON contract documented in the spec.
 */

data class StartGenerationRequest(
    val model: String?,
    val authorNameMode: String? = null,
    val instructions: String?,
)

data class StartGenerationResponse(
    val jobId: UUID,
    val status: String,
    val expiresAt: String,
)

data class AvailableGenerationModelResponse(
    val id: String,
    val provider: String,
    @get:JsonProperty("isDefault")
    val isDefault: Boolean,
)

data class AvailableGenerationModelsResponse(
    val models: List<AvailableGenerationModelResponse>,
)

data class SessionImportV1Json(
    val format: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: String, // yyyy-MM-dd
    val summary: String,
    val highlights: List<AuthoredTextJson>,
    val oneLineReviews: List<AuthoredTextJson>,
    val feedbackDocumentFileName: String,
    val feedbackDocumentMarkdown: String,
) {
    data class AuthoredTextJson(
        val authorName: String,
        val text: String,
    )
}

data class TokenUsageJson(
    val input: Long,
    val cachedInput: Long,
    val output: Long,
)

fun TokenUsage.toJson(): TokenUsageJson =
    TokenUsageJson(
        input = publicInputTokens,
        cachedInput = publicCachedInputTokens,
        output = outputTokens,
    )

data class GenerationErrorJson(
    val code: String,
    val message: String,
)

data class JobStatusResponse(
    val jobId: UUID,
    val status: String,
    val stage: String?,
    val progressPct: Int,
    val model: String,
    val result: SessionImportV1Json?,
    val error: GenerationErrorJson?,
    val tokens: TokenUsageJson?,
    val costEstimateUsd: String,
    val warnings: List<String>,
    val expiresAt: String,
    val createdAt: String,
    val lastUpdatedAt: String,
    val revision: Long? = null,
    val groundingStatus: String? = null,
    val evidence: List<EvidenceTargetResponse>? = null,
    val sectionReviewStatuses: Map<GenerationItem, String>? = null,
)

data class EvidenceTargetResponse(
    val section: GenerationItem,
    val targetId: String,
    val ordinal: Int,
    val turnId: String,
    val startSeconds: Int,
    val speakerName: String,
    val excerpt: String,
    val truncated: Boolean,
)

data class ExpandedEvidenceTurnResponse(
    val turnId: String,
    val speakerName: String,
    val startSeconds: Int,
    val text: String,
)

data class RecentJobResponse(
    val jobId: UUID,
    val status: String,
    val stage: String?,
    val progressPct: Int,
    val model: String,
    val error: GenerationErrorJson?,
    val costEstimateUsd: String,
    val expiresAt: String,
    val createdAt: String,
    val lastUpdatedAt: String,
    val availableActions: List<String>,
)

data class RegenerateRequest(
    val item: String,
    val model: String?,
    val instructions: String?,
    val expectedRevision: Long? = null,
)

data class RegenerateResponse(
    val item: String,
    val value: Any,
    val tokens: TokenUsageJson,
    val costEstimateUsd: String,
    val warnings: List<String>,
    val revision: Long? = null,
    val result: SessionImportV1Json? = null,
    val evidence: List<EvidenceTargetResponse>? = null,
    val sectionReviewStatuses: Map<GenerationItem, String>? = null,
)

data class CommitRequest(
    val recordVisibility: SessionRecordVisibility,
    val result: SessionImportV1Json?,
    val expectedRevision: Long? = null,
    val sectionReviews: Map<GenerationItem, SectionReviewStatus>? = null,
)

data class CommitGenerationResponse(
    val sessionId: UUID,
    val status: JobStatus,
    val recovered: Boolean,
    val participantUpdatesCount: Int?,
    val draftRevision: Long?,
    val baseLiveRevision: Long?,
    val liveApplied: Boolean,
)

fun CommitGenerationResult.toResponse() =
    CommitGenerationResponse(
        sessionId = sessionId,
        status = status,
        recovered = recovered,
        participantUpdatesCount = participantUpdatesCount,
        draftRevision = draftRevision,
        baseLiveRevision = baseLiveRevision,
        liveApplied = liveApplied,
    )

/**
 * RFC 7807 problem-detail JSON. Always serialized with the same field
 * order; `detail` may be null when no extra context is safe to expose.
 */
data class ProblemDetail(
    val type: String = "about:blank",
    val title: String,
    val status: Int,
    val detail: String?,
    val code: String,
    val invalidSpeakerLabels: List<String>? = null,
    val currentRevision: Long? = null,
)

private val MEETING_DATE_FORMATTER: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

fun SessionImportV1Snapshot.toJson(): SessionImportV1Json =
    SessionImportV1Json(
        format = format,
        sessionNumber = sessionNumber,
        bookTitle = bookTitle,
        meetingDate = meetingDate.format(MEETING_DATE_FORMATTER),
        summary = summary,
        highlights = highlights.map { SessionImportV1Json.AuthoredTextJson(it.authorName, it.text) },
        oneLineReviews = oneLineReviews.map { SessionImportV1Json.AuthoredTextJson(it.authorName, it.text) },
        feedbackDocumentFileName = feedbackDocumentFileName,
        feedbackDocumentMarkdown = feedbackDocumentMarkdown,
    )

fun JobView.toStatusResponse(): JobStatusResponse {
    val groundedSucceeded = status == JobStatus.SUCCEEDED
    val completeGroundedPayload =
        result != null && evidence?.revision == revision && groundingStatus == GroundingStatus.VALID
    if (groundedSucceeded && !completeGroundedPayload) {
        throw AiGenerationException.Coded(ErrorCode.JOB_EXPIRED)
    }
    val visibleResult = if (groundedSucceeded) result else null
    val visibleEvidence = if (groundedSucceeded) evidence?.toResponse() else null
    val reviewStatuses =
        if (groundedSucceeded) {
            GenerationItem.entries.associateWith { PENDING_REVIEW }
        } else {
            null
        }
    return JobStatusResponse(
        jobId = jobId,
        status = status.name,
        stage = stage?.name,
        progressPct = progressPct,
        model = model.name,
        result = visibleResult?.toJson(),
        error = error?.let { GenerationErrorJson(it.code.name, it.code.safeDetail()) },
        tokens = tokens?.toJson(),
        costEstimateUsd = costEstimateUsd.toPlainString(),
        warnings = warnings,
        expiresAt = expiresAt.toString(),
        createdAt = createdAt.toString(),
        lastUpdatedAt = lastUpdatedAt.toString(),
        revision = revision,
        groundingStatus = groundingStatus?.name,
        evidence = visibleEvidence,
        sectionReviewStatuses = reviewStatuses,
    )
}

fun GroundedEvidenceBundle.toResponse(): List<EvidenceTargetResponse> {
    val excerptsByTurnId = excerpts.associateBy { it.turnId }
    return targets.flatMap { target ->
        target.turnIds.map { turnId ->
            val excerpt = excerptsByTurnId[turnId] ?: throw AiGenerationException.Coded(ErrorCode.JOB_EXPIRED)
            EvidenceTargetResponse(
                section = target.section,
                targetId = target.targetId,
                ordinal = target.ordinal,
                turnId = excerpt.turnId,
                startSeconds = excerpt.startSeconds,
                speakerName = excerpt.speakerName,
                excerpt = excerpt.excerpt,
                truncated = excerpt.truncated,
            )
        }
    }
}

fun JobView.toRecentJobResponse(): RecentJobResponse =
    RecentJobResponse(
        jobId = jobId,
        status = status.name,
        stage = stage?.name,
        progressPct = progressPct,
        model = model.name,
        error = error?.let { GenerationErrorJson(it.code.name, it.code.safeDetail()) },
        costEstimateUsd = costEstimateUsd.toPlainString(),
        expiresAt = expiresAt.toString(),
        createdAt = createdAt.toString(),
        lastUpdatedAt = lastUpdatedAt.toString(),
        availableActions = availableActions(),
    )

private fun JobView.availableActions(): List<String> =
    when (status) {
        JobStatus.PENDING,
        JobStatus.RUNNING,
        -> listOf("POLL", "CANCEL")
        JobStatus.SUCCEEDED -> listOf("POLL", "COMMIT_RETRY", "CANCEL")
        JobStatus.COMMITTING -> listOf("POLL")
        JobStatus.COMMIT_RETRY -> listOf("POLL", "COMMIT_RETRY")
        JobStatus.FAILED -> listOf("START_NEW")
        JobStatus.COMMITTED,
        JobStatus.CANCELLED,
        -> emptyList()
    }

fun SessionImportV1Json.toSnapshot(): SessionImportV1Snapshot =
    SessionImportV1Snapshot(
        format = format,
        sessionNumber = sessionNumber,
        bookTitle = bookTitle,
        meetingDate = LocalDate.parse(meetingDate, MEETING_DATE_FORMATTER),
        summary = summary,
        highlights = highlights.map { SessionImportV1Snapshot.AuthoredText(it.authorName, it.text) },
        oneLineReviews = oneLineReviews.map { SessionImportV1Snapshot.AuthoredText(it.authorName, it.text) },
        feedbackDocumentFileName = feedbackDocumentFileName,
        feedbackDocumentMarkdown = feedbackDocumentMarkdown,
    )

private const val PENDING_REVIEW = "PENDING_REVIEW"
