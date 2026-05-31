package com.readmates.club.application.port.out

import com.readmates.club.application.model.AdminClubOperationsSnapshot
import java.util.UUID

interface AdminClubOperationsSnapshotPort {
    fun loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot?
}
