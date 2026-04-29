package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_SLUG
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import java.util.UUID

interface LoadPublishedPublicDataPort {
    fun loadClub(): PublicClubResult?

    fun loadClub(clubSlug: String): PublicClubResult? =
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) loadClub() else null

    fun loadSession(sessionId: UUID): PublicSessionDetailResult?

    fun loadSession(clubSlug: String, sessionId: UUID): PublicSessionDetailResult? =
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) loadSession(sessionId) else null
}
