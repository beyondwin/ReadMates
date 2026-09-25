package com.readmates.feedback.application

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
