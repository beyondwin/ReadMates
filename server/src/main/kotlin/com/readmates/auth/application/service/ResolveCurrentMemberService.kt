package com.readmates.auth.application.service

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.auth.application.port.out.PlatformAdminLookupPort
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class ResolveCurrentMemberService(
    private val memberIdentityLookup: MemberIdentityLookupPort,
    private val platformAdminLookup: PlatformAdminLookupPort,
) : ResolveCurrentMemberUseCase {
    override fun resolveByEmail(email: String): CurrentMember? =
        memberIdentityLookup.findActiveMemberByEmail(email)

    override fun findUserIdByEmail(email: String): UUID? =
        memberIdentityLookup.findAnyUserIdByEmail(email)

    override fun resolveByUserAndClub(userId: UUID, clubId: UUID): CurrentMember? =
        memberIdentityLookup.findMemberByUserIdAndClubId(userId, clubId)

    override fun resolveByEmailAndClub(email: String, clubId: UUID): CurrentMember? =
        memberIdentityLookup.findMemberByEmailAndClubId(email, clubId)

    override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> =
        memberIdentityLookup.listJoinedClubs(userId)

    override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? =
        platformAdminLookup.findPlatformAdmin(userId)
}
