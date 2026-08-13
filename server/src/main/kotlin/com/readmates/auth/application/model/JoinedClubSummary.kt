package com.readmates.auth.application.model

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import java.util.UUID

data class JoinedClubSummary(
    val clubId: UUID,
    val clubSlug: String,
    val clubName: String,
    val membershipId: UUID,
    val role: MembershipRole,
    val status: MembershipStatus,
    val primaryHost: String?,
)
