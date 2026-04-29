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
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: LocalDate,
    val title: String?,
    val legacySourceText: String?,
    val fileName: String,
    val uploadedAt: OffsetDateTime,
)
