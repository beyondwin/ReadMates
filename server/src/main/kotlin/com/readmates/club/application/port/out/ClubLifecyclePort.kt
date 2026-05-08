package com.readmates.club.application.port.out

import com.readmates.club.domain.ClubStatus
import java.util.UUID

interface ClubLifecyclePort {
    fun loadCurrentStatus(clubId: UUID): ClubStatus?
    fun transitionStatus(clubId: UUID, from: ClubStatus, to: ClubStatus): Boolean
    fun insertAuditEvent(
        clubId: UUID,
        actorUserId: UUID?,
        actorPlatformRole: String?,
        eventType: String,
        metadataJson: String,
    )
}
