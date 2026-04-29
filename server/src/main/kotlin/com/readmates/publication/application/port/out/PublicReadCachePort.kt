package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_SLUG
import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_ID
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import java.util.UUID

interface PublicReadCachePort {
    fun getClub(): PublicClubResult?

    fun getClub(clubSlug: String): PublicClubResult? =
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) getClub() else null

    fun getClub(clubId: UUID): PublicClubResult? =
        if (clubId == UUID.fromString(LEGACY_PUBLIC_CLUB_ID)) getClub() else null

    fun putClub(result: PublicClubResult)

    fun putClub(clubSlug: String, result: PublicClubResult) {
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) {
            putClub(result)
        }
    }

    fun putClub(clubId: UUID, result: PublicClubResult) {
        if (clubId == UUID.fromString(LEGACY_PUBLIC_CLUB_ID)) {
            putClub(result)
        }
    }

    fun getSession(sessionId: UUID): PublicSessionDetailResult?

    fun getSession(clubSlug: String, sessionId: UUID): PublicSessionDetailResult? =
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) getSession(sessionId) else null

    fun getSession(clubId: UUID, sessionId: UUID): PublicSessionDetailResult? =
        if (clubId == UUID.fromString(LEGACY_PUBLIC_CLUB_ID)) getSession(sessionId) else null

    fun putSession(sessionId: UUID, result: PublicSessionDetailResult)

    fun putSession(clubSlug: String, sessionId: UUID, result: PublicSessionDetailResult) {
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) {
            putSession(sessionId, result)
        }
    }

    fun putSession(clubId: UUID, sessionId: UUID, result: PublicSessionDetailResult) {
        if (clubId == UUID.fromString(LEGACY_PUBLIC_CLUB_ID)) {
            putSession(sessionId, result)
        }
    }

    fun getClubId(clubSlug: String): UUID? =
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) UUID.fromString(LEGACY_PUBLIC_CLUB_ID) else null

    fun putClubId(clubSlug: String, clubId: UUID) = Unit

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
        private val clubsById = mutableMapOf<UUID, PublicClubResult>()
        private val sessionsByClubId = mutableMapOf<Pair<UUID, UUID>, PublicSessionDetailResult>()
        private val clubIdsBySlug = mutableMapOf<String, UUID>()

        override fun getClub(): PublicClubResult? = club

        override fun putClub(result: PublicClubResult) {
            club = result
        }

        override fun getSession(sessionId: UUID): PublicSessionDetailResult? =
            sessions[sessionId]

        override fun putSession(sessionId: UUID, result: PublicSessionDetailResult) {
            sessions[sessionId] = result
        }

        override fun getClub(clubId: UUID): PublicClubResult? =
            clubsById[clubId] ?: super.getClub(clubId)

        override fun putClub(clubId: UUID, result: PublicClubResult) {
            clubsById[clubId] = result
        }

        override fun getSession(clubId: UUID, sessionId: UUID): PublicSessionDetailResult? =
            sessionsByClubId[clubId to sessionId] ?: super.getSession(clubId, sessionId)

        override fun putSession(clubId: UUID, sessionId: UUID, result: PublicSessionDetailResult) {
            sessionsByClubId[clubId to sessionId] = result
        }

        override fun getClubId(clubSlug: String): UUID? =
            clubIdsBySlug[clubSlug] ?: super.getClubId(clubSlug)

        override fun putClubId(clubSlug: String, clubId: UUID) {
            clubIdsBySlug[clubSlug] = clubId
        }
    }
}
