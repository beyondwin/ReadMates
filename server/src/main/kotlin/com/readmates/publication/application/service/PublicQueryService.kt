package com.readmates.publication.application.service

import com.readmates.publication.application.port.`in`.GetPublicClubUseCase
import com.readmates.publication.application.port.`in`.GetPublicSessionUseCase
import com.readmates.publication.application.port.out.LoadPublishedPublicDataPort
import com.readmates.publication.application.port.out.PublicReadCachePort
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class PublicQueryService(
    private val loadPublishedPublicDataPort: LoadPublishedPublicDataPort,
    private val cache: PublicReadCachePort = PublicReadCachePort.Noop(),
) : GetPublicClubUseCase, GetPublicSessionUseCase {
    override fun getClub() =
        cache.getClub() ?: loadPublishedPublicDataPort.loadClub()?.also(cache::putClub)

    override fun getSession(sessionId: UUID) =
        cache.getSession(sessionId) ?: loadPublishedPublicDataPort.loadSession(sessionId)?.also {
            cache.putSession(sessionId, it)
        }
}
