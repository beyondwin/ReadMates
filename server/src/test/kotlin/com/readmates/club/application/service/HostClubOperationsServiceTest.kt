package com.readmates.club.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.AdminClubAiUsage
import com.readmates.club.application.model.AdminClubMemberActivity
import com.readmates.club.application.model.AdminClubNotificationHealth
import com.readmates.club.application.model.AdminClubOperationsClub
import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminClubReadinessSummary
import com.readmates.club.application.model.AdminClubSafeLink
import com.readmates.club.application.model.AdminClubSessionProgress
import com.readmates.club.application.port.out.AdminClubOperationsSnapshotPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostClubOperationsServiceTest {
    private val clubId = UUID.randomUUID()

    private fun snapshot() =
        AdminClubOperationsSnapshot(
            generatedAt = OffsetDateTime.parse("2026-05-31T00:00:00Z"),
            club = AdminClubOperationsClub(clubId, "club-one", "Club One", "ACTIVE", "PUBLIC"),
            readiness = AdminClubReadinessSummary("READY", emptyList(), null),
            memberActivity = AdminClubMemberActivity(3, 1, 0, 1),
            sessionProgress = AdminClubSessionProgress(1, 1, 4, 3, 1),
            notificationHealth = AdminClubNotificationHealth(0, 0, 0, null, emptyList(), 0, 0),
            aiUsage = AdminClubAiUsage(1, 2, 0, "0.5000", "DEGRADED", 1),
            safeLinks = listOf(AdminClubSafeLink("운영 상세", "/admin/clubs/$clubId", "ADMIN_ROUTE")),
        )

    private fun port(loader: (UUID) -> AdminClubOperationsSnapshot?) =
        object : AdminClubOperationsSnapshotPort {
            override fun loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot? = loader(clubId)
        }

    private fun host(role: MembershipRole) =
        CurrentMember(
            userId = UUID.randomUUID(),
            membershipId = UUID.randomUUID(),
            clubId = clubId,
            clubSlug = "club-one",
            email = "host@example.com",
            displayName = "Host",
            accountName = "host",
            role = role,
            membershipStatus = MembershipStatus.ACTIVE,
            clubName = "Club One",
        )

    private fun service(p: AdminClubOperationsSnapshotPort) = HostClubOperationsService(p)

    @Test
    fun `projects own club snapshot to host subset`() {
        val result = service(port { id -> if (id == clubId) snapshot() else null })
            .hostOperationsSnapshot(host(MembershipRole.HOST))

        assertThat(result.schema).isEqualTo("host.club_operations_snapshot.v1")
        assertThat(result.club.clubId).isEqualTo(clubId)
        assertThat(result.readiness.state).isEqualTo("READY")
        assertThat(result.sessionProgress.closedCount).isEqualTo(4)
        assertThat(result.aiUsage.state).isEqualTo("DEGRADED")
    }

    @Test
    fun `denies a non-host member`() {
        assertThatThrownBy {
            service(port { snapshot() }).hostOperationsSnapshot(host(MembershipRole.MEMBER))
        }.isInstanceOf(AccessDeniedException::class.java)
    }
}
