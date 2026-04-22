package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.UpdateRsvpCommand
import com.readmates.session.application.port.`in`.UpdateRsvpUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.Pattern
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class UpdateRsvpRequest(
    @field:Pattern(regexp = "NO_RESPONSE|GOING|MAYBE|DECLINED")
    val status: String,
) {
    fun toCommand(member: CurrentMember): UpdateRsvpCommand =
        UpdateRsvpCommand(member = member, status = status)
}

data class RsvpResponse(
    val status: String,
)

@RestController
@RequestMapping("/api/sessions/current/rsvp")
class RsvpController(
    private val updateRsvpUseCase: UpdateRsvpUseCase,
) {
    @PatchMapping
    fun update(
        @Valid @RequestBody request: UpdateRsvpRequest,
        member: CurrentMember,
    ): RsvpResponse {
        val result = updateRsvpUseCase.updateRsvp(request.toCommand(member))
        return RsvpResponse(status = result.status)
    }
}
