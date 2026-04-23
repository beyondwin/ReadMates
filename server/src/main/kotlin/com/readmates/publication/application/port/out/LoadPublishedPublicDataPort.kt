package com.readmates.publication.application.port.out

import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import java.util.UUID

interface LoadPublishedPublicDataPort {
    fun loadClub(): PublicClubResult?

    fun loadSession(sessionId: UUID): PublicSessionDetailResult?
}
