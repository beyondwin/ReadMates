package com.readmates.session.application.model

data class HostDashboardResult(
    val rsvpPending: Int,
    val checkinMissing: Int,
    val publishPending: Int,
    val feedbackPending: Int,
    val currentSessionMissingMemberCount: Int = 0,
    val currentSessionMissingMembers: List<HostDashboardMissingMemberResult> = emptyList(),
)

data class HostDashboardMissingMemberResult(
    val membershipId: String,
    val displayName: String,
    val email: String,
)
