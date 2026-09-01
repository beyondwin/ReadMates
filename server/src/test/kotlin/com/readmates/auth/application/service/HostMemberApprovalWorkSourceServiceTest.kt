package com.readmates.auth.application.service

import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceQuery
import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceQueryPort
import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceQueryResult
import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceRow
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostMemberApprovalWorkSourceServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val now = OffsetDateTime.parse("2026-08-30T09:00:00Z")

    @Test
    fun `pending viewer identity uses request time and resolved approval exposes only safe receipt`() {
        val pending = row("00000000-0000-0000-0000-000000002001", "VIEWER", null, null)
        val resolved =
            row("00000000-0000-0000-0000-000000002002", "ACTIVE", now.minusHours(2), "APPROVED")
        val service =
            HostMemberApprovalWorkSourceService(
                FakePort(
                    HostMemberApprovalWorkSourceQueryResult.Available(listOf(pending, resolved)),
                ),
            )

        val result = service.get(clubId, now, now.minusDays(30))

        assertThat(result.items.map { it.membershipId })
            .containsExactly(pending.membershipId, resolved.membershipId)
        assertThat(result.items[0].requestCreatedAt).isEqualTo(now.minusDays(2))
        assertThat(result.items[0].resolvedAt).isNull()
        assertThat(result.items[1].resolvedAt).isEqualTo(now.minusHours(2))
        assertThat(result.items[1].receiptAction).isEqualTo("APPROVED")
        assertThat(result.items[1].receiptStatus).isEqualTo("ACTIVE")
    }

    @Test
    fun `typed member source unavailability uses exact code`() {
        val service =
            HostMemberApprovalWorkSourceService(
                FakePort(HostMemberApprovalWorkSourceQueryResult.Unavailable),
            )
        assertThat(service.get(clubId, now, now.minusDays(30)).failureCode)
            .isEqualTo("MEMBER_SOURCE_UNAVAILABLE")
    }

    private fun row(
        id: String,
        status: String,
        transitionedAt: OffsetDateTime?,
        action: String?,
    ) = HostMemberApprovalWorkSourceRow(
        membershipId = UUID.fromString(id),
        requestCreatedAt = now.minusDays(2),
        membershipStatus = status,
        transitionedAt = transitionedAt,
        receiptAction = action,
    )

    private class FakePort(
        private val result: HostMemberApprovalWorkSourceQueryResult,
    ) : HostMemberApprovalWorkSourceQueryPort {
        override fun load(query: HostMemberApprovalWorkSourceQuery) = result
    }
}
