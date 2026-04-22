package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.port.`in`.GetHostDashboardUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class HostDashboardResponse(
    val rsvpPending: Int,
    val checkinMissing: Int,
    val publishPending: Int,
    val feedbackPending: Int,
    val currentSessionMissingMemberCount: Int = 0,
    val currentSessionMissingMembers: List<HostDashboardMissingMember> = emptyList(),
) {
    companion object {
        fun from(result: HostDashboardResult) = HostDashboardResponse(
            rsvpPending = result.rsvpPending,
            checkinMissing = result.checkinMissing,
            publishPending = result.publishPending,
            feedbackPending = result.feedbackPending,
            currentSessionMissingMemberCount = result.currentSessionMissingMemberCount,
            currentSessionMissingMembers = result.currentSessionMissingMembers.map {
                HostDashboardMissingMember(it.membershipId, it.displayName, it.email)
            },
        )
    }
}

data class HostDashboardMissingMember(
    val membershipId: String,
    val displayName: String,
    val email: String,
)

@RestController
@RequestMapping("/api/host/dashboard")
class HostDashboardController(
    private val getHostDashboardUseCase: GetHostDashboardUseCase,
) {
    @GetMapping
    fun dashboard(member: CurrentMember): HostDashboardResponse =
        HostDashboardResponse.from(getHostDashboardUseCase.dashboard(member))
}
