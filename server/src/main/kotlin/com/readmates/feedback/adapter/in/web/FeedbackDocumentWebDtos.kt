package com.readmates.feedback.adapter.`in`.web

data class FeedbackDocumentListPage(
    val items: List<FeedbackDocumentListItem>,
    val nextCursor: String?,
)

data class FeedbackDocumentListItem(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val date: String,
    val fileName: String,
    val uploadedAt: String,
)

data class FeedbackDocumentResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val subtitle: String,
    val bookTitle: String,
    val date: String,
    val fileName: String,
    val uploadedAt: String,
    val metadata: List<FeedbackMetadataItem>,
    val observerNotes: List<String>,
    val participants: List<FeedbackParticipant>,
)

data class FeedbackMetadataItem(
    val label: String,
    val value: String,
)

data class FeedbackParticipant(
    val number: Int,
    val name: String,
    val role: String,
    val style: List<String>,
    val contributions: List<String>,
    val problems: List<FeedbackProblem>,
    val actionItems: List<String>,
    val revealingQuote: FeedbackRevealingQuote,
)

data class FeedbackProblem(
    val title: String,
    val core: String,
    val evidence: String,
    val interpretation: String,
)

data class FeedbackRevealingQuote(
    val quote: String,
    val context: String,
    val note: String,
)

data class FeedbackDocumentStatus(
    val uploaded: Boolean,
    val fileName: String?,
    val uploadedAt: String?,
)
