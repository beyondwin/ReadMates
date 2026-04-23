package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.model.ReplaceQuestionsCommand
import com.readmates.session.application.model.ReplaceQuestionCommandItem
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.shared.security.CurrentMember
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank

data class CreateQuestionRequest(
    @field:Min(1) @field:Max(5) val priority: Int,
    @field:NotBlank val text: String,
    val draftThought: String?,
) {
    fun toCommand(member: CurrentMember): SaveQuestionCommand =
        SaveQuestionCommand(member, priority, text, draftThought)
}

data class ReplaceQuestionsRequest(
    val questions: List<ReplaceQuestionItem> = emptyList(),
) {
    fun toCommand(member: CurrentMember): ReplaceQuestionsCommand =
        ReplaceQuestionsCommand(
            member,
            questions.mapIndexed { index, question ->
                ReplaceQuestionCommandItem(
                    priority = question.priority ?: index + 1,
                    text = question.text,
                )
            },
        )
}

data class ReplaceQuestionItem(
    val priority: Int? = null,
    val text: String,
)

data class QuestionResponse(
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

data class ReplaceQuestionsResponse(
    val questions: List<QuestionResponse>,
)
