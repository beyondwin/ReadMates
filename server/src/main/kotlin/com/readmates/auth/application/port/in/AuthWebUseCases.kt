package com.readmates.auth.application.port.`in`

import com.readmates.auth.application.HostInvitationResponse
import com.readmates.auth.application.HostMemberListItem
import com.readmates.auth.application.InvitationPreviewResponse
import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.MemberLifecycleResponse
import com.readmates.auth.application.PendingApprovalAppResponse
import com.readmates.auth.application.ViewerMemberResponse
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface ManageHostInvitationsUseCase {
    fun listHostInvitations(host: CurrentMember): List<HostInvitationResponse>

    fun createInvitation(
        host: CurrentMember,
        email: String,
        name: String,
        applyToCurrentSession: Boolean = true,
    ): HostInvitationResponse

    fun revokeInvitation(host: CurrentMember, invitationId: UUID): HostInvitationResponse
}

interface PreviewInvitationUseCase {
    fun previewInvitation(rawToken: String, clubSlug: String? = null): InvitationPreviewResponse
}

interface ManageMemberApprovalsUseCase {
    fun listViewers(host: CurrentMember): List<ViewerMemberResponse>
    fun activateViewer(host: CurrentMember, membershipId: UUID): ViewerMemberResponse
    fun deactivateViewer(host: CurrentMember, membershipId: UUID): ViewerMemberResponse
}

interface ManageMemberLifecycleUseCase {
    fun listMembers(host: CurrentMember): List<HostMemberListItem>
    fun suspend(host: CurrentMember, membershipId: UUID, request: MemberLifecycleRequest): MemberLifecycleResponse
    fun restore(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse
    fun deactivate(host: CurrentMember, membershipId: UUID, request: MemberLifecycleRequest): MemberLifecycleResponse
    fun addToCurrentSession(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse
    fun removeFromCurrentSession(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse
}

interface LeaveMembershipUseCase {
    fun leave(member: CurrentMember, request: MemberLifecycleRequest): MemberLifecycleResponse
}

interface GetPendingApprovalUseCase {
    fun get(member: CurrentMember): PendingApprovalAppResponse
}

interface DevLoginMemberUseCase {
    fun findDevSeedActiveMemberByEmail(email: String): CurrentMember?
}
