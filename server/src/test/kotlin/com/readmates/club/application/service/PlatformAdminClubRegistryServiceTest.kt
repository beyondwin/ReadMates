package com.readmates.club.application.service

import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPatch
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class PlatformAdminClubRegistryServiceTest {
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

        override fun activeHostCount(clubId: UUID): Int = 0

        override fun updateClub(
            clubId: UUID,
            patch: UpdatePlatformAdminClubPatch,
        ): PlatformAdminClubListItem? {
            updateCalls += 1
            return null
        }
    }
}
