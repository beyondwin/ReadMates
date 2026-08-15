package com.readmates.shared.security

import com.readmates.auth.domain.BookClubAvatarKey
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.core.Authentication
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import java.util.Locale
import java.util.UUID

interface AuthenticatedClubActor {
    val userId: UUID
    val membershipId: UUID
    val clubId: UUID
    val clubSlug: String
    val isHost: Boolean
}

data class CurrentMember(
    override val userId: UUID,
    override val membershipId: UUID,
    override val clubId: UUID,
    override val clubSlug: String,
    val email: String,
    val displayName: String,
    val accountName: String,
    val role: MembershipRole,
    val membershipStatus: MembershipStatus = MembershipStatus.ACTIVE,
    val clubName: String = clubSlug,
    val avatarKey: String = BookClubAvatarKey.fallback.wireValue,
) : AuthenticatedClubActor {
    override val isHost: Boolean
        get() = role == MembershipRole.HOST && membershipStatus == MembershipStatus.ACTIVE
    val isActive: Boolean
        get() = membershipStatus == MembershipStatus.ACTIVE
    val isViewer: Boolean
        get() = membershipStatus == MembershipStatus.VIEWER
    val canBrowseMemberContent: Boolean
        get() =
            membershipStatus in
                setOf(
                    MembershipStatus.VIEWER,
                    MembershipStatus.ACTIVE,
                    MembershipStatus.SUSPENDED,
                )
    val canEditOwnProfile: Boolean
        get() =
            membershipStatus in
                setOf(
                    MembershipStatus.VIEWER,
                    MembershipStatus.ACTIVE,
                    MembershipStatus.SUSPENDED,
                )
}

fun CurrentMember.toClubActor(): ClubActor =
    ClubActor(
        userId = userId,
        membershipId = membershipId,
        clubId = clubId,
        clubSlug = clubSlug,
        capabilities =
            when (membershipStatus) {
                MembershipStatus.VIEWER ->
                    setOf(
                        ClubCapability.BROWSE_MEMBER_CONTENT,
                        ClubCapability.EDIT_OWN_PROFILE,
                        ClubCapability.VIEW_PENDING_APPROVAL,
                    )
                MembershipStatus.ACTIVE ->
                    setOf(
                        ClubCapability.BROWSE_MEMBER_CONTENT,
                        ClubCapability.EDIT_OWN_PROFILE,
                    ) +
                        if (role == MembershipRole.HOST) {
                            setOf(
                                ClubCapability.MANAGE_INVITATIONS,
                                ClubCapability.MANAGE_MEMBERS,
                            )
                        } else {
                            emptySet()
                        }
                MembershipStatus.SUSPENDED ->
                    setOf(
                        ClubCapability.BROWSE_MEMBER_CONTENT,
                        ClubCapability.EDIT_OWN_PROFILE,
                    )
                MembershipStatus.INVITED,
                MembershipStatus.LEFT,
                MembershipStatus.INACTIVE,
                -> emptySet()
            },
    )

data class GoogleOidcIdentity(
    val subject: String,
    val email: String,
    val displayName: String?,
    val profileImageUrl: String?,
)

fun Authentication?.emailOrNull(): String? {
    if (this == null || !isAuthenticated || this is AnonymousAuthenticationToken) {
        return null
    }

    val email =
        when (val principal = principal) {
            is CurrentMember -> principal.email
            is CurrentUser -> principal.email
            is OidcUser -> principal.email
            is UserDetails -> principal.username
            is String -> principal
            else -> name
        }

    return email
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?.lowercase(Locale.ROOT)
}

fun Authentication?.googleOidcIdentityOrNull(): GoogleOidcIdentity? {
    if (this == null || !isAuthenticated || this is AnonymousAuthenticationToken) {
        return null
    }

    val user = principal as? OidcUser ?: return null
    val subject = user.subject?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val email =
        user.email
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?.lowercase(Locale.ROOT)
            ?: return null
    val displayName = user.fullName?.trim()?.takeIf { it.isNotEmpty() }
    val profileImageUrl = user.picture?.trim()?.takeIf { it.isNotEmpty() }

    return GoogleOidcIdentity(
        subject = subject,
        email = email,
        displayName = displayName,
        profileImageUrl = profileImageUrl,
    )
}
