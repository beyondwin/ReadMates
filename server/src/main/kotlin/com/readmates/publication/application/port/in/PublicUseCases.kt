package com.readmates.publication.application.port.`in`

import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_SLUG
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicConvergenceProcessResult
import com.readmates.publication.application.model.PublicConvergenceView
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.shared.security.ClubActor
import java.util.UUID

interface GetPublicClubUseCase {
    fun getClub(clubSlug: String): PublicClubResult?

    fun getClub(): PublicClubResult? = getClub(LEGACY_PUBLIC_CLUB_SLUG)
}

interface GetPublicSessionUseCase {
    fun getSession(
        clubSlug: String,
        sessionId: UUID,
    ): PublicSessionDetailResult?

    fun getSession(sessionId: UUID): PublicSessionDetailResult? = getSession(LEGACY_PUBLIC_CLUB_SLUG, sessionId)
}

interface GetHostPublicConvergenceUseCase {
    fun getConvergence(
        actor: ClubActor,
        sessionId: UUID,
        mutationReceiptId: UUID,
    ): PublicConvergenceView

    fun getLatestConvergence(
        actor: ClubActor,
        sessionId: UUID,
    ): PublicConvergenceView?

    fun retryConvergence(
        actor: ClubActor,
        sessionId: UUID,
        convergenceId: UUID,
    ): PublicConvergenceView
}

interface ProcessPublicConvergenceUseCase {
    fun processOne(workerId: String): PublicConvergenceProcessResult
}

interface MaintainPublicConvergenceWorkUseCase {
    fun purgeExpiredWork(): Int
}
