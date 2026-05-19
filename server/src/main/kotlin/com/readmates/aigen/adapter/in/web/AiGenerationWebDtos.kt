package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.JobView
import com.readmates.aigen.application.model.SessionImportV1Snapshot
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
    val authorNameMode: String, // "real" | "alias"
    val instructions: String?,
)

data class StartGenerationResponse(
    val jobId: UUID,
    val status: String,
    val expiresAt: String,
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
)

data class RegenerateResponse(
    val item: String,
    val value: Any,
    val tokens: TokenUsageJson,
    val costEstimateUsd: String,
    val warnings: List<String>,
)

data class CommitRequest(
    val recordVisibility: SessionRecordVisibility,
    val result: SessionImportV1Json?,
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

fun JobView.toStatusResponse(): JobStatusResponse =
    JobStatusResponse(
        jobId = jobId,
        status = status.name,
        stage = stage?.name,
        progressPct = progressPct,
        model = model.name,
        result = result?.toJson(),
        error = error?.let { GenerationErrorJson(it.code.name, it.message) },
        tokens = tokens?.let { TokenUsageJson(it.inputTokens, it.cachedInputTokens, it.outputTokens) },
        costEstimateUsd = costEstimateUsd.toPlainString(),
        warnings = warnings,
        expiresAt = expiresAt.toString(),
        createdAt = createdAt.toString(),
        lastUpdatedAt = lastUpdatedAt.toString(),
    )

fun JobView.toRecentJobResponse(): RecentJobResponse =
    RecentJobResponse(
        jobId = jobId,
        status = status.name,
        stage = stage?.name,
        progressPct = progressPct,
        model = model.name,
        error = error?.let { GenerationErrorJson(it.code.name, it.message) },
        costEstimateUsd = costEstimateUsd.toPlainString(),
        expiresAt = expiresAt.toString(),
        createdAt = createdAt.toString(),
        lastUpdatedAt = lastUpdatedAt.toString(),
        availableActions = availableActions(),
    )

private fun JobView.availableActions(): List<String> =
    when (status) {
        JobStatus.PENDING,
        JobStatus.RUNNING -> listOf("POLL", "CANCEL")
        JobStatus.SUCCEEDED -> listOf("POLL", "COMMIT_RETRY", "CANCEL")
        JobStatus.COMMITTING -> listOf("POLL")
        JobStatus.FAILED -> listOf("START_NEW")
        JobStatus.COMMITTED,
        JobStatus.CANCELLED -> emptyList()
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
