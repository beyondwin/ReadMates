package com.readmates.publication.application.service

import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.publication.application.model.PublicClubProjectionGeneration
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicClubStatsResult
import com.readmates.publication.application.model.PublicProjectionGeneration
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
    fun `old generation cache entry cannot reappear after the authoritative marker advances`() {
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val cache = PublicReadCachePort.InMemoryForTest()
        cache.putSession(
            clubId = clubId,
            clubGeneration = 7,
            generation = 3,
            sessionId = sessionId,
            result = publicSession(sessionId, summary = "Cached before revoke"),
        )
        val loader =
            RecordingPublicLoader(
                session = publicSession(sessionId, summary = "Authoritative generation four"),
                sessionMarker = sessionMarker(sessionId, generation = 4, clubGeneration = 8),
            )
        val service = PublicQueryService(loader, cache, StaticClubContextResolver(clubId))

        val result = service.getSession("sample-book-club", sessionId)

        assertEquals("Authoritative generation four", result?.summary)
        assertEquals(1, loader.sessionLoads)
        assertEquals(
            "Authoritative generation four",
            cache.getSession(clubId, 8, 4, sessionId)?.summary,
        )
    }

    @Test
    fun `cache miss returns refetched source content and stores that content`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val loader = RecordingPublicLoader(session = publicSession(sessionId, summary = "Refetched source summary"))
        val service = PublicQueryService(loader, cache, StaticClubContextResolver(clubId))

        val firstResult = service.getSession("sample-book-club", sessionId)
        val secondResult = service.getSession("sample-book-club", sessionId)

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
    fun `origin unreadable marker denies without consulting an old cached allow`() {
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val cache = PublicReadCachePort.InMemoryForTest()
        cache.putSession(clubId, 4, 9, sessionId, publicSession(sessionId, "Revoked body"))
        val loader =
            RecordingPublicLoader(
                session = publicSession(sessionId, "Origin must not load"),
                sessionMarker = sessionMarker(sessionId, generation = 10, clubGeneration = 5, originReadable = false),
            )
        val service = PublicQueryService(loader, cache, StaticClubContextResolver(clubId))

        assertNull(service.getSession("sample-book-club", sessionId))
        assertEquals(0, loader.sessionLoads)
    }

    @Test
    fun `marker failure fails closed without consulting database body or cached allow`() {
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val cache = PublicReadCachePort.InMemoryForTest()
        cache.putSession(clubId, 1, 1, sessionId, publicSession(sessionId, "Untrusted cache body"))
        val loader =
            RecordingPublicLoader(
                session = publicSession(sessionId, "Database fallback body"),
                markerFailure = true,
            )
        val service = PublicQueryService(loader, cache, StaticClubContextResolver(clubId))

        assertNull(service.getSession("sample-book-club", sessionId))
        assertEquals(0, loader.sessionLoads)
    }

    @Test
    fun `club marker failure fails closed without consulting database body or cached allow`() {
        val cache = PublicReadCachePort.InMemoryForTest()
        cache.putClub(clubId, 1, publicClub())
        val loader = RecordingPublicLoader(markerFailure = true)
        val service = PublicQueryService(loader, cache, StaticClubContextResolver(clubId))

        assertNull(service.getClub("sample-book-club"))
        assertEquals(0, loader.clubLoads)
    }

    @Test
    fun `missing marker falls back to authoritative database and does not populate generation cache`() {
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val cache = PublicReadCachePort.InMemoryForTest()
        val loader =
            RecordingPublicLoader(
                session = publicSession(sessionId, "Unversioned database fallback"),
                sessionMarker = null,
            )
        val service = PublicQueryService(loader, cache, StaticClubContextResolver(clubId))

        assertEquals("Unversioned database fallback", service.getSession("sample-book-club", sessionId)?.summary)
        assertNull(cache.getSession(clubId, 1, 1, sessionId))
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
        private val clubMarker: PublicClubProjectionGeneration? =
            PublicClubProjectionGeneration(
                clubId = UUID.fromString("00000000-0000-0000-0000-000000000099"),
                generation = 1,
                originReadable = true,
            ),
        private val sessionMarker: PublicProjectionGeneration? =
            sessionMarker(UUID.fromString("00000000-0000-0000-0000-000000000301")),
        private val markerFailure: Boolean = false,
    ) : LoadPublishedPublicDataPort {
        var clubLoads = 0
        var sessionLoads = 0

        override fun loadClubProjectionGeneration(clubSlug: String): PublicClubProjectionGeneration? {
            if (markerFailure) error("marker database unavailable")
            return clubMarker
        }

        override fun loadSessionProjectionGeneration(
            clubSlug: String,
            sessionId: UUID,
        ): PublicProjectionGeneration? {
            if (markerFailure) error("marker database unavailable")
            return sessionMarker
        }

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
        fun sessionMarker(
            sessionId: UUID,
            generation: Long = 1,
            clubGeneration: Long = 1,
            originReadable: Boolean = true,
        ) = PublicProjectionGeneration(
            publicationId = UUID.fromString("00000000-0000-0000-0000-000000000401"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000099"),
            sessionId = sessionId,
            generation = generation,
            clubGeneration = clubGeneration,
            liveRecordRevision = 0,
            originReadable = originReadable,
        )

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
