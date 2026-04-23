package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.port.`in`.SaveReviewUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/sessions/current")
class ReviewController(
    private val saveReviewUseCase: SaveReviewUseCase,
) {
    @PostMapping("/one-line-reviews")
    fun saveOneLine(
        @Valid @RequestBody request: OneLineReviewRequest,
        member: CurrentMember,
    ): OneLineReviewResponse {
        val result = saveReviewUseCase.saveOneLineReview(request.toCommand(member))
        return OneLineReviewResponse(result.text)
    }

    @PostMapping("/reviews")
    fun saveLong(
        @Valid @RequestBody request: LongReviewRequest,
        member: CurrentMember,
    ): LongReviewResponse {
        val result = saveReviewUseCase.saveLongReview(request.toCommand(member))
        return LongReviewResponse(result.body)
    }
}
