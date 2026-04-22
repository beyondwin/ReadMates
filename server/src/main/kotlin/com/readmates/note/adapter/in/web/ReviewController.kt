package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.port.`in`.SaveReviewUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class OneLineReviewRequest(@field:NotBlank val text: String) {
    fun toCommand(member: CurrentMember): SaveOneLineReviewCommand =
        SaveOneLineReviewCommand(member, text)
}

data class LongReviewRequest(@field:NotBlank val body: String) {
    fun toCommand(member: CurrentMember): SaveLongReviewCommand =
        SaveLongReviewCommand(member, body)
}

data class OneLineReviewResponse(val text: String)
data class LongReviewResponse(val body: String)

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
