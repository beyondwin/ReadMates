package com.readmates.note.api

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.session.application.SessionRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class OneLineReviewRequest(@field:NotBlank val text: String)
data class LongReviewRequest(@field:NotBlank val body: String)

@RestController
@RequestMapping("/api/sessions/current")
class ReviewController(
    private val memberAccountRepository: MemberAccountRepository,
    private val sessionRepository: SessionRepository,
) {
    @PostMapping("/one-line-reviews")
    fun saveOneLine(
        authentication: Authentication?,
        @Valid @RequestBody request: OneLineReviewRequest,
    ) = sessionRepository.saveOneLineReview(currentMember(authentication), request.text)

    @PostMapping("/reviews")
    fun saveLong(
        authentication: Authentication?,
        @Valid @RequestBody request: LongReviewRequest,
    ) = sessionRepository.saveLongReview(currentMember(authentication), request.body)

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}
