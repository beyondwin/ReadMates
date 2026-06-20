package com.readmates.club.application.port.out

import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import java.util.UUID

interface AdminClubOperationsSnapshotPort {
    fun loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot?
}

interface AdminTodayClosingRisksPort {
    fun loadTodayClosingRisks(limit: Int): AdminTodayClosingRiskSnapshot
}
