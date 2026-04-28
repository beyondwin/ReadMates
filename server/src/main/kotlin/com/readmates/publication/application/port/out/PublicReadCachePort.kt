package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import java.util.UUID

interface PublicReadCachePort {
    fun getClub(): PublicClubResult?

    fun putClub(result: PublicClubResult)

    fun getSession(sessionId: UUID): PublicSessionDetailResult?

    fun putSession(sessionId: UUID, result: PublicSessionDetailResult)

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
