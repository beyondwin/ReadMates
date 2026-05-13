package com.readmates.auth.application.port.out

import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
import java.util.UUID

interface MemberIdentityLookupPort {
    fun findActiveMemberByEmail(email: String): CurrentMember?
    fun findActiveMemberByUserId(userId: String): CurrentMember?
    fun findMemberByUserIdAndClubId(userId: UUID, clubId: UUID): CurrentMember?
    fun findMemberByEmailAndClubId(email: String, clubId: UUID): CurrentMember?
    fun findMemberByUserIdIncludingViewer(userId: UUID): CurrentMember?
    fun findAnyUserIdByEmail(email: String): UUID?
    fun findUserById(userId: UUID): CurrentUser?
    fun findMembershipStatusByUserId(userId: UUID): MembershipStatus?
    fun listJoinedClubs(userId: UUID): List<JoinedClubSummary>
}
