package com.readmates.session.api

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.session.application.SessionRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.Pattern
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class AttendanceEntry(
    @field:NotBlank val membershipId: String,
    @field:Pattern(regexp = "ATTENDED|ABSENT") val attendanceStatus: String,
)

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/attendance")
class AttendanceController(
    private val memberAccountRepository: MemberAccountRepository,
    private val sessionRepository: SessionRepository,
) {
    @PostMapping
    fun confirm(
        authentication: Authentication?,
        @PathVariable sessionId: String,
        @Valid @RequestBody @NotEmpty entries: List<@Valid AttendanceEntry>,
    ) = sessionRepository.confirmAttendance(currentMember(authentication), parseHostSessionId(sessionId), entries)

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}
