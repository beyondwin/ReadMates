package com.readmates.aigen.application.port.out

import java.util.UUID

data class ActiveClubMember(
    val membershipId: UUID,
    val displayName: String,
)

fun interface LoadAiGenerationClubMembersPort {
    fun loadActiveMembers(clubId: UUID): List<ActiveClubMember>
}
