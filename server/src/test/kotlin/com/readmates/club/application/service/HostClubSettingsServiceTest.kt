package com.readmates.club.application.service

import com.readmates.club.application.model.HostClubApprovalPolicy
import com.readmates.club.application.model.HostClubRecordPublicationDefault
import com.readmates.club.application.model.UpdateHostClubSettingsCommand
import com.readmates.club.application.port.out.HostClubSettingsStorePort
import com.readmates.club.application.port.out.StoredHostClubClosePreview
import com.readmates.club.application.port.out.StoredHostClubSettings
import com.readmates.club.application.port.out.StoredHostClubSettingsCommand
import com.readmates.club.application.port.out.StoredHostClubSettingsHistory
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class HostClubSettingsServiceTest {
    private val clubId = UUID.randomUUID()
    private val hostId = UUID.randomUUID()
    private val actor =
        ClubActor(
            UUID.randomUUID(),
            hostId,
            clubId,
            "reading-room",
            setOf(ClubCapability.MANAGE_MEMBERS),
        )
    private val store = FakeStore(clubId, hostId)
    private val service =
        HostClubSettingsService(
            store,
            Clock.fixed(Instant.parse("2026-08-30T00:00:00Z"), ZoneOffset.UTC),
        )

    @Test
    fun `updates canonical settings with independent revision and append only history`() {
        val result =
            service.update(
                actor,
                UpdateHostClubSettingsCommand(
                    0,
                    "  함께 읽는 방 ",
                    HostClubApprovalPolicy.INVITE_ONLY,
                    "Asia/Seoul",
                    false,
                    HostClubRecordPublicationDefault.MEMBER,
                    "settings-1",
                ),
            )

        assertThat(result.settings.name).isEqualTo("함께 읽는 방")
        assertThat(result.settings.revision).isEqualTo(1)
        assertThat(store.settings.hostSettingsRevision).isEqualTo(1)
        assertThat(
            store.history
                .single()
                .afterSettings.keys,
        ).containsExactlyInAnyOrder(
            "name",
            "approvalPolicy",
            "defaultTimezone",
            "scheduleReminderEnabled",
            "recordPublicationDefault",
        )
    }

    @Test
    fun `settings update claims the club lock before idempotency replay lookup`() {
        service.update(
            actor,
            UpdateHostClubSettingsCommand(
                0,
                "함께 읽는 방",
                HostClubApprovalPolicy.INVITE_ONLY,
                "Asia/Seoul",
                false,
                HostClubRecordPublicationDefault.MEMBER,
                "settings-lock-order",
            ),
        )

        assertThat(store.calls.take(2)).containsExactly("load:locked", "find-command")
    }

    @Test
    fun `cohost demotion preserves at least one active host`() {
        assertThatThrownBy { service.demoteCoHost(actor, hostId, 0, "demote-last") }
            .extracting("code")
            .isEqualTo("LAST_ACTIVE_HOST_REQUIRED")
        assertThat(store.settings.hostSettingsRevision).isZero()
    }

    @Test
    fun `cohost promotion is club scoped and appends revisioned history`() {
        val memberId = UUID.randomUUID()
        store.roles[memberId] = "MEMBER"

        val result = service.promoteCoHost(actor, memberId, 0, "promote-member")

        assertThat(result.role).isEqualTo("HOST")
        assertThat(result.revision).isEqualTo(1)
        assertThat(store.roles[memberId]).isEqualTo("HOST")
        assertThat(store.history.single().action).isEqualTo("CO_HOST_PROMOTED")
    }

    @Test
    fun `stale settings and invalid timezone fail before mutation`() {
        assertThatThrownBy {
            service.update(
                actor,
                UpdateHostClubSettingsCommand(
                    1,
                    "변경",
                    HostClubApprovalPolicy.INVITE_ONLY,
                    "Asia/Seoul",
                    true,
                    HostClubRecordPublicationDefault.MEMBER,
                    "stale",
                ),
            )
        }.extracting("code").isEqualTo("HOST_SETTINGS_STALE")
        assertThatThrownBy {
            service.update(
                actor,
                UpdateHostClubSettingsCommand(
                    0,
                    "변경",
                    HostClubApprovalPolicy.INVITE_ONLY,
                    "Not/A_Timezone",
                    true,
                    HostClubRecordPublicationDefault.MEMBER,
                    "bad-zone",
                ),
            )
        }.extracting("code").isEqualTo("INVALID_DEFAULT_TIMEZONE")
        assertThatThrownBy {
            service.update(
                actor,
                UpdateHostClubSettingsCommand(
                    0,
                    "변경",
                    HostClubApprovalPolicy.INVITE_ONLY,
                    "+09:00",
                    true,
                    HostClubRecordPublicationDefault.MEMBER,
                    "fixed-offset-zone",
                ),
            )
        }.extracting("code").isEqualTo("INVALID_DEFAULT_TIMEZONE")
        assertThat(store.history).isEmpty()
    }

    @Test
    fun `club end preview binds actor club revision and effect hash then confirm is idempotent`() {
        val preview = service.previewClubEnd(actor)
        assertThat(store.settings.status).isEqualTo("ACTIVE")

        val result = service.confirmClubEnd(actor, preview.previewId, preview.effectHash, "close-1")
        val replay = service.confirmClubEnd(actor, preview.previewId, preview.effectHash, "close-1")

        assertThat(result.status).isEqualTo("ARCHIVED")
        assertThat(replay.receiptId).isEqualTo(result.receiptId)
        assertThat(replay.replayed).isTrue()
    }

    @Test
    fun `club end rejects a preview bound to another actor without archiving`() {
        val preview = service.previewClubEnd(actor)
        val otherHost = actor.copy(membershipId = UUID.randomUUID())

        assertThatThrownBy { service.confirmClubEnd(otherHost, preview.previewId, preview.effectHash, "wrong-actor") }
            .extracting("code")
            .isEqualTo("HOST_CLUB_CLOSE_PREVIEW_MISMATCH")
        assertThat(store.settings.status).isEqualTo("ACTIVE")
        assertThat(store.history).isEmpty()
    }

    private class FakeStore(
        clubId: UUID,
        hostId: UUID,
    ) : HostClubSettingsStorePort {
        var settings =
            StoredHostClubSettings(
                clubId,
                "reading-room",
                "독서방",
                "HOST_APPROVAL",
                "Asia/Seoul",
                true,
                "HOST_ONLY",
                0,
                "ACTIVE",
            )
        val roles = mutableMapOf(hostId to "HOST")
        val history = mutableListOf<StoredHostClubSettingsHistory>()
        val commands = mutableListOf<StoredHostClubSettingsCommand>()
        val previews = mutableListOf<StoredHostClubClosePreview>()
        val calls = mutableListOf<String>()

        override fun load(
            clubId: UUID,
            forUpdate: Boolean,
        ) = settings.takeIf { it.clubId == clubId }.also {
            calls += if (forUpdate) "load:locked" else "load"
        }

        override fun findCommand(
            clubId: UUID,
            actorMembershipId: UUID,
            keyHash: String,
        ) = commands.firstOrNull { it.keyHash == keyHash }.also { calls += "find-command" }

        override fun updateSettings(
            next: StoredHostClubSettings,
            expectedRevision: Long,
            history: StoredHostClubSettingsHistory,
            command: StoredHostClubSettingsCommand,
        ) {
            settings =
                next
            this.history += history
            commands += command
        }

        override fun activeHostCount(clubId: UUID) = roles.values.count { it == "HOST" }

        override fun membershipRole(
            clubId: UUID,
            membershipId: UUID,
            forUpdate: Boolean,
        ) = roles[membershipId]

        override fun updateMembershipRole(
            clubId: UUID,
            membershipId: UUID,
            role: String,
        ) {
            roles[membershipId] = role
        }

        override fun appendHistoryAndCommand(
            history: StoredHostClubSettingsHistory,
            command: StoredHostClubSettingsCommand,
        ) {
            this.history +=
                history
            commands += command
            settings = settings.copy(hostSettingsRevision = history.revision)
        }

        override fun history(
            clubId: UUID,
            pageRequest: PageRequest,
        ) = CursorPage(history.toList(), null)

        override fun saveClosePreview(preview: StoredHostClubClosePreview) {
            previews += preview
        }

        override fun loadClosePreview(
            previewId: UUID,
            forUpdate: Boolean,
        ) = previews.firstOrNull { it.id == previewId }

        override fun archiveClub(
            clubId: UUID,
            expectedRevision: Long,
            previewId: UUID,
            command: StoredHostClubSettingsCommand,
            history: StoredHostClubSettingsHistory,
        ) {
            settings =
                settings.copy(status = "ARCHIVED", hostSettingsRevision = expectedRevision + 1)
            commands += command
            this.history += history
            previews.replaceAll {
                if (it.id ==
                    previewId
                ) {
                    it.copy(consumedReceiptId = command.receiptId)
                } else {
                    it
                }
            }
        }
    }
}
