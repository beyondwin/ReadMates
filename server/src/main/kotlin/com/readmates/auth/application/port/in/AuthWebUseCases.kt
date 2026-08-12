package com.readmates.auth.application.port.`in`

import com.readmates.auth.application.HostMemberListItem
import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.MemberLifecycleResponse
import com.readmates.auth.application.model.DevSeedLoginIdentity
import com.readmates.auth.application.model.PendingApprovalAppResponse
import com.readmates.auth.application.service.HostInvitationResponse
import com.readmates.auth.application.service.InvitationPreviewResponse
import com.readmates.auth.application.service.ViewerMemberResponse
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.ClubActor
import java.util.UUID

interface ManageHostInvitationsUseCase {
    fun listHostInvitations(
        host: ClubActor,
        pageRequest: PageRequest,
    ): CursorPage<HostInvitationResponse>

    fun createInvitation(
        host: ClubActor,
        email: String,
        name: String,
        applyToCurrentSession: Boolean = true,
    ): HostInvitationResponse

    fun revokeInvitation(
        host: ClubActor,
        invitationId: UUID,
    ): HostInvitationResponse
}

interface PreviewInvitationUseCase {
    fun previewInvitation(
        rawToken: String,
        clubSlug: String? = null,
    ): InvitationPreviewResponse
}

interface ManageMemberApprovalsUseCase {
    fun listViewers(
        host: ClubActor,
        pageRequest: PageRequest,
    ): CursorPage<ViewerMemberResponse>

    fun activateViewer(
        host: ClubActor,
        membershipId: UUID,
    ): ViewerMemberResponse

    fun deactivateViewer(
        host: ClubActor,
        membershipId: UUID,
    ): ViewerMemberResponse
}

interface ManageMemberLifecycleUseCase {
    fun listMembers(
        host: ClubActor,
        pageRequest: PageRequest,
    ): CursorPage<HostMemberListItem>

    fun suspend(
        host: ClubActor,
        membershipId: UUID,
        request: MemberLifecycleRequest,
    ): MemberLifecycleResponse

    fun restore(
        host: ClubActor,
        membershipId: UUID,
    ): MemberLifecycleResponse

    fun deactivate(
        host: ClubActor,
        membershipId: UUID,
        request: MemberLifecycleRequest,
    ): MemberLifecycleResponse

    fun addToCurrentSession(
        host: ClubActor,
        membershipId: UUID,
    ): MemberLifecycleResponse

    fun removeFromCurrentSession(
        host: ClubActor,
        membershipId: UUID,
    ): MemberLifecycleResponse
}

interface LeaveMembershipUseCase {
    fun leave(
        actor: ClubActor,
        request: MemberLifecycleRequest,
    ): MemberLifecycleResponse
}

interface GetPendingApprovalUseCase {
    fun get(actor: ClubActor): PendingApprovalAppResponse
}

interface DevLoginMemberUseCase {
    fun findDevSeedActiveMemberByEmail(email: String): CurrentMember?

    fun findDevSeedLoginIdentityByEmail(email: String): DevSeedLoginIdentity?
}
