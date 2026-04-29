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
    override fun getClub(clubSlug: String) =
        cache.getClub(clubSlug) ?: loadPublishedPublicDataPort.loadClub(clubSlug)?.also {
            cache.putClub(clubSlug, it)
        }

    override fun getSession(clubSlug: String, sessionId: UUID) =
        cache.getSession(clubSlug, sessionId) ?: loadPublishedPublicDataPort.loadSession(clubSlug, sessionId)?.also {
            cache.putSession(clubSlug, sessionId, it)
        }
}
