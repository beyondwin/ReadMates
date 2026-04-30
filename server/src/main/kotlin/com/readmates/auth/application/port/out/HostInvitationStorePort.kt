package com.readmates.auth.application.port.out

import com.readmates.auth.domain.InvitationStatus
import com.readmates.auth.domain.MembershipRole
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import java.time.OffsetDateTime
import java.util.UUID

data class HostInvitationListRow(
    val invitationId: UUID,
    val clubSlug: String,
    val email: String,
    val name: String,
    val role: MembershipRole,
    val status: InvitationStatus,
    val expiresAt: OffsetDateTime,
    val acceptedAt: OffsetDateTime?,
    val createdAt: OffsetDateTime,
    val applyToCurrentSession: Boolean,
    val hasActiveMembership: Boolean,
    val primaryHost: String?,
)

data class InvitationTokenRow(
    val id: UUID,
    val clubId: UUID,
    val clubSlug: String,
    val clubName: String,
    val email: String,
    val name: String,
    val role: MembershipRole,
    val status: InvitationStatus,
    val expiresAt: OffsetDateTime,
    val applyToCurrentSession: Boolean,
)

data class CreateHostInvitationCommand(
    val invitationId: UUID,
    val clubId: UUID,
    val invitedByMembershipId: UUID,
    val email: String,
    val name: String,
    val tokenHash: String,
    val applyToCurrentSession: Boolean,
    val expiresAt: OffsetDateTime,
)

interface HostInvitationStorePort {
    fun acquireInvitationCreateLock(lockKey: String)
    fun activeMemberCountByEmail(clubId: UUID, email: String): Int
    fun revokeLivePendingInvitation(clubId: UUID, email: String)
    fun createInvitation(command: CreateHostInvitationCommand)
    fun listHostInvitations(clubId: UUID, pageRequest: PageRequest): CursorPage<HostInvitationListRow>
    fun findHostInvitation(clubId: UUID, invitationId: UUID): HostInvitationListRow?
    fun revokePendingInvitation(clubId: UUID, invitationId: UUID)
    fun findInvitationByTokenHash(tokenHash: String, forUpdate: Boolean): InvitationTokenRow?
    fun upsertActiveMembership(clubId: UUID, userId: UUID, role: MembershipRole): UUID
    fun acceptInvitation(invitationId: UUID, acceptedUserId: UUID): Boolean
    fun addToCurrentOpenSessionIfSafe(clubId: UUID, membershipId: UUID)
    fun findCurrentMember(membershipId: UUID): CurrentMember?
}
