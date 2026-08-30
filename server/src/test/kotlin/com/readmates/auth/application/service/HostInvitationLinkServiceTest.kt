package com.readmates.auth.application.service

import com.readmates.auth.application.InvitationDomainException
import com.readmates.auth.application.model.CreateHostInvitationLinkCommand
import com.readmates.auth.application.model.HostInvitationLinkStatus
import com.readmates.auth.application.model.UpdateHostInvitationLinkCommand
import com.readmates.auth.application.port.out.HostInvitationLinkStorePort
import com.readmates.auth.application.port.out.StoredHostInvitationLink
import com.readmates.auth.application.port.out.StoredHostInvitationLinkCommand
import com.readmates.auth.application.port.out.StoredHostInvitationLinkEvent
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class HostInvitationLinkServiceTest {
    private val clock = Clock.fixed(Instant.parse("2026-08-30T00:00:00Z"), ZoneOffset.UTC)
    private val clubId = UUID.randomUUID()
    private val hostId = UUID.randomUUID()
    private val actor = ClubActor(UUID.randomUUID(), hostId, clubId, "reading-room", setOf(ClubCapability.MANAGE_INVITATIONS))
    private val store = FakeStore()
    private val service = HostInvitationLinkService(store, InvitationTokenService(), clock)

    @Test
    fun `create discloses one path once and replay returns receipt without secret`() {
        val command = CreateHostInvitationLinkCommand("  가을 신규 멤버  ", 3, OffsetDateTime.parse("2026-09-30T00:00:00Z"), "command-1")

        val created = service.create(actor, command)
        val replayed = service.create(actor, command)

        assertThat(created.oneTimeSharePath).startsWith("/clubs/reading-room/invite/lnk_")
        assertThat(replayed.oneTimeSharePath).isNull()
        assertThat(replayed.receipt.receiptId).isEqualTo(created.receipt.receiptId)
        assertThat(store.links.single().tokenHash).hasSize(64)
        assertThat(store.toString()).doesNotContain(created.oneTimeSharePath)
        assertThat(store.events).hasSize(1)
    }

    @Test
    fun `same idempotency key with a different canonical command conflicts`() {
        service.create(actor, CreateHostInvitationLinkCommand("첫 이름", 2, OffsetDateTime.parse("2026-09-30T00:00:00Z"), "same-key"))

        assertThatThrownBy {
            service.create(actor, CreateHostInvitationLinkCommand("다른 이름", 2, OffsetDateTime.parse("2026-09-30T00:00:00Z"), "same-key"))
        }.isInstanceOf(InvitationDomainException::class.java)
            .extracting("code")
            .isEqualTo("INVITATION_LINK_IDEMPOTENCY_CONFLICT")
    }

    @Test
    fun `update requires revision and records an append only allowlisted event`() {
        val created =
            service.create(
                actor,
                CreateHostInvitationLinkCommand("초대", 2, OffsetDateTime.parse("2026-09-30T00:00:00Z"), "create"),
            )

        val updated =
            service.update(
                actor,
                created.link.linkId,
                UpdateHostInvitationLinkCommand(
                    0,
                    "초대 연장",
                    4,
                    OffsetDateTime.parse("2026-10-30T00:00:00Z"),
                    HostInvitationLinkStatus.PAUSED,
                    "pause",
                ),
            )

        assertThat(updated.link.revision).isEqualTo(1)
        assertThat(updated.link.status).isEqualTo(HostInvitationLinkStatus.PAUSED)
        assertThat(store.events.map { it.action }).containsExactly("CREATED", "UPDATED")
        assertThat(
            store.events
                .last()
                .beforeSettings.keys,
        ).containsExactlyInAnyOrder("name", "maxUses", "expiresAt", "status")

        assertThatThrownBy {
            service.update(
                actor,
                created.link.linkId,
                UpdateHostInvitationLinkCommand(
                    0,
                    "stale",
                    4,
                    OffsetDateTime.parse("2026-10-30T00:00:00Z"),
                    HostInvitationLinkStatus.ACTIVE,
                    "stale",
                ),
            )
        }.isInstanceOf(InvitationDomainException::class.java)
            .extracting("code")
            .isEqualTo("INVITATION_LINK_STALE")
    }

    @Test
    fun `resume rejects exhausted and expired links`() {
        val exhausted =
            service.create(
                actor,
                CreateHostInvitationLinkCommand("소진", 1, OffsetDateTime.parse("2026-09-30T00:00:00Z"), "exhausted"),
            )
        store.links[0] = store.links[0].copy(usedCount = 1, status = HostInvitationLinkStatus.EXHAUSTED)

        assertThatThrownBy {
            service.update(
                actor,
                exhausted.link.linkId,
                UpdateHostInvitationLinkCommand(
                    0,
                    "소진",
                    1,
                    OffsetDateTime.parse("2026-09-30T00:00:00Z"),
                    HostInvitationLinkStatus.ACTIVE,
                    "resume",
                ),
            )
        }.isInstanceOf(InvitationDomainException::class.java)
            .extracting("code")
            .isEqualTo("INVITATION_LINK_EXHAUSTED")
    }

    @Test
    fun `member without invitation capability is denied before store access`() {
        val member = actor.copy(capabilities = emptySet())
        assertThatThrownBy {
            service.create(member, CreateHostInvitationLinkCommand("초대", 1, OffsetDateTime.parse("2026-09-30T00:00:00Z"), "denied"))
        }.isInstanceOf(InvitationDomainException::class.java)
            .extracting("code")
            .isEqualTo("HOST_REQUIRED")
        assertThat(store.links).isEmpty()
    }

    private inner class FakeStore : HostInvitationLinkStorePort {
        val links = mutableListOf<StoredHostInvitationLink>()
        val commands = mutableListOf<StoredHostInvitationLinkCommand>()
        val events = mutableListOf<StoredHostInvitationLinkEvent>()

        override fun findCommand(
            clubId: UUID,
            actorMembershipId: UUID,
            idempotencyKeyHash: String,
        ) = commands.firstOrNull {
            it.clubId == clubId && it.actorMembershipId == actorMembershipId &&
                it.idempotencyKeyHash == idempotencyKeyHash
        }

        override fun insertLink(
            link: StoredHostInvitationLink,
            command: StoredHostInvitationLinkCommand,
            event: StoredHostInvitationLinkEvent,
        ) {
            links += link
            commands += command
            events += event
        }

        override fun list(
            clubId: UUID,
            pageRequest: PageRequest,
        ): CursorPage<StoredHostInvitationLink> = CursorPage(links.filter { it.clubId == clubId }, null)

        override fun findForUpdate(
            clubId: UUID,
            linkId: UUID,
        ) = links.firstOrNull { it.clubId == clubId && it.id == linkId }

        override fun update(
            link: StoredHostInvitationLink,
            command: StoredHostInvitationLinkCommand,
            event: StoredHostInvitationLinkEvent,
        ) {
            val index = links.indexOfFirst { it.id == link.id }
            links[index] = link
            commands += command
            events += event
        }

        override fun history(
            clubId: UUID,
            linkId: UUID,
            pageRequest: PageRequest,
        ): CursorPage<StoredHostInvitationLinkEvent> = CursorPage(events.filter { it.clubId == clubId && it.linkId == linkId }, null)

        override fun findByTokenHash(
            tokenHash: String,
            forUpdate: Boolean,
        ) = links.firstOrNull { it.tokenHash == tokenHash }

        override fun consume(
            linkId: UUID,
            expectedRevision: Long,
            event: StoredHostInvitationLinkEvent,
        ): StoredHostInvitationLink {
            val index = links.indexOfFirst { it.id == linkId }
            val next = links[index].copy(usedCount = links[index].usedCount + 1, revision = expectedRevision + 1)
            links[index] = next
            events += event
            return next
        }
    }
}
