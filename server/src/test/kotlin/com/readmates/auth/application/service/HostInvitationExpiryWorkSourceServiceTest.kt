package com.readmates.auth.application.service

import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceQuery
import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceQueryPort
import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceQueryResult
import com.readmates.auth.application.port.out.HostInvitationExpiryWorkSourceRow
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostInvitationExpiryWorkSourceServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val now = OffsetDateTime.parse("2026-08-30T09:00:00Z")

    @Test
    fun `only active remaining links inside seven days are now and changed revisions are completed`() {
        val expiring =
            row("00000000-0000-0000-0000-000000004001", 3, "ACTIVE", 1, 5, now.plusDays(7))
        val tooFar = row("00000000-0000-0000-0000-000000004002", 1, "ACTIVE", 0, 5, now.plusDays(8))
        val stopped =
            row(
                "00000000-0000-0000-0000-000000004003",
                7,
                "ACTIVE",
                0,
                5,
                now.plusDays(3),
                now.minusHours(1),
                "UPDATED",
            )
        val changedFar =
            row(
                "00000000-0000-0000-0000-000000004004",
                2,
                "ACTIVE",
                0,
                5,
                now.plusDays(8),
                now.minusHours(1),
                "UPDATED",
            )
        val service =
            HostInvitationExpiryWorkSourceService(
                FakePort(
                    HostInvitationExpiryWorkSourceQueryResult.Available(
                        listOf(expiring, tooFar, stopped, changedFar),
                    ),
                ),
            )

        val result = service.get(clubId, now, now.minusDays(30))

        assertThat(result.items.map { it.linkId }).containsExactly(expiring.linkId, stopped.linkId)
        assertThat(result.items[0].linkRevision).isEqualTo(3)
        assertThat(result.items[0].remainingUses).isEqualTo(4)
        assertThat(result.items[1].resolvedAt).isEqualTo(now.minusHours(1))
        assertThat(result.items[1].linkRevision).isEqualTo(7)
        assertThat(result.items[1].receiptAction).isEqualTo("UPDATED")
    }

    @Test
    fun `typed invitation source unavailability uses exact code`() {
        val port = FakePort(HostInvitationExpiryWorkSourceQueryResult.Unavailable)
        val service = HostInvitationExpiryWorkSourceService(port)
        assertThat(service.get(clubId, now, now.minusDays(30)).failureCode)
            .isEqualTo("INVITATION_SOURCE_UNAVAILABLE")
        assertThat(port.query!!.evaluatedAt).isEqualTo(now)
    }

    private fun row(
        id: String,
        revision: Long,
        status: String,
        used: Int,
        max: Int,
        expiresAt: OffsetDateTime,
        auditAt: OffsetDateTime? = null,
        action: String? = null,
    ) = HostInvitationExpiryWorkSourceRow(
        UUID.fromString(id),
        revision,
        status,
        used,
        max,
        expiresAt,
        auditAt,
        action,
    )

    private class FakePort(
        private val result: HostInvitationExpiryWorkSourceQueryResult,
    ) : HostInvitationExpiryWorkSourceQueryPort {
        var query: HostInvitationExpiryWorkSourceQuery? = null

        override fun load(query: HostInvitationExpiryWorkSourceQuery): HostInvitationExpiryWorkSourceQueryResult {
            this.query = query
            return result
        }
    }
}
