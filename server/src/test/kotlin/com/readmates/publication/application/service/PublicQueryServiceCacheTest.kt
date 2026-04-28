package com.readmates.publication.application.service

import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicClubStatsResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.port.out.LoadPublishedPublicDataPort
import com.readmates.publication.application.port.out.PublicReadCachePort
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.util.UUID

class PublicQueryServiceCacheTest {
    @Test
    fun `returns cached public club without loading port`() {
        val cache = PublicReadCachePort.InMemoryForTest(club = publicClub())
        val loader = RecordingPublicLoader()
        val service = PublicQueryService(loader, cache)

        val result = service.getClub()

        assertEquals("ReadMates", result?.clubName)
        assertEquals(0, loader.clubLoads)
    }

    @Test
    fun `loads and stores public session on cache miss`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val loader = RecordingPublicLoader()
        val service = PublicQueryService(loader, cache)
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

        service.getSession(sessionId)
        service.getSession(sessionId)

        assertEquals(1, loader.sessionLoads)
    }

    @Test
    fun `does not cache missing public session`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val loader = RecordingPublicLoader(session = null)
        val service = PublicQueryService(loader, cache)
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000404")

        assertNull(service.getSession(sessionId))
        assertNull(service.getSession(sessionId))

        assertEquals(2, loader.sessionLoads)
    }

    private class RecordingPublicLoader(
        private val club: PublicClubResult? = publicClub(),
        private val session: PublicSessionDetailResult? = publicSession(
            UUID.fromString("00000000-0000-0000-0000-000000000301"),
        ),
    ) : LoadPublishedPublicDataPort {
        var clubLoads = 0
        var sessionLoads = 0

        override fun loadClub(): PublicClubResult? {
            clubLoads += 1
            return club
        }

        override fun loadSession(sessionId: UUID): PublicSessionDetailResult? {
            sessionLoads += 1
            return session ?: return null
        }
    }

    companion object {
        fun publicClub() = PublicClubResult(
            clubName = "ReadMates",
            tagline = "Read together",
            about = "About",
            stats = PublicClubStatsResult(sessions = 1, books = 1, members = 3),
            recentSessions = emptyList(),
        )

        fun publicSession(sessionId: UUID) = PublicSessionDetailResult(
            sessionId = sessionId.toString(),
            sessionNumber = 1,
            bookTitle = "Book",
            bookAuthor = "Author",
            bookImageUrl = null,
            date = "2026-04-28",
            summary = "Summary",
            highlights = emptyList(),
            oneLiners = emptyList(),
        )
    }
}
