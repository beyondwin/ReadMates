package com.readmates.auth.application.port.out

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.domain.SessionParticipationStatus
import java.time.OffsetDateTime
import java.util.UUID

data class LifecycleMembershipRow(
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

data class HostMemberListRow(
    val membershipId: UUID,
    val userId: UUID,
    val email: String,
    val displayName: String,
    val shortName: String,
    val profileImageUrl: String?,
    val role: MembershipRole,
    val status: MembershipStatus,
    val joinedAt: OffsetDateTime?,
    val createdAt: OffsetDateTime,
    val currentSessionId: UUID?,
    val participationStatus: SessionParticipationStatus?,
)

interface MemberLifecycleStorePort {
    fun listMembers(clubId: UUID): List<HostMemberListRow>
    fun suspendActiveMember(clubId: UUID, membershipId: UUID): Boolean
    fun restoreSuspendedMember(clubId: UUID, membershipId: UUID): Boolean
    fun markMemberLeftByHost(clubId: UUID, membershipId: UUID): Boolean
    fun markMembershipLeft(clubId: UUID, membershipId: UUID): Boolean
    fun findCurrentOpenSessionId(clubId: UUID): UUID?
    fun addToCurrentSession(clubId: UUID, sessionId: UUID, membershipId: UUID)
    fun markRemovedFromCurrentSession(clubId: UUID, sessionId: UUID, membershipId: UUID)
    fun findMembershipInClubForUpdate(clubId: UUID, membershipId: UUID): LifecycleMembershipRow?
    fun lockActiveHostRows(clubId: UUID)
    fun activeHostCount(clubId: UUID): Int
    fun findHostMemberListItem(clubId: UUID, membershipId: UUID): HostMemberListRow?
}
