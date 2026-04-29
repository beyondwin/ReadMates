package com.readmates.publication.application.port.`in`

import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_SLUG
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import java.util.UUID

interface GetPublicClubUseCase {
    fun getClub(clubSlug: String): PublicClubResult?

    fun getClub(): PublicClubResult? = getClub(LEGACY_PUBLIC_CLUB_SLUG)
}

interface GetPublicSessionUseCase {
    fun getSession(clubSlug: String, sessionId: UUID): PublicSessionDetailResult?

    fun getSession(sessionId: UUID): PublicSessionDetailResult? = getSession(LEGACY_PUBLIC_CLUB_SLUG, sessionId)
}
