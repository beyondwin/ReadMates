package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.AdminClubAiUsage
import com.readmates.club.application.model.AdminClubClosingRisks
import com.readmates.club.application.model.AdminClubMemberActivity
import com.readmates.club.application.model.AdminClubNotificationHealth
import com.readmates.club.application.model.AdminClubOperationsClub
import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminClubReadinessSummary
import com.readmates.club.application.model.AdminClubSafeLink
import com.readmates.club.application.model.AdminClubSessionProgress
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import com.readmates.club.application.port.out.AdminClubOperationsSnapshotPort
import com.readmates.club.application.port.out.AdminTodayClosingRisksPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class AdminClubOperationsServiceTest {
    @Test
    fun `support can read operations snapshot`() {
        val service = AdminClubOperationsService(FakePort(snapshot()), FakeTodayClosingRisksPort())

        val result = service.operationsSnapshot(admin(PlatformAdminRole.SUPPORT), CLUB_ID)

        assertThat(result.schema).isEqualTo("admin.club_operations_snapshot.v1")
        assertThat(result.club.clubId).isEqualTo(CLUB_ID)
    }

    @Test
    fun `not found maps to platform admin club not found`() {
        val service = AdminClubOperationsService(FakePort(null), FakeTodayClosingRisksPort())

        assertThatThrownBy { service.operationsSnapshot(admin(PlatformAdminRole.OWNER), CLUB_ID) }
            .isInstanceOfSatisfying(PlatformAdminException::class.java) { error ->
                assertThat(error.error).isEqualTo(PlatformAdminError.CLUB_NOT_FOUND)
            }
    }

    private class FakePort(
        private val snapshot: AdminClubOperationsSnapshot?,
    ) : AdminClubOperationsSnapshotPort {
        override fun loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot? = snapshot
    }

    private class FakeTodayClosingRisksPort : AdminTodayClosingRisksPort {
        override fun loadTodayClosingRisks(limit: Int): AdminTodayClosingRiskSnapshot =
            AdminTodayClosingRiskSnapshot(
                generatedAt = OffsetDateTime.of(2026, 5, 27, 0, 0, 0, 0, ZoneOffset.UTC),
                items = emptyList(),
            )
    }

    private fun admin(role: PlatformAdminRole): CurrentPlatformAdmin =
        CurrentPlatformAdmin(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000901"),
            email = "admin@example.com",
            role = role,
        )

    private fun snapshot(): AdminClubOperationsSnapshot =
        AdminClubOperationsSnapshot(
            generatedAt = OffsetDateTime.of(2026, 5, 27, 0, 0, 0, 0, ZoneOffset.UTC),
            club = AdminClubOperationsClub(CLUB_ID, "reading-sai", "읽는사이", "ACTIVE", "PUBLIC"),
            readiness = AdminClubReadinessSummary("READY", emptyList(), null),
            memberActivity = AdminClubMemberActivity(1, 0, 0, 1),
            sessionProgress = AdminClubSessionProgress(1, 1, 0, 0, 0),
            notificationHealth = AdminClubNotificationHealth(0, 0, 0, null, emptyList()),
            aiUsage = AdminClubAiUsage(0, 0, 0, "0.0000", "NO_RECENT_USAGE"),
            closingRisks = AdminClubClosingRisks(0, 0, 0, emptyList()),
            safeLinks = listOf(AdminClubSafeLink("Host app", "/clubs/reading-sai/app", "HOST_ROUTE")),
        )

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
    }
}
