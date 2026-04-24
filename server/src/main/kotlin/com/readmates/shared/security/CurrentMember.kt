package com.readmates.shared.security

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.core.Authentication
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import java.util.Locale
import java.util.UUID

data class CurrentMember(
    val userId: UUID,
    val membershipId: UUID,
    val clubId: UUID,
    val email: String,
    val displayName: String,
    val shortName: String,
    val role: MembershipRole,
    val membershipStatus: MembershipStatus = MembershipStatus.ACTIVE,
) {
    val isHost: Boolean
        get() = role == MembershipRole.HOST && membershipStatus == MembershipStatus.ACTIVE
    val isActive: Boolean
        get() = membershipStatus == MembershipStatus.ACTIVE
    val isViewer: Boolean
        get() = membershipStatus == MembershipStatus.VIEWER
    val canBrowseMemberContent: Boolean
        get() = membershipStatus in setOf(
            MembershipStatus.VIEWER,
            MembershipStatus.ACTIVE,
            MembershipStatus.SUSPENDED,
        )
    val canEditOwnProfile: Boolean
        get() = membershipStatus in setOf(
            MembershipStatus.VIEWER,
            MembershipStatus.ACTIVE,
            MembershipStatus.SUSPENDED,
        )
}

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

    val email = when (val principal = principal) {
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
    val email = user.email
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
