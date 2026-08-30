package com.readmates.session.application.service

import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceQuery
import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceQueryPort
import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceQueryResult
import com.readmates.session.application.port.out.HostScheduleSeenWorkSourceRow
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostScheduleSeenWorkSourceServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val evaluatedAt = OffsetDateTime.parse("2026-08-30T09:00:00Z")

    @Test
    fun `exact schedule revision yields actionable and recently completed privacy safe rows`() {
        val actionable = row("00000000-0000-0000-0000-000000001001", eligible = 3, seen = 1)
        val completed =
            row(
                "00000000-0000-0000-0000-000000001002",
                eligible = 2,
                seen = 2,
                resolvedAt = evaluatedAt.minusDays(1),
            )
        val zeroEligible = row("00000000-0000-0000-0000-000000001003", eligible = 0, seen = 0)
        val service =
            HostScheduleSeenWorkSourceService(
                FakePort(
                    HostScheduleSeenWorkSourceQueryResult.Available(
                        listOf(actionable, completed, zeroEligible),
                    ),
                ),
            )

        val result = service.get(clubId, evaluatedAt, evaluatedAt.minusDays(30))

        assertThat(result.failureCode).isNull()
        assertThat(result.items.map { it.sessionId })
            .containsExactly(actionable.sessionId, completed.sessionId)
        assertThat(result.items[0].scheduleRevision).isEqualTo(7)
        assertThat(result.items[0].unseenCount).isEqualTo(2)
        assertThat(result.items[0].resolvedAt).isNull()
        assertThat(result.items[1].unseenCount).isZero()
        assertThat(result.items[1].resolvedAt).isEqualTo(evaluatedAt.minusDays(1))
    }

    @Test
    fun `typed schedule source unavailability is data while unexpected failures propagate`() {
        val unavailable =
            HostScheduleSeenWorkSourceService(
                FakePort(HostScheduleSeenWorkSourceQueryResult.Unavailable),
            )
        assertThat(unavailable.get(clubId, evaluatedAt, evaluatedAt.minusDays(30)).failureCode)
            .isEqualTo("SCHEDULE_SOURCE_UNAVAILABLE")

        val failure = IllegalStateException("transaction failed")
        val throwing = HostScheduleSeenWorkSourceService { throw failure }
        org.assertj.core.api.Assertions
            .assertThatThrownBy {
                throwing.get(clubId, evaluatedAt, evaluatedAt.minusDays(30))
            }.isSameAs(failure)
    }

    private fun row(
        id: String,
        eligible: Int,
        seen: Int,
        resolvedAt: OffsetDateTime? = null,
    ) = HostScheduleSeenWorkSourceRow(
        sessionId = UUID.fromString(id),
        scheduleRevision = 7,
        eligibleCount = eligible,
        exactRevisionSeenCount = seen,
        exactRevisionResolvedAt = resolvedAt,
        dueAt = evaluatedAt.plusDays(1),
        dispatchId = null,
        dispatchStatus = null,
        dispatchTargetCount = null,
        dispatchDeliveryCount = null,
    )

    private class FakePort(
        private val result: HostScheduleSeenWorkSourceQueryResult,
    ) : HostScheduleSeenWorkSourceQueryPort {
        override fun load(query: HostScheduleSeenWorkSourceQuery) = result
    }
}
