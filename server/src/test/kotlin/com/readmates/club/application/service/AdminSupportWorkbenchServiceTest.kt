package com.readmates.club.application.service

import com.readmates.club.application.model.AdminSupportGrantLedgerItem
import com.readmates.club.application.model.AdminSupportSearchResult
import com.readmates.club.application.port.out.AdminSupportGrantLedgerPort
import com.readmates.club.application.port.out.AdminSupportSearchPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class AdminSupportWorkbenchServiceTest {
    @Test
    fun `owner search returns masked results`() {
        val service = AdminSupportWorkbenchService(FakeSearchPort(), FakeLedgerPort())

        val results = service.search(admin(PlatformAdminRole.OWNER), "support", null)

        assertThat(results).hasSize(1)
        assertThat(results.single().maskedEmail).isEqualTo("s***@example.com")
    }

    @Test
    fun `operator cannot search sensitive subjects`() {
        val service = AdminSupportWorkbenchService(FakeSearchPort(), FakeLedgerPort())

        assertThatThrownBy { service.search(admin(PlatformAdminRole.OPERATOR), "support", null) }
            .isInstanceOf(com.readmates.shared.security.AccessDeniedException::class.java)
    }

    @Test
    fun `wildcard and oversized searches fail closed`() {
        val service = AdminSupportWorkbenchService(FakeSearchPort(), FakeLedgerPort())

        listOf("%", "_", "\\", "x".repeat(121)).forEach { query ->
            assertThatThrownBy { service.search(admin(PlatformAdminRole.OWNER), query, null) }
                .isInstanceOf(com.readmates.club.application.PlatformAdminException::class.java)
        }
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
            status: String?,
            cursor: com.readmates.club.application.model.AdminSupportGrantLedgerCursor?,
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
