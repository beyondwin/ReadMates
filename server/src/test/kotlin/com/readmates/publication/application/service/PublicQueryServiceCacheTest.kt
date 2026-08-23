package com.readmates.publication.application.service

import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicClubStatsResult
import com.readmates.publication.application.model.PublicProjectionGeneration
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.port.out.LoadPublishedPublicDataPort
import com.readmates.publication.application.port.out.PublicReadCachePort
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.util.UUID

class PublicQueryServiceCacheTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000099")

    @Test
    fun `authoritative origin replaces a stale cached public club body`() {
        val cache =
            PublicReadCachePort.InMemoryForTest(
                club = publicClub(clubName = "Cached club before mutation"),
            )
        val loader =
            RecordingPublicLoader(
                club = publicClub(clubName = "Refetched club from source"),
                clubGeneration = 2,
            )
        val service = PublicQueryService(loader, cache)

        val result = service.getClub()

        assertEquals("Refetched club from source", result?.clubName)
        assertEquals(1, loader.clubLoads)
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
    fun `authoritative revoke denies a stale cached public session body`() {
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val cache = PublicReadCachePort.InMemoryForTest()
        cache.putSession(sessionId, publicSession(sessionId, summary = "Revoked cached summary"))
        val loader = RecordingPublicLoader(session = null)
        val service = PublicQueryService(loader, cache)

        assertNull(service.getSession(sessionId))
        assertEquals(0, loader.sessionLoads)
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
    fun `old generation cache entry cannot satisfy a newer authoritative marker`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        cache.putSession(clubId, sessionId, 1, publicSession(sessionId, "generation one"))
        val loader =
            RecordingPublicLoader(
                session = publicSession(sessionId, "generation two"),
                sessionGeneration = 2,
            )
        val service = PublicQueryService(loader, cache, StaticClubContextResolver(clubId))

        assertEquals("generation two", service.getSession("sample-book-club", sessionId)?.summary)
        assertEquals(1, loader.sessionLoads)
    }

    @Test
    fun `marker miss falls back to authoritative DB instead of a cached allow`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        cache.putSession(clubId, sessionId, 1, publicSession(sessionId, "cached stale body"))
        val loader =
            RecordingPublicLoader(
                session = publicSession(sessionId, "authoritative body"),
                markerMissing = true,
            )
        val service = PublicQueryService(loader, cache, StaticClubContextResolver(clubId))

        assertEquals("authoritative body", service.getSession("sample-book-club", sessionId)?.summary)
        assertEquals(1, loader.sessionLoads)
    }

    @Test
    fun `marker and authoritative DB failure never fall back to a cached allow`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        cache.putSession(clubId, sessionId, 1, publicSession(sessionId, "cached stale body"))
        val loader = RecordingPublicLoader(markerFailure = true, sessionLoadFailure = true)
        val service = PublicQueryService(loader, cache, StaticClubContextResolver(clubId))

        assertThrows(IllegalStateException::class.java) {
            service.getSession("sample-book-club", sessionId)
        }
        assertEquals(1, loader.sessionLoads)
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
        assertEquals(0, loader.sessionLoads)
    }

    @Test
    fun `authoritative missing public session is denied before loading a body`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val loader = RecordingPublicLoader(session = null)
        val service = PublicQueryService(loader, cache)
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000404")

        assertNull(service.getSession(sessionId))
        assertNull(service.getSession(sessionId))

        assertEquals(0, loader.sessionLoads)
    }

    private class RecordingPublicLoader(
        private val club: PublicClubResult? = publicClub(),
        private val session: PublicSessionDetailResult? =
            publicSession(
                UUID.fromString("00000000-0000-0000-0000-000000000301"),
            ),
        private val sessionGeneration: Long = 1,
        private val clubGeneration: Long = 1,
        private val markerMissing: Boolean = false,
        private val markerFailure: Boolean = false,
        private val sessionLoadFailure: Boolean = false,
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

        override fun loadClubGeneration(clubSlug: String): Long? = clubGeneration

        override fun loadSession(sessionId: UUID): PublicSessionDetailResult? {
            sessionLoads += 1
            return session ?: return null
        }

        override fun loadSession(
            clubSlug: String,
            sessionId: UUID,
        ): PublicSessionDetailResult? {
            sessionLoads += 1
            if (sessionLoadFailure) {
                throw IllegalStateException("authoritative DB unavailable")
            }
            return session ?: return null
        }

        override fun loadSessionGeneration(
            clubSlug: String,
            sessionId: UUID,
        ): PublicProjectionGeneration? {
            if (markerFailure) {
                throw IllegalStateException("marker lookup unavailable")
            }
            if (markerMissing) {
                return null
            }
            return PublicProjectionGeneration(
                publicationId = UUID.fromString("00000000-0000-0000-0000-000000000401"),
                generation = sessionGeneration,
                liveRecordRevision = 1,
                originReadable = session != null,
            )
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
