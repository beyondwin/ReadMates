package com.readmates.publication.application.service

import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
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
    private val resolveClubContextUseCase: ResolveClubContextUseCase? = null,
) : GetPublicClubUseCase, GetPublicSessionUseCase {
    override fun getClub(clubSlug: String): PublicClubResult? {
        val clubId = resolveClubId(clubSlug)
        if (clubId != null) {
            return cache.getClub(clubId) ?: loadPublishedPublicDataPort.loadClub(clubSlug)?.also {
                cache.putClub(clubId, it)
            }
        }

        return cache.getClub(clubSlug) ?: loadPublishedPublicDataPort.loadClub(clubSlug)?.also {
            cache.putClub(clubSlug, it)
        }
    }

    override fun getSession(clubSlug: String, sessionId: UUID): PublicSessionDetailResult? {
        val clubId = resolveClubId(clubSlug)
        if (clubId != null) {
            return cache.getSession(clubId, sessionId) ?: loadPublishedPublicDataPort.loadSession(clubSlug, sessionId)?.also {
                cache.putSession(clubId, sessionId, it)
            }
        }

        return cache.getSession(clubSlug, sessionId) ?: loadPublishedPublicDataPort.loadSession(clubSlug, sessionId)?.also {
            cache.putSession(clubSlug, sessionId, it)
        }
    }

    private fun resolveClubId(clubSlug: String): UUID? =
        cache.getClubId(clubSlug)
            ?: resolveClubContextUseCase?.resolveBySlug(clubSlug)?.clubId?.also {
                cache.putClubId(clubSlug, it)
            }
}
