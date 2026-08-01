package com.readmates.browse.application.service

import com.readmates.browse.application.GuestBrowseInvalidCursorException
import com.readmates.browse.application.model.GuestBrowseNavigationResult
import com.readmates.browse.application.model.GuestBrowseShellResult
import com.readmates.browse.application.model.GuestCurrentSessionResult
import com.readmates.browse.application.model.GuestUpcomingSessionCursor
import com.readmates.browse.application.model.GuestUpcomingSessionResult
import com.readmates.browse.application.port.out.LoadGuestSessionBrowsePort
import com.readmates.shared.paging.CursorCodec
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class GuestBrowseQueryServiceTest {
    @Test
    fun `upcoming defaults to twenty items and emits a club scoped cursor`() {
        val port = FakeGuestSessionBrowsePort(upcoming = upcomingRows(21))
        val service = GuestBrowseQueryService(port)

        val page = requireNotNull(service.listUpcomingSessions("guest-test", requestedLimit = null, rawCursor = null))

        assertThat(page.items).hasSize(20)
        assertThat(page.items.first().sessionNumber).isEqualTo(1)
        assertThat(page.items.last().sessionNumber).isEqualTo(20)
        assertThat(CursorCodec.decodeStrict(page.nextCursor))
            .containsExactlyInAnyOrderEntriesOf(
                mapOf(
                    "clubSlug" to "guest-test",
                    "date" to "2026-08-20",
                    "startTime" to "19:30:00",
                    "sessionId" to sessionId(20),
                ),
            )
    }

    @Test
    fun `upcoming caps the requested limit at fifty`() {
        val port = FakeGuestSessionBrowsePort(upcoming = upcomingRows(51))
        val service = GuestBrowseQueryService(port)

        val page = requireNotNull(service.listUpcomingSessions("guest-test", requestedLimit = 500, rawCursor = null))

        assertThat(page.items).hasSize(50)
        assertThat(page.nextCursor).isNotNull()
    }

    @Test
    fun `upcoming rejects malformed and cross club cursors`() {
        val service = GuestBrowseQueryService(FakeGuestSessionBrowsePort())
        val crossClubCursor =
            CursorCodec.encode(
                mapOf(
                    "clubSlug" to "other-club",
                    "date" to "2026-08-20",
                    "startTime" to "19:30:00",
                    "sessionId" to sessionId(20),
                ),
            )

        assertThatThrownBy {
            service.listUpcomingSessions("guest-test", requestedLimit = null, rawCursor = "not-a-cursor")
        }.isInstanceOf(GuestBrowseInvalidCursorException::class.java)
        assertThatThrownBy {
            service.listUpcomingSessions("guest-test", requestedLimit = null, rawCursor = crossClubCursor)
        }.isInstanceOf(GuestBrowseInvalidCursorException::class.java)
    }

    @Test
    fun `hidden club short circuits current and upcoming reads`() {
        val port = FakeGuestSessionBrowsePort(shell = null)
        val service = GuestBrowseQueryService(port)

        assertThat(service.getCurrentSession("hidden-club")).isNull()
        assertThat(service.listUpcomingSessions("hidden-club", null, null)).isNull()
    }

    private class FakeGuestSessionBrowsePort(
        private val shell: GuestBrowseShellResult? = sampleShell(),
        private val current: GuestCurrentSessionResult? = null,
        private val upcoming: List<GuestUpcomingSessionResult> = emptyList(),
    ) : LoadGuestSessionBrowsePort {
        override fun loadShell(clubSlug: String): GuestBrowseShellResult? = shell

        override fun loadCurrentSession(clubSlug: String): GuestCurrentSessionResult? = current

        override fun loadUpcomingSessions(
            clubSlug: String,
            cursor: GuestUpcomingSessionCursor?,
            limit: Int,
        ): List<GuestUpcomingSessionResult> = upcoming.take(limit)
    }

    private companion object {
        fun sampleShell() =
            GuestBrowseShellResult(
                clubName = "게스트 테스트 클럽",
                tagline = "함께 읽는 테스트",
                navigation = GuestBrowseNavigationResult(),
            )

        fun upcomingRows(count: Int): List<GuestUpcomingSessionResult> =
            (1..count).map { number ->
                GuestUpcomingSessionResult(
                    sessionId = sessionId(number),
                    sessionNumber = number,
                    title = "$number 회차",
                    bookTitle = "$number 번째 책",
                    bookAuthor = "테스트 저자",
                    bookLink = null,
                    bookImageUrl = null,
                    date = "2026-08-20",
                    startTime = "19:30:00",
                    endTime = "21:30:00",
                    questionDeadlineAt = "2026-08-19T18:00:00",
                    state = "DRAFT",
                )
            }

        fun sessionId(number: Int): String = "00000000-0000-0000-0000-${number.toString().padStart(12, '0')}"
    }
}
