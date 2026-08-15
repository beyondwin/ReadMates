package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import com.readmates.club.application.port.`in`.GetAdminClubOperationsUseCase
import com.readmates.club.application.port.`in`.ListAdminTodayClosingRisksUseCase
import com.readmates.club.application.port.out.AdminClosingRiskLedgerPort
import com.readmates.club.application.port.out.AdminClubOperationsSnapshotPort
import com.readmates.club.application.port.out.AdminTodayClosingRisksPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class AdminClubOperationsService(
    private val snapshotPort: AdminClubOperationsSnapshotPort,
    private val todayClosingRisksPort: AdminTodayClosingRisksPort,
    private val ledgerPort: AdminClosingRiskLedgerPort,
) : GetAdminClubOperationsUseCase,
    ListAdminTodayClosingRisksUseCase {
    override fun operationsSnapshot(
        admin: PlatformActor,
        clubId: UUID,
    ): AdminClubOperationsSnapshot {
        requireViewClubOperations(admin)
        val snapshot =
            snapshotPort.loadSnapshot(clubId)
                ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
        return try {
            val sync = ledgerPort.syncClub(clubId, snapshot.closingRisks.items, snapshot.generatedAt)
            snapshot.copy(
                closingRisks =
                    snapshot.closingRisks.copy(
                        items = sync.activeItems,
                        recentlyResolvedItems = sync.recentlyResolvedItems,
                        trackingUnavailable = false,
                    ),
            )
        } catch (_: RuntimeException) {
            snapshot.copy(
                closingRisks =
                    snapshot.closingRisks.copy(
                        items = snapshot.closingRisks.items.map { it.copy(ledgerState = "UNTRACKED") },
                        recentlyResolvedItems = emptyList(),
                        trackingUnavailable = true,
                    ),
            )
        }
    }

    override fun todayClosingRisks(admin: PlatformActor): AdminTodayClosingRiskSnapshot {
        requireViewClubOperations(admin)
        return todayClosingRisksPort.loadTodayClosingRisks(TODAY_CLOSING_RISK_LIMIT).let { snapshot ->
            try {
                snapshot.copy(
                    items = ledgerPort.syncToday(snapshot.items, snapshot.generatedAt),
                    trackingUnavailable = false,
                )
            } catch (_: RuntimeException) {
                snapshot.copy(
                    items = snapshot.items.map { it.copy(ledgerState = "UNTRACKED") },
                    trackingUnavailable = true,
                )
            }
        }
    }

    private fun requireViewClubOperations(admin: PlatformActor) {
        if (!admin.can(PlatformCapability.VIEW_CLUB_OPERATIONS)) {
            throw AccessDeniedException("Platform admin role cannot view club operations")
        }
    }

    private companion object {
        private const val TODAY_CLOSING_RISK_LIMIT = 25
    }
}
