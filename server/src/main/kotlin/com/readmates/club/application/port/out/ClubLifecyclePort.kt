package com.readmates.club.application.port.out

import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import java.util.UUID

data class ClubLifecycleState(
    val clubId: UUID,
    val status: ClubStatus,
    val publicVisibility: ClubPublicVisibility,
)

interface ClubLifecyclePort {
    fun loadCurrentForUpdate(clubId: UUID): ClubLifecycleState?

    fun transitionStatus(
        clubId: UUID,
        from: ClubStatus,
        to: ClubStatus,
    ): Boolean

    fun insertAuditEvent(
        clubId: UUID,
        actorUserId: UUID?,
        actorPlatformRole: String?,
        eventType: String,
        metadataJson: String,
    )
}
