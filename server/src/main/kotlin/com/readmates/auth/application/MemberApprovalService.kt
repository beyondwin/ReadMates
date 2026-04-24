package com.readmates.auth.application

import com.readmates.auth.domain.MembershipStatus
import com.readmates.auth.application.port.`in`.ManageMemberApprovalsUseCase
import com.readmates.auth.application.port.out.MemberApprovalStorePort
import com.readmates.auth.application.port.out.ViewerMemberRow
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

data class ViewerMemberResponse(
    val membershipId: String,
    val userId: String,
    val email: String,
    val displayName: String,
    val accountName: String,
    val profileImageUrl: String?,
    val status: MembershipStatus,
    val createdAt: String,
)

@Service
class MemberApprovalService(
    private val memberApprovalStore: MemberApprovalStorePort,
) : ManageMemberApprovalsUseCase {
    override fun listViewers(host: CurrentMember): List<ViewerMemberResponse> {
        requireHost(host)
        return memberApprovalStore.listPendingViewers(host.clubId).map(::mapViewerMember)
    }

    @Transactional
    override fun activateViewer(host: CurrentMember, membershipId: UUID): ViewerMemberResponse {
        requireHost(host)
        if (!memberApprovalStore.activateViewer(host.clubId, membershipId)) {
            throw viewerMemberNotFound()
        }

        memberApprovalStore.addToCurrentOpenSession(host.clubId, membershipId)
        return findForHost(host.clubId, membershipId)
    }

    @Transactional
    override fun deactivateViewer(host: CurrentMember, membershipId: UUID): ViewerMemberResponse {
        requireHost(host)
        if (!memberApprovalStore.deactivateViewer(host.clubId, membershipId)) {
            throw viewerMemberNotFound()
        }

        return findForHost(host.clubId, membershipId)
    }

    private fun findForHost(
        clubId: UUID,
        membershipId: UUID,
    ): ViewerMemberResponse =
        memberApprovalStore.findMemberForHost(clubId, membershipId)?.let(::mapViewerMember)
            ?: throw viewerMemberNotFound()

    private fun mapViewerMember(row: ViewerMemberRow) =
        ViewerMemberResponse(
            membershipId = row.membershipId.toString(),
            userId = row.userId.toString(),
            email = row.email,
            displayName = row.displayName,
            accountName = row.accountName,
            profileImageUrl = row.profileImageUrl,
            status = row.status,
            createdAt = row.createdAt.toString(),
        )

    private fun requireHost(member: CurrentMember) {
        if (!member.isHost) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Host role required")
        }
    }

    private fun viewerMemberNotFound(): ResponseStatusException =
        ResponseStatusException(HttpStatus.NOT_FOUND, "Viewer member not found")
}
