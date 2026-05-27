package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.port.`in`.GetAdminClubOperationsUseCase
import com.readmates.club.application.port.out.AdminClubOperationsSnapshotPort
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class AdminClubOperationsService(
    private val snapshotPort: AdminClubOperationsSnapshotPort,
) : GetAdminClubOperationsUseCase {
    override fun operationsSnapshot(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
    ): AdminClubOperationsSnapshot =
        snapshotPort.loadSnapshot(clubId)
            ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
}
