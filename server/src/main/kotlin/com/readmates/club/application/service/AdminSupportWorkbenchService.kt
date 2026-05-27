package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.AdminSupportGrantLedgerItem
import com.readmates.club.application.model.AdminSupportSearchResult
import com.readmates.club.application.port.`in`.AdminSupportWorkbenchUseCase
import com.readmates.club.application.port.out.AdminSupportGrantLedgerPort
import com.readmates.club.application.port.out.AdminSupportSearchPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class AdminSupportWorkbenchService(
    private val searchPort: AdminSupportSearchPort,
    private val grantLedgerPort: AdminSupportGrantLedgerPort,
) : AdminSupportWorkbenchUseCase {
    override fun search(
        admin: CurrentPlatformAdmin,
        query: String,
        clubId: UUID?,
    ): List<AdminSupportSearchResult> {
        val trimmed = query.trim()
        if (trimmed.isBlank()) {
            throw PlatformAdminException(PlatformAdminError.SUPPORT_TARGET_NOT_FOUND, "Search query is required")
        }
        if (admin.role == PlatformAdminRole.SUPPORT) return emptyList()
        return searchPort.search(trimmed, clubId, SUPPORT_SEARCH_LIMIT)
    }

    override fun listGrantLedger(
        admin: CurrentPlatformAdmin,
        clubId: UUID?,
        granteeUserId: UUID?,
    ): List<AdminSupportGrantLedgerItem> =
        grantLedgerPort.listLedger(
            clubId = clubId,
            granteeUserId = granteeUserId,
            limit = GRANT_LEDGER_LIMIT,
        )
}

private const val SUPPORT_SEARCH_LIMIT = 10
private const val GRANT_LEDGER_LIMIT = 50
