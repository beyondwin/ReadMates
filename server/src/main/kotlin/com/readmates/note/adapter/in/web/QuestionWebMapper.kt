package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.model.QuestionResult
import com.readmates.session.application.model.ReplaceQuestionsResult

internal fun QuestionResult.toQuestionResponse(): QuestionResponse =
    QuestionResponse(priority, text, draftThought)

internal fun ReplaceQuestionsResult.toReplaceQuestionsResponse(): ReplaceQuestionsResponse =
    ReplaceQuestionsResponse(
        questions = questions.map { it.toQuestionResponse() },
    )
