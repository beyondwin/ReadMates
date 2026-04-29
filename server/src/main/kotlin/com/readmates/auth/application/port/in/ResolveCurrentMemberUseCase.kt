package com.readmates.auth.application.port.`in`

import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import java.util.UUID

interface ResolveCurrentMemberUseCase {
    fun resolveByEmail(email: String): CurrentMember?
    fun findUserIdByEmail(email: String): UUID?
    fun resolveByUserAndClub(userId: UUID, clubId: UUID): CurrentMember?
    fun resolveByEmailAndClub(email: String, clubId: UUID): CurrentMember?
    fun listJoinedClubs(userId: UUID): List<JoinedClubSummary>
    fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin?
}
