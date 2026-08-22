package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.ClubRegistrySearch
import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PLATFORM_ADMIN_CLUB_ADMIN_REVISION
import com.readmates.club.application.model.PlatformAdminClubDetail
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminClubListQuery
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.PlatformAdminClubRegistryQuery
import com.readmates.club.application.port.out.PlatformAdminClubRegistryRow
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPatch
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class PlatformAdminClubRegistryServiceTest {
    @Test
    fun `actor without view clubs is denied before load port call`() {
        val port = CountingClubPort()
        val service = service(port)

        assertThatThrownBy { service.listClubs(actor()) }.isInstanceOf(AccessDeniedException::class.java)

        assertThat(port.listCalls).isZero()
    }

    @Test
    fun `support actor can list clubs`() {
        val port = CountingClubPort()
        val service = service(port)

        val result = service.listClubs(actor(PlatformCapability.VIEW_CLUBS))

        assertThat(result).isEqualTo(PlatformAdminClubList(emptyList()))
        assertThat(port.listCalls).isEqualTo(1)
        assertThat(port.lastQuery?.afterClubId).isNull()
        assertThat(port.lastQuery?.limit).isEqualTo(101)
    }

    @Test
    fun `normalizes unicode case and whitespace search before port call`() {
        val port = CountingClubPort()
        val service = service(port)
        val composed = "Cafe\u0301   Club"

        service.listClubs(
            actor(PlatformCapability.VIEW_CLUBS),
            PlatformAdminClubListQuery(search = "  $composed  ", limit = 20),
        )

        assertThat(port.lastQuery?.search).isEqualTo(ClubRegistrySearch.normalize(composed))
        assertThat(port.lastQuery?.limit).isEqualTo(21)
    }

    @Test
    fun `rejects limit below one and above max before port call`() {
        val port = CountingClubPort()
        val service = service(port)

        assertThatThrownBy {
            service.listClubs(actor(PlatformCapability.VIEW_CLUBS), PlatformAdminClubListQuery(limit = 0))
        }.isInstanceOf(PlatformAdminException::class.java)
            .extracting("error")
            .isEqualTo(PlatformAdminError.INVALID_CLUB)
        assertThatThrownBy {
            service.listClubs(actor(PlatformCapability.VIEW_CLUBS), PlatformAdminClubListQuery(limit = 101))
        }.isInstanceOf(PlatformAdminException::class.java)
            .extracting("error")
            .isEqualTo(PlatformAdminError.INVALID_CLUB)
        assertThat(port.listCalls).isZero()
    }

    @Test
    fun `unsigned cursor codec payload fails closed`() {
        val port = CountingClubPort()
        val service = service(port)
        val unsigned =
            CursorCodec.encode(
                mapOf(
                    "search" to "alpha",
                    "lastNormalizedName" to "alpha",
                    "lastClubId" to UUID.randomUUID().toString(),
                ),
            )

        assertThatThrownBy {
            service.listClubs(
                actor(PlatformCapability.VIEW_CLUBS),
                PlatformAdminClubListQuery(cursor = unsigned, limit = 10),
            )
        }.isInstanceOf(PlatformAdminException::class.java)
            .extracting("error")
            .isEqualTo(PlatformAdminError.INVALID_CURSOR)
        assertThat(port.listCalls).isZero()
    }

    @Test
    fun `tampered cursor mac fails closed`() {
        val port = CountingClubPort(rows = listOf(row("Alpha", CLUB_A), row("Beta", CLUB_B)))
        val signer = signer()
        val service = service(port, signer)
        val cursor =
            signer.issue(
                filter = emptyFilter(),
                lastNormalizedName = "alpha",
                lastClubId = CLUB_A,
            )
        val tampered = cursor.dropLast(1) + if (cursor.last() == 'A') 'B' else 'A'

        assertThatThrownBy {
            service.listClubs(
                actor(PlatformCapability.VIEW_CLUBS),
                PlatformAdminClubListQuery(cursor = tampered, limit = 10),
            )
        }.isInstanceOf(PlatformAdminException::class.java)
            .extracting("error")
            .isEqualTo(PlatformAdminError.INVALID_CURSOR)
        assertThat(port.listCalls).isZero()
    }

    @Test
    fun `expired cursor fails closed`() {
        val clock = Clock.fixed(Instant.parse("2026-08-22T00:00:00Z"), ZoneOffset.UTC)
        val signer = signer(clock)
        val cursor =
            signer.issue(
                filter = emptyFilter(),
                lastNormalizedName = "alpha",
                lastClubId = CLUB_A,
            )
        val expiredService = service(CountingClubPort(), signer(Clock.offset(clock, Duration.ofHours(2))))

        assertThatThrownBy {
            expiredService.listClubs(
                actor(PlatformCapability.VIEW_CLUBS),
                PlatformAdminClubListQuery(cursor = cursor, limit = 10),
            )
        }.isInstanceOf(PlatformAdminException::class.java)
            .extracting("error")
            .isEqualTo(PlatformAdminError.INVALID_CURSOR)
    }

    @Test
    fun `cursor filter mismatch fails closed`() {
        val signer = signer()
        val cursor =
            signer.issue(
                filter = emptyFilter().copy(search = "alpha"),
                lastNormalizedName = "alpha",
                lastClubId = CLUB_A,
            )
        val port = CountingClubPort()
        val service = service(port, signer)

        assertThatThrownBy {
            service.listClubs(
                actor(PlatformCapability.VIEW_CLUBS),
                PlatformAdminClubListQuery(search = "beta", cursor = cursor, limit = 10),
            )
        }.isInstanceOf(PlatformAdminException::class.java)
            .extracting("error")
            .isEqualTo(PlatformAdminError.INVALID_CURSOR)
        assertThat(port.listCalls).isZero()
    }

    @Test
    fun `issues next cursor only when page is full`() {
        val port = CountingClubPort(rows = listOf(row("Alpha", CLUB_A), row("Beta", CLUB_B)))
        val service = service(port)

        val firstPage =
            service.listClubs(
                actor(PlatformCapability.VIEW_CLUBS),
                PlatformAdminClubListQuery(limit = 1),
            )

        assertThat(firstPage.items.map { it.clubId }).containsExactly(CLUB_A)
        assertThat(firstPage.nextCursor).isNotBlank()

        val secondPage =
            service.listClubs(
                actor(PlatformCapability.VIEW_CLUBS),
                PlatformAdminClubListQuery(cursor = firstPage.nextCursor, limit = 1),
            )
        assertThat(port.lastQuery?.afterNormalizedName).isEqualTo("alpha")
        assertThat(port.lastQuery?.afterClubId).isEqualTo(CLUB_A)
        assertThat(secondPage.nextCursor).isNull()
    }

    @Test
    fun `empty result has no next cursor`() {
        val service = service(CountingClubPort())

        val result =
            service.listClubs(
                actor(PlatformCapability.VIEW_CLUBS),
                PlatformAdminClubListQuery(search = "missing", limit = 20),
            )

        assertThat(result.items).isEmpty()
        assertThat(result.nextCursor).isNull()
    }

    @Test
    fun `get club is denied before load`() {
        val port = CountingClubPort()
        val service = service(port)

        assertThatThrownBy { service.getClub(actor(), CLUB_A) }
            .isInstanceOf(AccessDeniedException::class.java)
        assertThat(port.detailCalls).isZero()
    }

    @Test
    fun `get club returns detail with zero admin revision`() {
        val detail =
            PlatformAdminClubDetail(
                clubId = CLUB_A,
                slug = "alpha",
                name = "Alpha",
                tagline = "tag",
                about = "about",
                adminRevision = PLATFORM_ADMIN_CLUB_ADMIN_REVISION,
                status = ClubStatus.ACTIVE,
                publicVisibility = ClubPublicVisibility.PRIVATE,
                domains = emptyList(),
                firstHostOnboardingState = FirstHostOnboardingState.ASSIGNED,
                domainCount = 0,
                domainActionRequiredCount = 0,
                notificationFailureCount = 0,
                aiFailureCount = 0,
            )
        val service = service(CountingClubPort(detail = detail))

        val result = service.getClub(actor(PlatformCapability.VIEW_CLUBS), CLUB_A)

        assertThat(result).isEqualTo(detail)
        assertThat(result.adminRevision).isZero()
    }

    @Test
    fun `get missing club is not found`() {
        val service = service(CountingClubPort())

        assertThatThrownBy { service.getClub(actor(PlatformCapability.VIEW_CLUBS), CLUB_A) }
            .isInstanceOf(PlatformAdminException::class.java)
            .extracting("error")
            .isEqualTo(PlatformAdminError.CLUB_NOT_FOUND)
    }

    @Test
    fun `actor without manage clubs is denied before update port call`() {
        val port = CountingClubPort()
        val service = service(port)

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

    private fun service(
        port: CountingClubPort,
        signer: PlatformAdminClubRegistryCursorSigner = signer(),
    ): PlatformAdminClubRegistryService =
        PlatformAdminClubRegistryService(
            loadClubsPort = port,
            updateClubPort = port,
            cursorSigner = signer,
        )

    private fun signer(clock: Clock = Clock.systemUTC()): PlatformAdminClubRegistryCursorSigner =
        PlatformAdminClubRegistryCursorSigner(
            properties =
                AdminCommandIdentityProperties(
                    currentKey = "test-admin-command-digest-current-key",
                    currentKeyVersion = 1,
                    previousKey = "test-admin-command-digest-previous-key",
                    previousKeyVersion = 0,
                ),
            clock = clock,
        )

    private fun actor(vararg capabilities: PlatformCapability): PlatformActor =
        PlatformActor(UUID.fromString("00000000-0000-0000-0000-0000000000bb"), capabilities.toSet())

    private fun emptyFilter() =
        PlatformAdminClubListCursorFilter(
            search = null,
            lifecycle = null,
            visibility = null,
            domainStatus = null,
            onboardingState = null,
        )

    private fun row(
        name: String,
        clubId: UUID,
        status: ClubStatus = ClubStatus.ACTIVE,
        visibility: ClubPublicVisibility = ClubPublicVisibility.PRIVATE,
        onboarding: FirstHostOnboardingState = FirstHostOnboardingState.ASSIGNED,
    ): PlatformAdminClubRegistryRow =
        PlatformAdminClubRegistryRow(
            item =
                PlatformAdminClubListItem(
                    clubId = clubId,
                    slug = name.lowercase(),
                    name = name,
                    tagline = "tag",
                    about = "about",
                    status = status,
                    publicVisibility = visibility,
                    domainCount = 0,
                    domainActionRequiredCount = 0,
                    notificationFailureCount = 0,
                    aiFailureCount = 0,
                    firstHostOnboardingState = onboarding,
                ),
            normalizedName = ClubRegistrySearch.normalize(name) ?: name.lowercase(),
        )

    private class CountingClubPort(
        private val rows: List<PlatformAdminClubRegistryRow> = emptyList(),
        private val detail: PlatformAdminClubDetail? = null,
    ) : LoadPlatformAdminClubsPort,
        UpdatePlatformAdminClubPort {
        var listCalls = 0
        var loadCalls = 0
        var detailCalls = 0
        var updateCalls = 0
        var lastQuery: PlatformAdminClubRegistryQuery? = null

        override fun listClubs(query: PlatformAdminClubRegistryQuery): List<PlatformAdminClubRegistryRow> {
            listCalls += 1
            lastQuery = query
            val start =
                if (query.afterClubId == null) {
                    0
                } else {
                    rows.indexOfFirst { it.item.clubId == query.afterClubId } + 1
                }
            return rows.drop(start.coerceAtLeast(0)).take(query.limit)
        }

        override fun loadClub(clubId: UUID): PlatformAdminClubListItem? {
            loadCalls += 1
            return rows.firstOrNull { it.item.clubId == clubId }?.item
        }

        override fun loadClubDetail(clubId: UUID): PlatformAdminClubDetail? {
            detailCalls += 1
            return detail
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

    private companion object {
        private val CLUB_A = UUID.fromString("00000000-0000-4000-8000-0000000000a1")
        private val CLUB_B = UUID.fromString("00000000-0000-4000-8000-0000000000a2")
    }
}
