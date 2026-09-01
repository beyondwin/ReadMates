package com.readmates.sessionclosing.application.service

import com.readmates.sessionclosing.application.model.ClosingOverallState
import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQuery
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQueryPort
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQueryResult
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceRow
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostRecordClosingWorkSourceServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val now = OffsetDateTime.parse("2026-08-30T09:00:00Z")

    @Test
    fun `canonical vector generation distinguishes actionable and same generation resolved rows`() {
        val actionable =
            row(
                "00000000-0000-0000-0000-000000003001",
                "a".repeat(64),
                ClosingOverallState.BLOCKED,
                ClosingPrimaryAction.IMPORT_RECORDS,
                null,
            )
        val resolved =
            row(
                "00000000-0000-0000-0000-000000003002",
                "b".repeat(64),
                ClosingOverallState.PUBLISHED,
                ClosingPrimaryAction.REVIEW_PUBLIC_PAGE,
                now.minusHours(3),
            )
        val irrelevant =
            row(
                "00000000-0000-0000-0000-000000003003",
                "c".repeat(64),
                ClosingOverallState.READY,
                ClosingPrimaryAction.NONE,
                null,
            )
        val service =
            HostRecordClosingWorkSourceService(
                FakePort(
                    HostRecordClosingWorkSourceQueryResult.Available(
                        listOf(actionable, resolved, irrelevant),
                    ),
                ),
            )

        val result = service.get(clubId, now, now.minusDays(30))

        assertThat(result.items.map { it.sessionId })
            .containsExactly(actionable.sessionId, resolved.sessionId)
        assertThat(result.items[0].sourceGeneration).isEqualTo("a".repeat(64))
        assertThat(result.items[0].actionable).isTrue()
        assertThat(result.items[1].receiptId).isEqualTo(resolved.receiptId)
        assertThat(result.items[1].receiptState).isEqualTo("PUBLISHED")
    }

    @Test
    fun `typed record source unavailability uses exact code`() {
        val service =
            HostRecordClosingWorkSourceService(
                FakePort(HostRecordClosingWorkSourceQueryResult.Unavailable),
            )
        assertThat(service.get(clubId, now, now.minusDays(30)).failureCode)
            .isEqualTo("RECORD_SOURCE_UNAVAILABLE")
    }

    private fun row(
        id: String,
        generation: String,
        overallState: ClosingOverallState,
        primaryAction: ClosingPrimaryAction,
        resolvedAt: OffsetDateTime?,
    ) = HostRecordClosingWorkSourceRow(
        sessionId = UUID.fromString(id),
        sourceGeneration = generation,
        overallState = overallState,
        primaryAction = primaryAction,
        dueAt = now.minusDays(1),
        resolvedAt = resolvedAt,
        receiptId = resolvedAt?.let { UUID.fromString("00000000-0000-0000-0000-000000003999") },
        receiptState = resolvedAt?.let { "PUBLISHED" },
        receiptSummary = resolvedAt?.let { "기록 공개 완료" },
    )

    private class FakePort(
        private val result: HostRecordClosingWorkSourceQueryResult,
    ) : HostRecordClosingWorkSourceQueryPort {
        override fun load(query: HostRecordClosingWorkSourceQuery) = result
    }
}
