package com.readmates.club.application.port.out

import com.readmates.club.application.model.AdminSupportGrantLedgerItem
import com.readmates.club.application.model.AdminSupportSearchResult
import java.util.UUID

interface AdminSupportSearchPort {
    fun search(
        query: String,
        clubId: UUID?,
        limit: Int,
    ): List<AdminSupportSearchResult>
}

interface AdminSupportGrantLedgerPort {
    fun listLedger(
        clubId: UUID?,
        granteeUserId: UUID?,
        limit: Int,
    ): List<AdminSupportGrantLedgerItem>

    fun hasActiveGrant(
        clubId: UUID,
        granteeUserId: UUID,
    ): Boolean

    fun isGrantEligibleClub(clubId: UUID): Boolean

    fun isActivePlatformAdmin(userId: UUID): Boolean
}
