package com.readmates.club.application.service

import com.readmates.club.application.model.AdminSupportGrantLedgerItem
import com.readmates.club.application.model.AdminSupportSearchResult
import com.readmates.club.application.port.out.AdminSupportGrantLedgerPort
import com.readmates.club.application.port.out.AdminSupportSearchPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class AdminSupportWorkbenchServiceTest {
    @Test
    fun `operator search returns masked results`() {
        val service = AdminSupportWorkbenchService(FakeSearchPort(), FakeLedgerPort())

        val results = service.search(admin(PlatformAdminRole.OPERATOR), "support", null)

        assertThat(results).hasSize(1)
        assertThat(results.single().maskedEmail).isEqualTo("s***@example.com")
    }

    @Test
    fun `support search returns empty result`() {
        val service = AdminSupportWorkbenchService(FakeSearchPort(), FakeLedgerPort())

        assertThat(service.search(admin(PlatformAdminRole.SUPPORT), "support", null)).isEmpty()
    }

    private class FakeSearchPort : AdminSupportSearchPort {
        override fun search(
            query: String,
            clubId: UUID?,
            limit: Int,
        ): List<AdminSupportSearchResult> =
            listOf(
                AdminSupportSearchResult(
                    subjectId = USER_ID,
                    displayName = "Support",
                    maskedEmail = "s***@example.com",
                    kind = "PLATFORM_ADMIN",
                    platformAdminRole = PlatformAdminRole.SUPPORT,
                    platformAdminStatus = "ACTIVE",
                    clubMembershipSummary = emptyList(),
                    grantEligible = true,
                    grantBlockedReason = null,
                ),
            )
    }

    private class FakeLedgerPort : AdminSupportGrantLedgerPort {
        override fun listLedger(
            clubId: UUID?,
            granteeUserId: UUID?,
            limit: Int,
        ): List<AdminSupportGrantLedgerItem> = emptyList()

        override fun hasActiveGrant(
            clubId: UUID,
            granteeUserId: UUID,
        ): Boolean = false

        override fun isGrantEligibleClub(clubId: UUID): Boolean = true

        override fun isActivePlatformAdmin(userId: UUID): Boolean = true
    }

    @Suppress("ktlint:standard:function-expression-body")
    private fun admin(role: PlatformAdminRole): CurrentPlatformAdmin {
        return CurrentPlatformAdmin(USER_ID, "support@example.com", role)
    }

    private companion object {
        val USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000903")
    }
}
