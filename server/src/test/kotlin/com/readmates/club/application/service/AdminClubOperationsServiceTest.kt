package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.AdminClubAiUsage
import com.readmates.club.application.model.AdminClubClosingRiskItem
import com.readmates.club.application.model.AdminClubClosingRisks
import com.readmates.club.application.model.AdminClubMemberActivity
import com.readmates.club.application.model.AdminClubNotificationHealth
import com.readmates.club.application.model.AdminClubOperationsClub
import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminClubReadinessSummary
import com.readmates.club.application.model.AdminClubSafeLink
import com.readmates.club.application.model.AdminClubSessionProgress
import com.readmates.club.application.model.AdminTodayClosingRiskItem
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import com.readmates.club.application.port.out.AdminClosingRiskLedgerPort
import com.readmates.club.application.port.out.AdminClubClosingRiskLedgerSync
import com.readmates.club.application.port.out.AdminClubOperationsSnapshotPort
import com.readmates.club.application.port.out.AdminTodayClosingRisksPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class AdminClubOperationsServiceTest {
    @Test
    fun `support can read operations snapshot`() {
        val service = AdminClubOperationsService(FakePort(snapshot()), FakeTodayClosingRisksPort(), FakeLedgerPort())

        val result = service.operationsSnapshot(admin(PlatformAdminRole.SUPPORT), CLUB_ID)

        assertThat(result.schema).isEqualTo("admin.club_operations_snapshot.v1")
        assertThat(result.club.clubId).isEqualTo(CLUB_ID)
    }

    @Test
    fun `not found maps to platform admin club not found`() {
        val service = AdminClubOperationsService(FakePort(null), FakeTodayClosingRisksPort(), FakeLedgerPort())

        assertThatThrownBy { service.operationsSnapshot(admin(PlatformAdminRole.OWNER), CLUB_ID) }
            .isInstanceOfSatisfying(PlatformAdminException::class.java) { error ->
                assertThat(error.error).isEqualTo(PlatformAdminError.CLUB_NOT_FOUND)
            }
    }

    @Test
    fun `today closing risks include tracking fields from ledger`() {
        val service =
            AdminClubOperationsService(
                FakePort(snapshot()),
                FakeTodayClosingRisksPort(
                    AdminTodayClosingRiskSnapshot(generatedAt = GENERATED_AT, items = listOf(todayRisk())),
                ),
                FakeLedgerPort(
                    todayItems =
                        listOf(todayRisk().copy(ageDays = 3, occurrenceCount = 2, ledgerState = "ACTIVE")),
                ),
            )

        val result = service.todayClosingRisks(admin(PlatformAdminRole.OWNER))

        assertThat(result.trackingUnavailable).isFalse()
        assertThat(result.items.single().ageDays).isEqualTo(3)
        assertThat(result.items.single().occurrenceCount).isEqualTo(2)
        assertThat(result.items.single().ledgerState).isEqualTo("ACTIVE")
    }

    @Test
    fun `ledger failure degrades today closing risks to untracked`() {
        val service =
            AdminClubOperationsService(
                FakePort(snapshot()),
                FakeTodayClosingRisksPort(
                    AdminTodayClosingRiskSnapshot(generatedAt = GENERATED_AT, items = listOf(todayRisk())),
                ),
                ThrowingLedgerPort(),
            )

        val result = service.todayClosingRisks(admin(PlatformAdminRole.OWNER))

        assertThat(result.trackingUnavailable).isTrue()
        assertThat(result.items.single().ledgerState).isEqualTo("UNTRACKED")
        assertThat(result.items.single().ageDays).isNull()
    }

    @Test
    fun `operations snapshot includes active and recently resolved ledger items`() {
        val active = clubRisk().copy(ageDays = 3, occurrenceCount = 2, ledgerState = "ACTIVE")
        val resolved = clubRisk().copy(overallState = "RESOLVED", resolvedAt = GENERATED_AT, ledgerState = "RESOLVED")
        val service =
            AdminClubOperationsService(
                FakePort(snapshot(closingRisks = AdminClubClosingRisks(1, 1, 0, listOf(clubRisk())))),
                FakeTodayClosingRisksPort(),
                FakeLedgerPort(clubSync = AdminClubClosingRiskLedgerSync(listOf(active), listOf(resolved))),
            )

        val result = service.operationsSnapshot(admin(PlatformAdminRole.OWNER), CLUB_ID)
        val closingRisks = result.closingRisks
        val activeItem = closingRisks.items.single()
        val resolvedItem = closingRisks.recentlyResolvedItems.single()

        assertThat(closingRisks.trackingUnavailable).isFalse()
        assertThat(activeItem.ledgerState)
            .isEqualTo("ACTIVE")
        assertThat(activeItem.ageDays)
            .isEqualTo(3)
        assertThat(resolvedItem.ledgerState)
            .isEqualTo("RESOLVED")
    }

    @Test
    fun `ledger failure degrades operations closing risks to untracked`() {
        val service =
            AdminClubOperationsService(
                FakePort(snapshot(closingRisks = AdminClubClosingRisks(1, 1, 0, listOf(clubRisk())))),
                FakeTodayClosingRisksPort(),
                ThrowingLedgerPort(),
            )

        val result = service.operationsSnapshot(admin(PlatformAdminRole.OWNER), CLUB_ID)
        val closingRisks = result.closingRisks
        val activeItem = closingRisks.items.single()

        assertThat(closingRisks.trackingUnavailable).isTrue()
        assertThat(activeItem.ledgerState)
            .isEqualTo("UNTRACKED")
        assertThat(activeItem.ageDays)
            .isNull()
        assertThat(closingRisks.recentlyResolvedItems).isEmpty()
    }

    private class FakePort(
        private val snapshot: AdminClubOperationsSnapshot?,
    ) : AdminClubOperationsSnapshotPort {
        override fun loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot? = snapshot
    }

    private class FakeTodayClosingRisksPort(
        private val snapshot: AdminTodayClosingRiskSnapshot =
            AdminTodayClosingRiskSnapshot(generatedAt = GENERATED_AT, items = emptyList()),
    ) : AdminTodayClosingRisksPort {
        override fun loadTodayClosingRisks(limit: Int): AdminTodayClosingRiskSnapshot = snapshot
    }

    private class FakeLedgerPort(
        private val todayItems: List<AdminTodayClosingRiskItem> = emptyList(),
        private val clubSync: AdminClubClosingRiskLedgerSync = AdminClubClosingRiskLedgerSync(emptyList(), emptyList()),
    ) : AdminClosingRiskLedgerPort {
        override fun syncToday(
            items: List<AdminTodayClosingRiskItem>,
            observedAt: OffsetDateTime,
        ): List<AdminTodayClosingRiskItem> = todayItems.ifEmpty { items }

        override fun syncClub(
            clubId: UUID,
            items: List<AdminClubClosingRiskItem>,
            observedAt: OffsetDateTime,
        ): AdminClubClosingRiskLedgerSync =
            if (clubSync.activeItems.isEmpty() && clubSync.recentlyResolvedItems.isEmpty()) {
                AdminClubClosingRiskLedgerSync(items, emptyList())
            } else {
                clubSync
            }
    }

    private class ThrowingLedgerPort : AdminClosingRiskLedgerPort {
        override fun syncToday(
            items: List<AdminTodayClosingRiskItem>,
            observedAt: OffsetDateTime,
        ): List<AdminTodayClosingRiskItem> = error("ledger unavailable")

        override fun syncClub(
            clubId: UUID,
            items: List<AdminClubClosingRiskItem>,
            observedAt: OffsetDateTime,
        ): AdminClubClosingRiskLedgerSync = error("ledger unavailable")
    }

    private fun admin(role: PlatformAdminRole): CurrentPlatformAdmin =
        CurrentPlatformAdmin(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000901"),
            email = "admin@example.com",
            role = role,
        )

    private fun snapshot(closingRisks: AdminClubClosingRisks = EMPTY_CLOSING_RISKS): AdminClubOperationsSnapshot =
        AdminClubOperationsSnapshot(
            generatedAt = GENERATED_AT,
            club = AdminClubOperationsClub(CLUB_ID, "reading-sai", "읽는사이", "ACTIVE", "PUBLIC"),
            readiness = AdminClubReadinessSummary("READY", emptyList(), null),
            memberActivity = AdminClubMemberActivity(1, 0, 0, 1),
            sessionProgress = AdminClubSessionProgress(1, 1, 0, 0, 0),
            notificationHealth = AdminClubNotificationHealth(0, 0, 0, null, emptyList()),
            aiUsage = AdminClubAiUsage(0, 0, 0, "0.0000", "NO_RECENT_USAGE"),
            closingRisks = closingRisks,
            safeLinks = listOf(AdminClubSafeLink("Host app", "/clubs/reading-sai/app", "HOST_ROUTE")),
        )

    private fun todayRisk(): AdminTodayClosingRiskItem =
        AdminTodayClosingRiskItem(
            clubId = CLUB_ID,
            clubSlug = "reading-sai",
            clubName = "읽는사이",
            sessionId = SESSION_ID,
            sessionNumber = 7,
            bookTitle = "페인트",
            meetingDate = LocalDate.parse("2026-06-18"),
            overallState = "BLOCKED",
            primaryBlocker = "FEEDBACK_DOCUMENT_INVALID",
            hostClosingHref = "/clubs/reading-sai/app/host/sessions/$SESSION_ID/closing",
        )

    private fun clubRisk(): AdminClubClosingRiskItem =
        AdminClubClosingRiskItem(
            sessionId = SESSION_ID,
            sessionNumber = 7,
            bookTitle = "페인트",
            meetingDate = LocalDate.parse("2026-06-18"),
            overallState = "BLOCKED",
            primaryBlocker = "FEEDBACK_DOCUMENT_INVALID",
            hostClosingHref = "/clubs/reading-sai/app/host/sessions/$SESSION_ID/closing",
        )

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000707")
        val GENERATED_AT: OffsetDateTime = OffsetDateTime.of(2026, 6, 21, 0, 0, 0, 0, ZoneOffset.UTC)
        val EMPTY_CLOSING_RISKS: AdminClubClosingRisks = AdminClubClosingRisks(0, 0, 0, emptyList())
    }
}
