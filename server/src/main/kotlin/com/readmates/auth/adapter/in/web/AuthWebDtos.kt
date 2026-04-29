package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import java.util.UUID

enum class ApprovalState {
    ANONYMOUS,
    VIEWER,
    ACTIVE,
    SUSPENDED,
    INACTIVE,
}

data class AuthMemberResponse(
    val authenticated: Boolean,
    val userId: UUID?,
    val email: String?,
    val accountName: String?,
    val currentMembership: AuthCurrentMembership?,
    val joinedClubs: List<AuthJoinedClub>,
    val platformAdmin: AuthPlatformAdmin?,
    val recommendedAppEntryUrl: String?,
    val membershipId: UUID? = currentMembership?.membershipId,
    val clubId: UUID? = currentMembership?.clubId,
    val displayName: String? = currentMembership?.displayName,
    val role: MembershipRole? = currentMembership?.role,
    val membershipStatus: MembershipStatus? = currentMembership?.membershipStatus,
    val approvalState: ApprovalState,
) {
    companion object {
        fun from(
            member: CurrentMember,
            joinedClubs: List<JoinedClubSummary> = emptyList(),
            platformAdmin: CurrentPlatformAdmin? = null,
        ): AuthMemberResponse {
            val currentMembership = AuthCurrentMembership.from(member)
            val joined = joinedClubs.map(AuthJoinedClub::from)
            return AuthMemberResponse(
                authenticated = true,
                userId = member.userId,
                email = member.email,
                accountName = member.accountName,
                currentMembership = currentMembership,
                joinedClubs = joined,
                platformAdmin = platformAdmin?.let(AuthPlatformAdmin::from),
                recommendedAppEntryUrl = recommendedAppEntryUrl(joined),
                approvalState = currentMembership.approvalState,
            )
        }

        fun anonymous(email: String? = null) = AuthMemberResponse(
            authenticated = false,
            userId = null,
            email = email,
            accountName = null,
            currentMembership = null,
            joinedClubs = emptyList(),
            platformAdmin = null,
            recommendedAppEntryUrl = "/login",
            approvalState = ApprovalState.ANONYMOUS,
        )

        fun authenticatedUser(
            userId: UUID,
            email: String,
            joinedClubs: List<JoinedClubSummary> = emptyList(),
            platformAdmin: CurrentPlatformAdmin?,
        ): AuthMemberResponse {
            val joined = joinedClubs.map(AuthJoinedClub::from)
            return AuthMemberResponse(
                authenticated = true,
                userId = userId,
                email = email,
                accountName = null,
                currentMembership = null,
                joinedClubs = joined,
                platformAdmin = platformAdmin?.let(AuthPlatformAdmin::from),
                recommendedAppEntryUrl = recommendedAppEntryUrl(joined),
                approvalState = ApprovalState.INACTIVE,
            )
        }

        private fun recommendedAppEntryUrl(joinedClubs: List<AuthJoinedClub>): String? {
            val usable = joinedClubs.filter {
                it.status in setOf(MembershipStatus.VIEWER, MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED)
            }
            return usable.singleOrNull()?.let { "/clubs/${it.clubSlug}/app" }
        }
    }
}

data class AuthCurrentMembership(
    val membershipId: UUID,
    val clubId: UUID,
    val clubSlug: String,
    val displayName: String,
    val role: MembershipRole,
    val membershipStatus: MembershipStatus,
    val approvalState: ApprovalState,
) {
    companion object {
        fun from(member: CurrentMember): AuthCurrentMembership =
            AuthCurrentMembership(
                membershipId = member.membershipId,
                clubId = member.clubId,
                clubSlug = member.clubSlug,
                displayName = member.displayName,
                role = member.role,
                membershipStatus = member.membershipStatus,
                approvalState = member.membershipStatus.toApprovalState(),
            )
    }
}

data class AuthJoinedClub(
    val clubId: UUID,
    val clubSlug: String,
    val clubName: String,
    val membershipId: UUID,
    val role: MembershipRole,
    val status: MembershipStatus,
    val primaryHost: String?,
) {
    companion object {
        fun from(summary: JoinedClubSummary): AuthJoinedClub =
            AuthJoinedClub(
                clubId = summary.clubId,
                clubSlug = summary.clubSlug,
                clubName = summary.clubName,
                membershipId = summary.membershipId,
                role = summary.role,
                status = summary.status,
                primaryHost = summary.primaryHost,
            )
    }
}

data class AuthPlatformAdmin(
    val userId: UUID,
    val email: String,
    val role: PlatformAdminRole,
) {
    companion object {
        fun from(admin: CurrentPlatformAdmin): AuthPlatformAdmin =
            AuthPlatformAdmin(
                userId = admin.userId,
                email = admin.email,
                role = admin.role,
            )
    }
}

private fun MembershipStatus.toApprovalState(): ApprovalState =
    when (this) {
        MembershipStatus.VIEWER -> ApprovalState.VIEWER
        MembershipStatus.ACTIVE -> ApprovalState.ACTIVE
        MembershipStatus.SUSPENDED -> ApprovalState.SUSPENDED
        MembershipStatus.LEFT,
        MembershipStatus.INACTIVE,
        MembershipStatus.INVITED -> ApprovalState.INACTIVE
    }

class CreateInvitationRequest(email: String, name: String, applyToCurrentSession: Boolean? = null) {
    @field:NotBlank
    @field:Email
    val email: String = email.trim()

    @field:NotBlank
    val name: String = name.trim()

    val applyToCurrentSession: Boolean = applyToCurrentSession ?: true
}

data class DevLoginRequest(
    @field:NotBlank
    @field:Email
    val email: String,
)

data class InvitationErrorResponse(
    val code: String,
    val message: String,
)
