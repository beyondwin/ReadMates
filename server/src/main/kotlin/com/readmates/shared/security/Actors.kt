package com.readmates.shared.security

import java.util.UUID

enum class ClubCapability {
    BROWSE_MEMBER_CONTENT,
    EDIT_OWN_PROFILE,
    VIEW_PENDING_APPROVAL,
    MANAGE_INVITATIONS,
    MANAGE_MEMBERS,
}

data class ClubActor(
    override val userId: UUID,
    override val membershipId: UUID,
    override val clubId: UUID,
    override val clubSlug: String,
    val capabilities: Set<ClubCapability>,
) : AuthenticatedClubActor {
    override val isHost: Boolean
        get() = ClubCapability.MANAGE_MEMBERS in capabilities

    fun can(capability: ClubCapability): Boolean = capability in capabilities
}

enum class PlatformCapability {
    VIEW_TODAY,
    VIEW_CLUBS,
    VIEW_CLUB_OPERATIONS,
    VIEW_SERVICE_HEALTH,
    VIEW_NOTIFICATION_OPERATIONS,
    REPLAY_NOTIFICATIONS,
    VIEW_AI_OPERATIONS,
    MANAGE_AI_OPERATIONS,
    VIEW_SUPPORT,
    MANAGE_SUPPORT_ACCESS,
    VIEW_AUDIT,
    VIEW_SENSITIVE_AUDIT,
    VIEW_ANALYTICS,
    EXPORT_ANALYTICS,
    CREATE_CLUB,
    MANAGE_CLUBS,
    MANAGE_CLUB_DOMAINS,
    MANAGE_PLATFORM_ADMINS,
    EMERGENCY_PUBLIC_TAKEDOWN,
}

data class PlatformActor(
    val adminId: UUID,
    val capabilities: Set<PlatformCapability>,
) {
    fun can(capability: PlatformCapability): Boolean = capability in capabilities
}
