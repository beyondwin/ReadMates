package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.sessionrecord.application.model.SessionRecordStatus
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.paging.CursorCodec
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

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

    @Test
    fun `attention rank is published draft then published incomplete then closed draft then closed incomplete`() {
        assertThat(hostSessionAttentionRank("PUBLISHED", hasDraft = true)).isEqualTo(0)
        assertThat(hostSessionAttentionRank("PUBLISHED", hasDraft = false)).isEqualTo(1)
        assertThat(hostSessionAttentionRank("CLOSED", hasDraft = true)).isEqualTo(2)
        assertThat(hostSessionAttentionRank("CLOSED", hasDraft = false)).isEqualTo(3)
    }

    @Test
    fun `attention order is rank then oldest date then id regardless of session number`() {
        val closedIncompleteEarly =
            ledgerItem(12, state = "CLOSED", hasDraft = false, date = "2026-06-01")
        val closedDraftSameDate =
            ledgerItem(11, state = "CLOSED", hasDraft = true, date = "2026-06-01")
        val publishedIncompleteLaterId =
            ledgerItem(10, state = "PUBLISHED", hasDraft = false, date = "2026-07-01")
        val publishedIncompleteEarlierId =
            ledgerItem(9, state = "PUBLISHED", hasDraft = false, date = "2026-07-01")
        val publishedDraftLaterDate =
            ledgerItem(8, state = "PUBLISHED", hasDraft = true, date = "2026-08-01")
        val publishedDraftEarlierDate =
            ledgerItem(7, state = "PUBLISHED", hasDraft = true, date = "2026-05-01")

        val ordered =
            listOf(
                closedIncompleteEarly,
                closedDraftSameDate,
                publishedIncompleteLaterId,
                publishedIncompleteEarlierId,
                publishedDraftLaterDate,
                publishedDraftEarlierDate,
            ).sortedWith(hostSessionAttentionComparator())

        assertThat(ordered.map { it.sessionNumber }).containsExactly(7, 8, 9, 10, 11, 12)
    }

    @Test
    fun `attention cursor encodes rank date id query and club and rejects number cursors`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000010")
        val encoded =
            hostSessionAttentionCursor(
                rank = 0,
                date = LocalDate.parse("2026-05-01"),
                id = sessionId,
                queryKey = "attention-query",
                clubId = clubId,
            )

        val decoded =
            HostSessionAttentionCursor.from(
                CursorCodec.decode(encoded) ?: error("attention cursor did not decode"),
                expectedQuery = "attention-query",
                expectedClubId = clubId,
            )

        assertThat(decoded).isEqualTo(
            HostSessionAttentionCursor(
                rank = 0,
                date = LocalDate.parse("2026-05-01"),
                id = sessionId,
            ),
        )

        assertThatThrownBy {
            HostSessionAttentionCursor.from(
                mapOf(
                    "number" to "12",
                    "id" to sessionId.toString(),
                    "query" to "attention-query",
                    "clubId" to clubId.toString(),
                ),
                expectedQuery = "attention-query",
                expectedClubId = clubId,
            )
        }.isInstanceOf(InvalidHostSessionCursorException::class.java)
    }

    private fun ledgerItem(number: Int) =
        ledgerItem(number, state = "OPEN", hasDraft = false, date = "2026-07-23", needsAttention = false)

    private fun ledgerItem(
        number: Int,
        state: String,
        hasDraft: Boolean,
        date: String,
        needsAttention: Boolean = true,
    ) = HostSessionListItem(
        sessionId = "00000000-0000-0000-0000-${number.toString().padStart(12, '0')}",
        sessionNumber = number,
        title = "Session $number",
        bookTitle = "Book",
        bookAuthor = "Author",
        bookImageUrl = null,
        date = date,
        startTime = "19:00",
        endTime = "21:00",
        locationLabel = "Online",
        state = state,
        visibility = SessionRecordVisibility.HOST_ONLY,
        recordStatus = if (hasDraft) SessionRecordStatus.INCOMPLETE else SessionRecordStatus.NOT_STARTED,
        needsAttention = needsAttention,
        hasDraft = hasDraft,
    )
}
