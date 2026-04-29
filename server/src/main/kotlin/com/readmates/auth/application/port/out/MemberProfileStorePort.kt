package com.readmates.auth.application.port.out

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import java.util.UUID

data class MemberProfileRow(
    val membershipId: UUID,
    val userId: UUID,
    val clubId: UUID,
    val clubSlug: String,
    val email: String,
    val displayName: String,
    val accountName: String,
    val profileImageUrl: String?,
    val role: MembershipRole,
    val status: MembershipStatus,
)

interface MemberProfileStorePort {
    fun findProfileMemberByEmail(email: String): MemberProfileRow?
    fun findProfileMemberByUserId(userId: UUID): MemberProfileRow?
    fun findProfileMemberInClubForUpdate(clubId: UUID, membershipId: UUID): MemberProfileRow?
    fun lockClubProfileNames(clubId: UUID): Boolean
    fun displayNameExistsInClub(clubId: UUID, displayName: String, excludingMembershipId: UUID): Boolean
    fun updateOwnDisplayName(clubId: UUID, membershipId: UUID, displayName: String): Boolean
    fun updateDisplayName(clubId: UUID, membershipId: UUID, displayName: String): Boolean
    fun findHostMemberListItem(clubId: UUID, membershipId: UUID): HostMemberListRow?
}
