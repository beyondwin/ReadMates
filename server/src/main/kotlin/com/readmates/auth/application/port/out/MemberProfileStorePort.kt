package com.readmates.auth.application.port.out

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import java.util.UUID

data class MemberProfileRow(
    val membershipId: UUID,
    val userId: UUID,
    val clubId: UUID,
    val email: String,
    val displayName: String,
    val shortName: String,
    val profileImageUrl: String?,
    val role: MembershipRole,
    val status: MembershipStatus,
)

interface MemberProfileStorePort {
    fun findProfileMemberByEmail(email: String): MemberProfileRow?
    fun findProfileMemberInClubForUpdate(clubId: UUID, membershipId: UUID): MemberProfileRow?
    fun shortNameExistsInClub(clubId: UUID, shortName: String, excludingMembershipId: UUID): Boolean
    fun updateShortName(clubId: UUID, membershipId: UUID, shortName: String): Boolean
    fun findHostMemberListItem(clubId: UUID, membershipId: UUID): HostMemberListRow?
}
