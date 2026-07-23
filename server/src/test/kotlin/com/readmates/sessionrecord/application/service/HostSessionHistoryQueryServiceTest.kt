package com.readmates.sessionrecord.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.sessionrecord.application.model.HostSessionHistoryCursor
import com.readmates.sessionrecord.application.model.HostSessionHistoryItem
import com.readmates.sessionrecord.application.model.HostSessionHistoryType
import com.readmates.sessionrecord.application.port.out.HostSessionHistoryPort
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostSessionHistoryQueryServiceTest {
    private val historyPort = FakeHostSessionHistoryPort()
    private val service = HostSessionHistoryQueryService(historyPort)

    @Test
    fun `merges typed history by created time type sort and id descending`() {
        val sameTime = OffsetDateTime.parse("2026-07-23T10:00:00Z")
        historyPort.audit =
            listOf(
                item("00000000-0000-0000-0000-000000000011", HostSessionHistoryType.BASIC_INFO_UPDATED, sameTime),
            )
        historyPort.revisions =
            listOf(
                item("00000000-0000-0000-0000-000000000012", HostSessionHistoryType.RECORD_REVISION_APPLIED, sameTime),
            )
        historyPort.notifications =
            listOf(
                item("00000000-0000-0000-0000-000000000013", HostSessionHistoryType.NOTIFICATION_SKIPPED, sameTime),
            )

        val page = service.history(host(), SESSION_ID, PageRequest(limit = 2, cursor = emptyMap()))

        assertThat(page.items.map { it.type }).containsExactly(
            HostSessionHistoryType.NOTIFICATION_SKIPPED,
            HostSessionHistoryType.RECORD_REVISION_APPLIED,
        )
        val cursor = CursorCodec.decode(page.nextCursor)
        assertThat(cursor).containsOnlyKeys("createdAt", "typeSort", "id")
        assertThat(cursor?.get("typeSort")).isEqualTo("30")
    }

    @Test
    fun `decodes stable typed cursor before loading every history source`() {
        val cursor =
            mapOf(
                "createdAt" to "2026-07-23T10:00Z",
                "typeSort" to "40",
                "id" to "00000000-0000-0000-0000-000000000014",
            )

        service.history(host(), SESSION_ID, PageRequest(limit = 10, cursor = cursor))

        assertThat(historyPort.cursors)
            .containsOnly(
                HostSessionHistoryCursor(
                    OffsetDateTime.parse("2026-07-23T10:00Z"),
                    40,
                    UUID.fromString("00000000-0000-0000-0000-000000000014"),
                ),
            )
    }

    @Test
    fun `rejects malformed or untyped history cursor without querying sources`() {
        assertThatThrownBy {
            service.history(
                host(),
                SESSION_ID,
                PageRequest(limit = 10, cursor = mapOf("createdAt" to "not-a-time", "id" to "bad")),
            )
        }.isInstanceOf(InvalidHostSessionCursorException::class.java)

        assertThat(historyPort.cursors).isEmpty()
    }

    private fun item(
        id: String,
        type: HostSessionHistoryType,
        createdAt: OffsetDateTime,
    ) = HostSessionHistoryItem(
        id = UUID.fromString(id),
        type = type,
        createdAt = createdAt,
        actorMembershipId = HOST_MEMBERSHIP_ID,
    )

    private fun host() =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = HOST_MEMBERSHIP_ID,
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubSlug = "history-test",
            email = "history-host@example.test",
            displayName = "History Host",
            accountName = "History Host",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private class FakeHostSessionHistoryPort : HostSessionHistoryPort {
        var audit = emptyList<HostSessionHistoryItem>()
        var revisions = emptyList<HostSessionHistoryItem>()
        var notifications = emptyList<HostSessionHistoryItem>()
        val cursors = mutableListOf<HostSessionHistoryCursor?>()

        override fun loadAuditHistory(
            host: CurrentMember,
            sessionId: UUID,
            cursor: HostSessionHistoryCursor?,
            limit: Int,
        ) = audit.also { cursors += cursor }

        override fun loadRevisionHistory(
            host: CurrentMember,
            sessionId: UUID,
            cursor: HostSessionHistoryCursor?,
            limit: Int,
        ) = revisions.also { cursors += cursor }

        override fun loadNotificationHistory(
            host: CurrentMember,
            sessionId: UUID,
            cursor: HostSessionHistoryCursor?,
            limit: Int,
        ) = notifications.also { cursors += cursor }
    }

    private companion object {
        val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val HOST_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
    }
}
