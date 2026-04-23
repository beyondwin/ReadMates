package com.readmates.auth.application.port.out

import com.readmates.auth.domain.MembershipStatus
import java.time.OffsetDateTime
import java.util.UUID

data class ViewerMemberRow(
    val membershipId: UUID,
    val userId: UUID,
    val email: String,
    val displayName: String,
    val shortName: String,
    val profileImageUrl: String?,
    val status: MembershipStatus,
    val createdAt: OffsetDateTime,
)

interface MemberApprovalStorePort {
    fun listPendingViewers(clubId: UUID): List<ViewerMemberRow>
    fun activateViewer(clubId: UUID, membershipId: UUID): Boolean
    fun deactivateViewer(clubId: UUID, membershipId: UUID): Boolean
    fun addToCurrentOpenSession(clubId: UUID, membershipId: UUID)
    fun findMemberForHost(clubId: UUID, membershipId: UUID): ViewerMemberRow?
}
