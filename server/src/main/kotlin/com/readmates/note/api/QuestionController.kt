package com.readmates.note.api

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.session.application.SessionRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class CreateQuestionRequest(
    @field:Min(1) @field:Max(5) val priority: Int,
    @field:NotBlank val text: String,
    val draftThought: String?,
)

data class ReplaceQuestionsRequest(
    val questions: List<ReplaceQuestionItem> = emptyList(),
)

data class ReplaceQuestionItem(
    val text: String,
)

data class QuestionResponse(
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

@RestController
@RequestMapping("/api/sessions/current/questions")
class QuestionController(
    private val memberAccountRepository: MemberAccountRepository,
    private val sessionRepository: SessionRepository,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        authentication: Authentication?,
        @Valid @RequestBody request: CreateQuestionRequest,
    ) = sessionRepository.saveQuestion(
        member = currentMember(authentication),
        priority = request.priority,
        text = request.text,
        draftThought = request.draftThought,
    )

    @PutMapping
    fun replace(
        authentication: Authentication?,
        @RequestBody request: ReplaceQuestionsRequest,
    ) = sessionRepository.replaceQuestions(
        member = currentMember(authentication),
        texts = request.questions.map { it.text },
    )

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}
