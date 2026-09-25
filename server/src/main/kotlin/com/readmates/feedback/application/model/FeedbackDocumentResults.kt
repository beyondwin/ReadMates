package com.readmates.feedback.application.model

import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

data class FeedbackDocumentListItemResult(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val date: String,
    val fileName: String,
    val uploadedAt: String,
)

data class FeedbackDocumentResult(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val subtitle: String,
    val bookTitle: String,
    val date: String,
    val fileName: String,
    val uploadedAt: String,
    val metadata: List<FeedbackMetadataItemResult>,
    val observerNotes: List<String>,
    val participants: List<FeedbackParticipantResult>,
    val templateVersion: Int = 1,
    val overview: List<FeedbackMetadataItemResult> = emptyList(),
    val highlights: List<FeedbackHighlightResult> = emptyList(),
    val groupFeedback: FeedbackGroupFeedbackResult? = null,
    val trend: FeedbackTrendResult? = null,
    val followUpQuestions: List<String> = emptyList(),
)

data class FeedbackMetadataItemResult(
    val label: String,
    val value: String,
)

data class FeedbackParticipantResult(
    val number: Int,
    val name: String,
    val role: String,
    val style: List<String>,
    val contributions: List<String>,
    val problems: List<FeedbackProblemResult>,
    val actionItems: List<String>,
    val revealingQuote: FeedbackRevealingQuoteResult,
    val badges: List<String> = emptyList(),
    val journey: List<FeedbackJourneyStepResult> = emptyList(),
    val achievements: List<String> = emptyList(),
    val baseline: List<String> = emptyList(),
    val sessionQuotes: List<FeedbackSessionQuoteResult> = emptyList(),
)

data class FeedbackHighlightResult(
    val title: String,
    val lines: List<FeedbackHighlightLineResult>,
    val why: String,
)

data class FeedbackHighlightLineResult(
    val speaker: String,
    val time: String?,
    val text: String,
)

data class FeedbackGroupFeedbackResult(
    val strengths: List<FeedbackGroupPointResult>,
    val improvements: List<FeedbackGroupPointResult>,
    val speakingShares: List<FeedbackSpeakingShareResult>,
    val speakingNote: String?,
    val nextSteps: List<String>,
)

data class FeedbackGroupPointResult(
    val title: String,
    val evidence: String,
    val interpretation: String,
)

data class FeedbackSpeakingShareResult(
    val name: String,
    val percent: Int,
)

data class FeedbackTrendResult(
    val attendance: List<FeedbackAttendancePointResult>,
    val phases: List<FeedbackTrendPhaseResult>,
    val repeatedTasks: List<FeedbackRepeatedTaskResult>,
)

data class FeedbackAttendancePointResult(
    val label: String,
    val count: Int,
)

data class FeedbackTrendPhaseResult(
    val label: String,
    val text: String,
)

data class FeedbackRepeatedTaskResult(
    val task: String,
    val detail: String,
    val status: String,
)

data class FeedbackJourneyStepResult(
    val label: String,
    val text: String,
)

data class FeedbackSessionQuoteResult(
    val time: String?,
    val quote: String,
    val note: String,
)

data class FeedbackProblemResult(
    val title: String,
    val core: String,
    val evidence: String,
    val interpretation: String,
)

data class FeedbackRevealingQuoteResult(
    val quote: String,
    val context: String,
    val note: String,
)

data class FeedbackDocumentStatusResult(
    val uploaded: Boolean,
    val fileName: String?,
    val uploadedAt: String?,
)

data class FeedbackDocumentSessionResult(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: LocalDate,
)

data class StoredFeedbackDocumentResult(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: LocalDate,
    val sourceText: String,
    val fileName: String,
    val uploadedAt: OffsetDateTime,
)

data class StoredFeedbackDocumentListResult(
    val documentId: UUID,
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: LocalDate,
    val title: String?,
    val legacySourceText: String?,
    val fileName: String,
    val uploadedAt: OffsetDateTime,
)
