package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.port.`in`.ReplaceQuestionsUseCase
import com.readmates.session.application.port.`in`.SaveQuestionUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/sessions/current/questions")
class QuestionController(
    private val saveQuestionUseCase: SaveQuestionUseCase,
    private val replaceQuestionsUseCase: ReplaceQuestionsUseCase,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @Valid @RequestBody request: CreateQuestionRequest,
        member: CurrentMember,
    ): QuestionResponse {
        val result = saveQuestionUseCase.saveQuestion(request.toCommand(member))
        return result.toQuestionResponse()
    }

    @PutMapping
    fun replace(
        @RequestBody request: ReplaceQuestionsRequest,
        member: CurrentMember,
    ): ReplaceQuestionsResponse {
        val result = replaceQuestionsUseCase.replaceQuestions(request.toCommand(member))
        return result.toReplaceQuestionsResponse()
    }
}
