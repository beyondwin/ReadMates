package com.readmates.shared.security

import com.readmates.club.domain.PlatformAdminRole
import java.util.UUID

data class CurrentPlatformAdmin(
    val userId: UUID,
    val email: String,
    val role: PlatformAdminRole,
) {
    val canManagePlatformAdmins: Boolean
        get() = role == PlatformAdminRole.OWNER

    val canCreateClub: Boolean
        get() = role in setOf(PlatformAdminRole.OWNER, PlatformAdminRole.OPERATOR)

    val canManageClubDomains: Boolean
        get() = role in setOf(PlatformAdminRole.OWNER, PlatformAdminRole.OPERATOR)
}

data class CurrentUser(
    val userId: UUID,
    val email: String,
)
