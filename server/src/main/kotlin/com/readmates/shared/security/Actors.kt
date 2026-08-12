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
    VIEW_CLUBS,
    VIEW_CLUB_OPERATIONS,
    CREATE_CLUB,
    MANAGE_CLUBS,
    MANAGE_CLUB_DOMAINS,
    MANAGE_SUPPORT_ACCESS,
    MANAGE_PLATFORM_ADMINS,
}

data class PlatformActor(
    val adminId: UUID,
    val capabilities: Set<PlatformCapability>,
) {
    fun can(capability: PlatformCapability): Boolean = capability in capabilities
}
