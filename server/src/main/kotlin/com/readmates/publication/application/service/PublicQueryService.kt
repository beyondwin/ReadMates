package com.readmates.publication.application.service

import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.port.`in`.GetPublicClubUseCase
import com.readmates.publication.application.port.`in`.GetPublicSessionUseCase
import com.readmates.publication.application.port.out.LoadPublishedPublicDataPort
import com.readmates.publication.application.port.out.PublicReadCachePort
import com.readmates.shared.architecture.ReadOnlyApplicationService
import org.springframework.stereotype.Service
import java.util.UUID

@ReadOnlyApplicationService
@Service
class PublicQueryService(
    private val loadPublishedPublicDataPort: LoadPublishedPublicDataPort,
    private val cache: PublicReadCachePort = PublicReadCachePort.Noop(),
    private val resolveClubContextUseCase: ResolveClubContextUseCase? = null,
) : GetPublicClubUseCase,
    GetPublicSessionUseCase {
    override fun getClub(clubSlug: String): PublicClubResult? {
        val clubId = resolveClubId(clubSlug)
        return if (clubId != null) {
            val generation = authoritativeClubGenerationOrNull(clubSlug)
            if (generation == null) {
                loadPublishedPublicDataPort.loadClub(clubSlug)
            } else {
                cache.getClub(clubId, generation) ?: loadPublishedPublicDataPort.loadClub(clubSlug)?.also {
                    cache.putClub(clubId, generation, it)
                }
            }
        } else {
            loadPublishedPublicDataPort.loadClub(clubSlug)
        }
    }

    override fun getSession(
        clubSlug: String,
        sessionId: UUID,
    ): PublicSessionDetailResult? {
        val clubId = resolveClubId(clubSlug)
        return if (clubId != null) {
            val marker = authoritativeSessionGenerationOrNull(clubSlug, sessionId)
            when {
                marker == null -> loadPublishedPublicDataPort.loadSession(clubSlug, sessionId)
                !marker.originReadable -> null
                else ->
                    cache.getSession(clubId, sessionId, marker.generation)
                        ?: loadPublishedPublicDataPort.loadSession(clubSlug, sessionId)?.also {
                            cache.putSession(clubId, sessionId, marker.generation, it)
                        }
            }
        } else {
            loadPublishedPublicDataPort.loadSession(clubSlug, sessionId)
        }
    }

    private fun authoritativeClubGenerationOrNull(clubSlug: String): Long? =
        try {
            loadPublishedPublicDataPort.loadClubGeneration(clubSlug)
        } catch (_: RuntimeException) {
            null
        }

    private fun authoritativeSessionGenerationOrNull(
        clubSlug: String,
        sessionId: UUID,
    ) = try {
        loadPublishedPublicDataPort.loadSessionGeneration(clubSlug, sessionId)
    } catch (_: RuntimeException) {
        null
    }

    private fun resolveClubId(clubSlug: String): UUID? =
        cache.getClubId(clubSlug)
            ?: resolveClubContextUseCase?.resolveBySlug(clubSlug)?.clubId?.also {
                cache.putClubId(clubSlug, it)
            }
}
