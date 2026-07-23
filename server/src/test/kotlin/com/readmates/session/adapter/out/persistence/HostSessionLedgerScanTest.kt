package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionrecord.application.model.SessionRecordStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class HostSessionLedgerScanTest {
    @Test
    fun `ledger summary uses shared readiness semantics for global counts`() {
        val summary =
            summarizeHostSessionLedger(
                listOf(
                    HostSessionLedgerReadiness(
                        "PUBLISHED",
                        summaryPublished = false,
                        highlightCount = 0,
                        oneLinerCount = 0,
                        feedbackReady = false,
                        hasDraft = false,
                    ),
                    HostSessionLedgerReadiness("CLOSED", true, 0, 0, feedbackReady = true, hasDraft = true),
                    HostSessionLedgerReadiness("OPEN", false, 0, 0, feedbackReady = false, hasDraft = true),
                    HostSessionLedgerReadiness("PUBLISHED", false, 1, 0, feedbackReady = true, hasDraft = false),
                ),
            )

        assertThat(summary.needsAttentionCount).isEqualTo(2)
        assertThat(summary.incompletePublishedCount).isEqualTo(1)
        assertThat(summary.draftCount).isEqualTo(2)
    }

    @Test
    fun `large sparse ledger scan is capped by SQL chunk query budget`() {
        val fixture = (5_000 downTo 1).map(::ledgerItem)
        var queryCount = 0

        val result =
            scanHostSessionLedger(
                limit = 50,
                initialCursor = null,
                matches = { it.needsAttention },
            ) { cursor, chunkSize ->
                queryCount += 1
                val start = cursor?.let { fixture.indexOfFirst { row -> row.sessionId == it.id.toString() } + 1 } ?: 0
                fixture.drop(start).take(chunkSize)
            }

        assertThat(result.items).isEmpty()
        assertThat(result.continuation).isNotNull()
        assertThat(queryCount).isEqualTo(HOST_SESSION_LEDGER_MAX_SCAN_CHUNKS)
    }

    private fun ledgerItem(number: Int) =
        HostSessionListItem(
            sessionId = "00000000-0000-0000-0000-${number.toString().padStart(12, '0')}",
            sessionNumber = number,
            title = "Session $number",
            bookTitle = "Book",
            bookAuthor = "Author",
            bookImageUrl = null,
            date = "2026-07-23",
            startTime = "19:00",
            endTime = "21:00",
            locationLabel = "Online",
            state = "OPEN",
            visibility = SessionRecordVisibility.HOST_ONLY,
            recordStatus = SessionRecordStatus.NOT_STARTED,
            needsAttention = false,
        )
}
