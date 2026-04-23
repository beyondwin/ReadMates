package com.readmates.publication.application.port.`in`

import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import java.util.UUID

interface GetPublicClubUseCase {
    fun getClub(): PublicClubResult?
}

interface GetPublicSessionUseCase {
    fun getSession(sessionId: UUID): PublicSessionDetailResult?
}
