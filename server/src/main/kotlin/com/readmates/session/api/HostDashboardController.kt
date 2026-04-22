package com.readmates.session.api

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.session.application.SessionRepository
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class HostDashboardResponse(
    val rsvpPending: Int,
    val checkinMissing: Int,
    val publishPending: Int,
    val feedbackPending: Int,
    val currentSessionMissingMemberCount: Int = 0,
    val currentSessionMissingMembers: List<HostDashboardMissingMember> = emptyList(),
)

data class HostDashboardMissingMember(
    val membershipId: String,
    val displayName: String,
    val email: String,
)

@RestController
@RequestMapping("/api/host/dashboard")
class HostDashboardController(
    private val memberAccountRepository: MemberAccountRepository,
    private val sessionRepository: SessionRepository,
) {
    @GetMapping
    fun dashboard(authentication: Authentication?): HostDashboardResponse {
        val member = currentMember(authentication)
        if (!member.isHost) {
            throw AccessDeniedException("Host role required")
        }

        return sessionRepository.hostDashboard(member)
    }

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}
