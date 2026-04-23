package com.readmates.session.application.model

import com.readmates.shared.security.CurrentMember

data class UpdateRsvpCommand(
    val member: CurrentMember,
    val status: String,
)

data class SaveCheckinCommand(
    val member: CurrentMember,
    val readingProgress: Int,
)

data class SaveQuestionCommand(
    val member: CurrentMember,
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

data class ReplaceQuestionsCommand(
    val member: CurrentMember,
    val questions: List<ReplaceQuestionCommandItem>,
)

data class ReplaceQuestionCommandItem(
    val priority: Int,
    val text: String,
)

data class SaveOneLineReviewCommand(
    val member: CurrentMember,
    val text: String,
)

data class SaveLongReviewCommand(
    val member: CurrentMember,
    val body: String,
)
