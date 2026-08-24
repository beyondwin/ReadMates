package com.readmates.shared.security

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
        role = role,
        capabilities = platformCapabilitiesFor(role),
    )

private fun platformCapabilitiesFor(role: PlatformAdminRole): Set<PlatformCapability> =
    when (role) {
        PlatformAdminRole.OWNER -> OWNER_PLATFORM_CAPABILITIES
        PlatformAdminRole.OPERATOR -> OPERATOR_PLATFORM_CAPABILITIES
        PlatformAdminRole.SUPPORT -> SHARED_PLATFORM_VIEW_CAPABILITIES
    }

private val SHARED_PLATFORM_VIEW_CAPABILITIES =
    setOf(
        PlatformCapability.VIEW_TODAY,
        PlatformCapability.VIEW_CLUBS,
        PlatformCapability.VIEW_CLUB_OPERATIONS,
        PlatformCapability.VIEW_SERVICE_HEALTH,
        PlatformCapability.VIEW_NOTIFICATION_OPERATIONS,
        PlatformCapability.VIEW_AI_OPERATIONS,
        PlatformCapability.VIEW_SUPPORT,
        PlatformCapability.VIEW_AUDIT,
        PlatformCapability.VIEW_ANALYTICS,
    )

private val OPERATOR_PLATFORM_CAPABILITIES =
    setOf(
        PlatformCapability.VIEW_TODAY,
        PlatformCapability.VIEW_CLUBS,
        PlatformCapability.VIEW_CLUB_OPERATIONS,
        PlatformCapability.VIEW_SERVICE_HEALTH,
        PlatformCapability.VIEW_NOTIFICATION_OPERATIONS,
        PlatformCapability.REPLAY_NOTIFICATIONS,
        PlatformCapability.VIEW_AI_OPERATIONS,
        PlatformCapability.MANAGE_AI_OPERATIONS,
        PlatformCapability.VIEW_SUPPORT,
        PlatformCapability.VIEW_AUDIT,
        PlatformCapability.VIEW_SENSITIVE_AUDIT,
        PlatformCapability.VIEW_ANALYTICS,
        PlatformCapability.EXPORT_ANALYTICS,
        PlatformCapability.CREATE_CLUB,
        PlatformCapability.MANAGE_CLUBS,
        PlatformCapability.MANAGE_CLUB_DOMAINS,
        PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN,
    )

private val OWNER_PLATFORM_CAPABILITIES =
    setOf(
        PlatformCapability.VIEW_TODAY,
        PlatformCapability.VIEW_CLUBS,
        PlatformCapability.VIEW_CLUB_OPERATIONS,
        PlatformCapability.VIEW_SERVICE_HEALTH,
        PlatformCapability.VIEW_NOTIFICATION_OPERATIONS,
        PlatformCapability.REPLAY_NOTIFICATIONS,
        PlatformCapability.VIEW_AI_OPERATIONS,
        PlatformCapability.MANAGE_AI_OPERATIONS,
        PlatformCapability.VIEW_SUPPORT,
        PlatformCapability.MANAGE_SUPPORT_ACCESS,
        PlatformCapability.VIEW_AUDIT,
        PlatformCapability.VIEW_SENSITIVE_AUDIT,
        PlatformCapability.VIEW_ANALYTICS,
        PlatformCapability.EXPORT_ANALYTICS,
        PlatformCapability.CREATE_CLUB,
        PlatformCapability.MANAGE_CLUBS,
        PlatformCapability.MANAGE_CLUB_DOMAINS,
        PlatformCapability.MANAGE_PLATFORM_ADMINS,
        PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN,
    )

data class CurrentUser(
    val userId: UUID,
    val email: String,
)
