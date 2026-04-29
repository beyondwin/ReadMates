package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_SLUG
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import java.util.UUID

interface PublicReadCachePort {
    fun getClub(): PublicClubResult?

    fun getClub(clubSlug: String): PublicClubResult? =
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) getClub() else null

    fun putClub(result: PublicClubResult)

    fun putClub(clubSlug: String, result: PublicClubResult) {
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) {
            putClub(result)
        }
    }

    fun getSession(sessionId: UUID): PublicSessionDetailResult?

    fun getSession(clubSlug: String, sessionId: UUID): PublicSessionDetailResult? =
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) getSession(sessionId) else null

    fun putSession(sessionId: UUID, result: PublicSessionDetailResult)

    fun putSession(clubSlug: String, sessionId: UUID, result: PublicSessionDetailResult) {
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) {
            putSession(sessionId, result)
        }
    }

    class Noop : PublicReadCachePort {
        override fun getClub(): PublicClubResult? = null

        override fun putClub(result: PublicClubResult) = Unit

        override fun getSession(sessionId: UUID): PublicSessionDetailResult? = null

        override fun putSession(sessionId: UUID, result: PublicSessionDetailResult) = Unit
    }

    class InMemoryForTest(
        private var club: PublicClubResult? = null,
    ) : PublicReadCachePort {
        private val sessions = mutableMapOf<UUID, PublicSessionDetailResult>()

        override fun getClub(): PublicClubResult? = club

        override fun putClub(result: PublicClubResult) {
            club = result
        }

        override fun getSession(sessionId: UUID): PublicSessionDetailResult? =
            sessions[sessionId]

        override fun putSession(sessionId: UUID, result: PublicSessionDetailResult) {
            sessions[sessionId] = result
        }
    }
}
