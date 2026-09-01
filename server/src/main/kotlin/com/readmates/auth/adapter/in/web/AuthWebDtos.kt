package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.model.AuthAccessProjection
import com.readmates.auth.application.model.AvailableClubSpace
import com.readmates.auth.application.model.AvailableSpacesV1
import com.readmates.auth.application.model.ClubPerspective
import com.readmates.auth.application.model.JoinedClubSummary
import com.readmates.auth.application.model.ProductSpaceKind
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
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
    val availableSpaces: AuthAvailableSpacesResponse,
    val membershipId: UUID? = currentMembership?.membershipId,
    val clubId: UUID? = currentMembership?.clubId,
    val displayName: String? = currentMembership?.displayName,
    val role: MembershipRole? = currentMembership?.role,
    val membershipStatus: MembershipStatus? = currentMembership?.membershipStatus,
    val avatarKey: String? = currentMembership?.avatarKey,
    val approvalState: ApprovalState,
) {
    companion object {
        fun from(
            member: CurrentMember,
            accessProjection: AuthAccessProjection,
        ): AuthMemberResponse {
            val currentMembership = AuthCurrentMembership.from(member)
            val joined = accessProjection.joinedClubs.map(AuthJoinedClub::from)
            return AuthMemberResponse(
                authenticated = true,
                userId = member.userId,
                email = member.email,
                accountName = member.accountName,
                currentMembership = currentMembership,
                joinedClubs = joined,
                platformAdmin = accessProjection.platformAdmin?.let(AuthPlatformAdmin::from),
                recommendedAppEntryUrl = recommendedAppEntryUrl(accessProjection),
                availableSpaces = AuthAvailableSpacesResponse.from(accessProjection.availableSpaces),
                approvalState = currentMembership.approvalState,
            )
        }

        fun anonymous(email: String? = null) =
            AuthMemberResponse(
                authenticated = false,
                userId = null,
                email = email,
                accountName = null,
                currentMembership = null,
                joinedClubs = emptyList(),
                platformAdmin = null,
                recommendedAppEntryUrl = "/login",
                availableSpaces = AuthAvailableSpacesResponse.empty(),
                approvalState = ApprovalState.ANONYMOUS,
            )

        fun authenticatedUser(
            userId: UUID,
            email: String,
            accessProjection: AuthAccessProjection,
        ): AuthMemberResponse {
            val joined = accessProjection.joinedClubs.map(AuthJoinedClub::from)
            return AuthMemberResponse(
                authenticated = true,
                userId = userId,
                email = email,
                accountName = null,
                currentMembership = null,
                joinedClubs = joined,
                platformAdmin = accessProjection.platformAdmin?.let(AuthPlatformAdmin::from),
                recommendedAppEntryUrl = recommendedAppEntryUrl(accessProjection),
                availableSpaces = AuthAvailableSpacesResponse.from(accessProjection.availableSpaces),
                approvalState = ApprovalState.INACTIVE,
            )
        }

        private fun recommendedAppEntryUrl(accessProjection: AuthAccessProjection): String? =
            accessProjection.recommendedSpace?.let { recommended ->
                when (recommended.kind) {
                    ProductSpaceKind.PLATFORM -> "/admin"
                    ProductSpaceKind.CLUBS -> {
                        recommended
                            .takeIf { it.perspective == ClubPerspective.MEMBER }
                            ?.clubId
                            ?.let { clubId ->
                                accessProjection.availableSpaces.clubs
                                    .singleOrNull { it.clubId == clubId }
                                    ?.takeIf { ClubPerspective.MEMBER in it.perspectives }
                                    ?.let { "/clubs/${it.clubSlug}/app" }
                            }
                    }
                }
            }
    }
}

data class AuthAvailableSpacesResponse(
    val version: Int,
    val kinds: List<ProductSpaceKind>,
    val clubs: List<AuthAvailableClubSpace>,
) {
    companion object {
        fun from(availableSpaces: AvailableSpacesV1): AuthAvailableSpacesResponse =
            AuthAvailableSpacesResponse(
                version = availableSpaces.version,
                kinds = availableSpaces.kinds,
                clubs = availableSpaces.clubs.map(AuthAvailableClubSpace::from),
            )

        fun empty(): AuthAvailableSpacesResponse =
            AuthAvailableSpacesResponse(
                version = 1,
                kinds = emptyList(),
                clubs = emptyList(),
            )
    }
}

data class AuthAvailableClubSpace(
    val clubId: UUID,
    val clubSlug: String,
    val clubName: String,
    val perspectives: List<ClubPerspective>,
) {
    companion object {
        fun from(club: AvailableClubSpace): AuthAvailableClubSpace =
            AuthAvailableClubSpace(
                clubId = club.clubId,
                clubSlug = club.clubSlug,
                clubName = club.clubName,
                perspectives = club.perspectives,
            )
    }
}

data class AuthCurrentMembership(
    val membershipId: UUID,
    val clubId: UUID,
    val clubSlug: String,
    val displayName: String,
    val role: MembershipRole,
    val membershipStatus: MembershipStatus,
    val avatarKey: String,
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
                avatarKey = member.avatarKey,
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
    val approvalState: ApprovalState,
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
                approvalState = summary.status.toApprovalState(),
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
        MembershipStatus.INVITED,
        -> ApprovalState.INACTIVE
    }

class CreateInvitationRequest(
    email: String,
    name: String,
    applyToCurrentSession: Boolean? = null,
) {
    @field:NotBlank
    @field:Email
    @field:Size(max = 320)
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
