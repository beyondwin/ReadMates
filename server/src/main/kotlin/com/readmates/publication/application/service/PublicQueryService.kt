package com.readmates.publication.application.service

import com.readmates.publication.application.port.`in`.GetPublicClubUseCase
import com.readmates.publication.application.port.`in`.GetPublicSessionUseCase
import com.readmates.publication.application.port.out.LoadPublishedPublicDataPort
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class PublicQueryService(
    private val loadPublishedPublicDataPort: LoadPublishedPublicDataPort,
) : GetPublicClubUseCase, GetPublicSessionUseCase {
    override fun getClub() =
        loadPublishedPublicDataPort.loadClub()

    override fun getSession(sessionId: UUID) =
        loadPublishedPublicDataPort.loadSession(sessionId)
}
