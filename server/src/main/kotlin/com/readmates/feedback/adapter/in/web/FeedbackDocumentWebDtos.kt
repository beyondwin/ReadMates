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
    val templateVersion: Int,
    val overview: List<FeedbackMetadataItem>,
    val highlights: List<FeedbackHighlight>,
    val groupFeedback: FeedbackGroupFeedback?,
    val trend: FeedbackTrend?,
    val followUpQuestions: List<String>,
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
    val badges: List<String>,
    val journey: List<FeedbackJourneyStep>,
    val achievements: List<String>,
    val baseline: List<String>,
    val sessionQuotes: List<FeedbackSessionQuote>,
)

data class FeedbackHighlight(
    val title: String,
    val lines: List<FeedbackHighlightLine>,
    val why: String,
)

data class FeedbackHighlightLine(
    val speaker: String,
    val time: String?,
    val text: String,
)

data class FeedbackGroupFeedback(
    val strengths: List<FeedbackGroupPoint>,
    val improvements: List<FeedbackGroupPoint>,
    val speakingShares: List<FeedbackSpeakingShare>,
    val speakingNote: String?,
    val nextSteps: List<String>,
)

data class FeedbackGroupPoint(
    val title: String,
    val evidence: String,
    val interpretation: String,
)

data class FeedbackSpeakingShare(
    val name: String,
    val percent: Int,
)

data class FeedbackTrend(
    val attendance: List<FeedbackAttendancePoint>,
    val phases: List<FeedbackTrendPhase>,
    val repeatedTasks: List<FeedbackRepeatedTask>,
)

data class FeedbackAttendancePoint(
    val label: String,
    val count: Int,
)

data class FeedbackTrendPhase(
    val label: String,
    val text: String,
)

data class FeedbackRepeatedTask(
    val task: String,
    val detail: String,
    val status: String,
)

data class FeedbackJourneyStep(
    val label: String,
    val text: String,
)

data class FeedbackSessionQuote(
    val time: String?,
    val quote: String,
    val note: String,
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
