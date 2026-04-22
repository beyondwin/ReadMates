package com.readmates.session.application.model

data class RsvpResult(
    val status: String,
)

data class CheckinResult(
    val readingProgress: Int,
    val note: String,
)

data class QuestionResult(
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

data class ReplaceQuestionsResult(
    val questions: List<QuestionResult>,
)

data class OneLineReviewResult(
    val text: String,
)

data class LongReviewResult(
    val body: String,
)
