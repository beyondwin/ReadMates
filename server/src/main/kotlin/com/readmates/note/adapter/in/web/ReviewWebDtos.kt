package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.shared.security.CurrentMember
import jakarta.validation.constraints.NotBlank

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
