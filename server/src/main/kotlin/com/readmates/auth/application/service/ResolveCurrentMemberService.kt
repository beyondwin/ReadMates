package com.readmates.auth.application.service

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.application.port.out.MemberAccountStorePort
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class ResolveCurrentMemberService(
    private val memberAccountStore: MemberAccountStorePort,
) : ResolveCurrentMemberUseCase {
    override fun resolveByEmail(email: String): CurrentMember? =
        memberAccountStore.findActiveMemberByEmail(email)

    override fun findUserIdByEmail(email: String): UUID? =
        memberAccountStore.findAnyUserIdByEmail(email)

    override fun resolveByUserAndClub(userId: UUID, clubId: UUID): CurrentMember? =
        memberAccountStore.findMemberByUserIdAndClubId(userId, clubId)

    override fun resolveByEmailAndClub(email: String, clubId: UUID): CurrentMember? =
        memberAccountStore.findMemberByEmailAndClubId(email, clubId)

    override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> =
        memberAccountStore.listJoinedClubs(userId)

    override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? =
        memberAccountStore.findPlatformAdmin(userId)
}
