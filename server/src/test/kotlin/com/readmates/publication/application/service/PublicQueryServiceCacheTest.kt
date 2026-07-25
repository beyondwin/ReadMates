package com.readmates.publication.application.service

import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
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
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000099")

    @Test
    fun `returns stale cached public content while the cache entry still exists`() {
        val cache =
            PublicReadCachePort.InMemoryForTest(
                club = publicClub(clubName = "Cached club before mutation"),
            )
        val loader =
            RecordingPublicLoader(
                club = publicClub(clubName = "Refetched club from source"),
            )
        val service = PublicQueryService(loader, cache)

        val result = service.getClub()

        assertEquals("Cached club before mutation", result?.clubName)
        assertEquals(0, loader.clubLoads)
    }

    @Test
    fun `cache miss returns refetched source content and stores that content`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val loader =
            RecordingPublicLoader(
                session = publicSession(sessionId, summary = "Refetched source summary"),
            )
        val service = PublicQueryService(loader, cache)

        val firstResult = service.getSession(sessionId)
        val secondResult = service.getSession(sessionId)

        assertEquals("Refetched source summary", firstResult?.summary)
        assertEquals("Refetched source summary", secondResult?.summary)
        assertEquals(1, loader.sessionLoads)
    }

    @Test
    fun `uses resolved club id for public cache keys`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val loader = RecordingPublicLoader()
        val resolver = StaticClubContextResolver(clubId)
        val service = PublicQueryService(loader, cache, resolver)
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

        service.getClub("sample-book-club")
        service.getClub("sample-book-club")
        service.getSession("sample-book-club", sessionId)
        service.getSession("sample-book-club", sessionId)

        assertEquals(1, loader.clubLoads)
        assertEquals(1, loader.sessionLoads)
        assertEquals(1, resolver.slugLoads)
    }

    @Test
    fun `does not fall back to slug cache after resolved club cache miss when public data is missing`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val loader = RecordingPublicLoader(club = null, session = null)
        val service = PublicQueryService(loader, cache, StaticClubContextResolver(clubId))
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000404")

        assertNull(service.getClub("sample-book-club"))
        assertNull(service.getSession("sample-book-club", sessionId))

        assertEquals(1, loader.clubLoads)
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
        private val session: PublicSessionDetailResult? =
            publicSession(
                UUID.fromString("00000000-0000-0000-0000-000000000301"),
            ),
    ) : LoadPublishedPublicDataPort {
        var clubLoads = 0
        var sessionLoads = 0

        override fun loadClub(): PublicClubResult? {
            clubLoads += 1
            return club
        }

        override fun loadClub(clubSlug: String): PublicClubResult? {
            clubLoads += 1
            return club
        }

        override fun loadSession(sessionId: UUID): PublicSessionDetailResult? {
            sessionLoads += 1
            return session ?: return null
        }

        override fun loadSession(
            clubSlug: String,
            sessionId: UUID,
        ): PublicSessionDetailResult? {
            sessionLoads += 1
            return session ?: return null
        }
    }

    private class StaticClubContextResolver(
        private val clubId: UUID,
    ) : ResolveClubContextUseCase {
        var slugLoads = 0

        override fun resolveBySlug(slug: String): ResolvedClubContext? {
            slugLoads += 1
            return ResolvedClubContext(
                clubId = clubId,
                slug = slug,
                name = "ReadMates",
                status = "ACTIVE",
                hostname = null,
            )
        }

        override fun resolveByHost(host: String?): ResolvedClubContext? = null
    }

    companion object {
        fun publicClub(clubName: String = "ReadMates") =
            PublicClubResult(
                clubName = clubName,
                tagline = "Read together",
                about = "About",
                stats = PublicClubStatsResult(sessions = 1, books = 1, members = 3),
                recentSessions = emptyList(),
            )

        fun publicSession(
            sessionId: UUID,
            summary: String = "Summary",
        ) = PublicSessionDetailResult(
            sessionId = sessionId.toString(),
            sessionNumber = 1,
            bookTitle = "Book",
            bookAuthor = "Author",
            bookImageUrl = null,
            date = "2026-04-28",
            summary = summary,
            highlights = emptyList(),
            oneLiners = emptyList(),
        )
    }
}
