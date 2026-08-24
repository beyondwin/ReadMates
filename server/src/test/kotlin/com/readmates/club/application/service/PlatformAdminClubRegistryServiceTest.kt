package com.readmates.club.application.service

import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.out.ClubPublicProjectionLock
import com.readmates.club.application.port.out.ClubPublicProjectionMutation
import com.readmates.club.application.port.out.ClubPublicProjectionMutationPort
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPatch
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class PlatformAdminClubRegistryServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")

    @Test
    fun `actor without view clubs is denied before load port call`() {
        val port = CountingClubPort()
        val service = PlatformAdminClubRegistryService(port, port)

        assertThatThrownBy { service.listClubs(actor()) }.isInstanceOf(AccessDeniedException::class.java)

        assertThat(port.listCalls).isZero()
    }

    @Test
    fun `support actor can list clubs`() {
        val port = CountingClubPort()
        val service = PlatformAdminClubRegistryService(port, port)

        val result = service.listClubs(actor(PlatformCapability.VIEW_CLUBS))

        assertThat(result).isEqualTo(PlatformAdminClubList(emptyList()))
        assertThat(port.listCalls).isEqualTo(1)
    }

    @Test
    fun `actor without manage clubs is denied before update port call`() {
        val port = CountingClubPort()
        val service = PlatformAdminClubRegistryService(port, port)

        assertThatThrownBy {
            service.updateClub(
                actor(PlatformCapability.MANAGE_CLUB_DOMAINS),
                UUID.randomUUID(),
                UpdatePlatformAdminClubCommand(null, null, null, null),
            )
        }.isInstanceOf(AccessDeniedException::class.java)

        assertThat(port.loadCalls).isZero()
        assertThat(port.updateCalls).isZero()
    }

    @Test
    fun `public exposure locks sorted sessions before club update and projection rotation`() {
        val calls = mutableListOf<String>()
        val sessionIds =
            listOf(
                UUID.fromString("00000000-0000-0000-0000-000000000306"),
                UUID.fromString("00000000-0000-0000-0000-000000000305"),
            ).sortedBy(UUID::toString)
        val port = UpdatingClubPort(calls)
        val projection = RecordingPublicProjectionPort(calls, sessionIds)
        val service = PlatformAdminClubRegistryService(port, port, projection)

        service.updateClub(
            actor(PlatformCapability.MANAGE_CLUBS),
            clubId,
            UpdatePlatformAdminClubCommand(null, null, null, ClubPublicVisibility.PRIVATE),
        )

        assertThat(calls).containsExactly("session-locks", "club-load-for-update", "club-update", "projection-record")
    }

    @Test
    fun `repeated identical exposure reloads locked current and records only first effect`() {
        val calls = mutableListOf<String>()
        val port = UpdatingClubPort(calls)
        val projection = RecordingPublicProjectionPort(calls, emptyList())
        val service = PlatformAdminClubRegistryService(port, port, projection)
        val command = UpdatePlatformAdminClubCommand(null, null, null, ClubPublicVisibility.PRIVATE)

        service.updateClub(actor(PlatformCapability.MANAGE_CLUBS), clubId, command)
        service.updateClub(actor(PlatformCapability.MANAGE_CLUBS), clubId, command)

        assertThat(calls).containsExactly(
            "session-locks",
            "club-load-for-update",
            "club-update",
            "projection-record",
            "session-locks",
            "club-load-for-update",
            "club-update",
        )
    }

    private fun actor(vararg capabilities: PlatformCapability): PlatformActor =
        PlatformActor(UUID.fromString("00000000-0000-0000-0000-0000000000bb"), capabilities.toSet())

    private class CountingClubPort :
        LoadPlatformAdminClubsPort,
        UpdatePlatformAdminClubPort {
        var listCalls = 0
        var loadCalls = 0
        var updateCalls = 0

        override fun listClubs(limit: Int): List<PlatformAdminClubListItem> {
            listCalls += 1
            return emptyList()
        }

        override fun loadClub(clubId: UUID): PlatformAdminClubListItem? {
            loadCalls += 1
            return null
        }

        override fun loadClubForUpdate(clubId: UUID): PlatformAdminClubListItem? = loadClub(clubId)

        override fun activeHostCount(clubId: UUID): Int = 0

        override fun updateClub(
            clubId: UUID,
            patch: UpdatePlatformAdminClubPatch,
        ): PlatformAdminClubListItem? {
            updateCalls += 1
            return null
        }
    }

    private inner class UpdatingClubPort(
        private val calls: MutableList<String>,
    ) : LoadPlatformAdminClubsPort,
        UpdatePlatformAdminClubPort {
        private var current = club(ClubPublicVisibility.PUBLIC)

        override fun listClubs(limit: Int): List<PlatformAdminClubListItem> = listOf(current)

        override fun loadClub(clubId: UUID): PlatformAdminClubListItem = current

        override fun loadClubForUpdate(clubId: UUID): PlatformAdminClubListItem {
            calls += "club-load-for-update"
            return current
        }

        override fun activeHostCount(clubId: UUID): Int = 1

        override fun updateClub(
            clubId: UUID,
            patch: UpdatePlatformAdminClubPatch,
        ): PlatformAdminClubListItem {
            calls += "club-update"
            current = current.copy(publicVisibility = patch.publicVisibility ?: current.publicVisibility)
            return current
        }
    }

    private inner class RecordingPublicProjectionPort(
        private val calls: MutableList<String>,
        private val sessionIds: List<UUID>,
    ) : ClubPublicProjectionMutationPort {
        var recordedMutation: ClubPublicProjectionMutation? = null

        override fun lockForExposure(clubId: UUID): ClubPublicProjectionLock {
            calls += "session-locks"
            return TestClubProjectionLock
        }

        override fun record(mutation: ClubPublicProjectionMutation): Int {
            calls += "projection-record"
            recordedMutation = mutation
            return sessionIds.size + 1
        }
    }

    private data object TestClubProjectionLock : ClubPublicProjectionLock

    private fun club(publicVisibility: ClubPublicVisibility) =
        PlatformAdminClubListItem(
            clubId = clubId,
            slug = "test-club",
            name = "Test Club",
            tagline = "A calm reading club",
            about = "A public-safe test club description",
            status = ClubStatus.ACTIVE,
            publicVisibility = publicVisibility,
            domainCount = 0,
            domainActionRequiredCount = 0,
            notificationFailureCount = 0,
            aiFailureCount = 0,
            firstHostOnboardingState = com.readmates.club.application.model.FirstHostOnboardingState.ASSIGNED,
        )
}
