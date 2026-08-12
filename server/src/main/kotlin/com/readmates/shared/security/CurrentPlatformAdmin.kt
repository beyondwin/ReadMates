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

    val canManageSupportAccess: Boolean
        get() = role == PlatformAdminRole.OWNER
}

fun CurrentPlatformAdmin.toPlatformActor(): PlatformActor =
    PlatformActor(
        adminId = userId,
        capabilities =
            when (role) {
                PlatformAdminRole.OWNER -> PlatformCapability.entries.toSet()
                PlatformAdminRole.OPERATOR ->
                    setOf(
                        PlatformCapability.VIEW_CLUBS,
                        PlatformCapability.VIEW_CLUB_OPERATIONS,
                        PlatformCapability.CREATE_CLUB,
                        PlatformCapability.MANAGE_CLUBS,
                        PlatformCapability.MANAGE_CLUB_DOMAINS,
                    )
                PlatformAdminRole.SUPPORT ->
                    setOf(
                        PlatformCapability.VIEW_CLUBS,
                        PlatformCapability.VIEW_CLUB_OPERATIONS,
                    )
            },
    )

data class CurrentUser(
    val userId: UUID,
    val email: String,
)
