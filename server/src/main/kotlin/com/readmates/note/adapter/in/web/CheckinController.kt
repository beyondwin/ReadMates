package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.port.`in`.SaveCheckinUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class CheckinRequest(
    @field:Min(0) @field:Max(100) val readingProgress: Int,
    @field:NotBlank val note: String,
) {
    fun toCommand(member: CurrentMember): SaveCheckinCommand =
        SaveCheckinCommand(member = member, readingProgress = readingProgress, note = note)
}

data class CheckinResponse(
    val readingProgress: Int,
    val note: String,
)

@RestController
@RequestMapping("/api/sessions/current/checkin")
class CheckinController(
    private val saveCheckinUseCase: SaveCheckinUseCase,
) {
    @PutMapping
    fun update(
        @Valid @RequestBody request: CheckinRequest,
        member: CurrentMember,
    ): CheckinResponse {
        val result = saveCheckinUseCase.saveCheckin(request.toCommand(member))
        return CheckinResponse(result.readingProgress, result.note)
    }
}
