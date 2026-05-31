package com.readmates.club.application.service

import com.readmates.club.application.model.HostClubOperationsSnapshot
import com.readmates.club.application.model.toHostSnapshot
import com.readmates.club.application.port.`in`.GetHostClubOperationsUseCase
import com.readmates.club.application.port.out.AdminClubOperationsSnapshotPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class HostClubOperationsService(
    private val snapshotPort: AdminClubOperationsSnapshotPort,
) : GetHostClubOperationsUseCase {
    override fun hostOperationsSnapshot(host: CurrentMember): HostClubOperationsSnapshot {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        val snapshot =
            snapshotPort.loadSnapshot(host.clubId)
                ?: throw AccessDeniedException("Club operations snapshot unavailable")
        return snapshot.toHostSnapshot()
    }
}
