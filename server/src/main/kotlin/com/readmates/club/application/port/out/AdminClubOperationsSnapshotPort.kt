package com.readmates.club.application.port.out

import com.readmates.club.application.model.AdminClubClosingRiskItem
import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminTodayClosingRiskItem
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import java.time.OffsetDateTime
import java.util.UUID

interface AdminClubOperationsSnapshotPort {
    fun loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot?
}

interface AdminTodayClosingRisksPort {
    fun loadTodayClosingRisks(limit: Int): AdminTodayClosingRiskSnapshot
}

interface AdminClosingRiskLedgerPort {
    fun syncToday(
        items: List<AdminTodayClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): List<AdminTodayClosingRiskItem>

    fun syncClub(
        clubId: UUID,
        items: List<AdminClubClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): AdminClubClosingRiskLedgerSync
}

data class AdminClubClosingRiskLedgerSync(
    val activeItems: List<AdminClubClosingRiskItem>,
    val recentlyResolvedItems: List<AdminClubClosingRiskItem>,
)
