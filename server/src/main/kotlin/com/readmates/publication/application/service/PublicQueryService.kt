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
    @Suppress("ReturnCount")
    override fun getClub(clubSlug: String): PublicClubResult? {
        resolveClubId(clubSlug)
        val markerResult = runCatching { loadPublishedPublicDataPort.loadClubProjectionGeneration(clubSlug) }
        if (markerResult.isFailure) return null
        val marker = markerResult.getOrNull() ?: return loadPublishedPublicDataPort.loadClub(clubSlug)
        if (!marker.originReadable) return null

        return cache.getClub(marker.clubId, marker.generation)
            ?: loadPublishedPublicDataPort
                .loadClub(clubSlug)
                ?.copy(
                    projectionGeneration = marker.generation,
                )?.also {
                    cache.putClub(marker.clubId, marker.generation, it)
                }
    }

    @Suppress("ReturnCount")
    override fun getSession(
        clubSlug: String,
        sessionId: UUID,
    ): PublicSessionDetailResult? {
        resolveClubId(clubSlug)
        val markerResult =
            runCatching {
                loadPublishedPublicDataPort.loadSessionProjectionGeneration(clubSlug, sessionId)
            }
        if (markerResult.isFailure) return null
        val marker = markerResult.getOrNull() ?: return loadPublishedPublicDataPort.loadSession(clubSlug, sessionId)
        if (!marker.originReadable) return null

        return cache.getSession(marker.clubId, marker.clubGeneration, marker.generation, sessionId)
            ?: loadPublishedPublicDataPort
                .loadSession(clubSlug, sessionId)
                ?.copy(
                    projectionGeneration = marker.generation,
                    clubProjectionGeneration = marker.clubGeneration,
                    liveRecordRevision = marker.liveRecordRevision ?: 0,
                )?.also {
                    cache.putSession(marker.clubId, marker.clubGeneration, marker.generation, sessionId, it)
                }
    }

    private fun resolveClubId(clubSlug: String): UUID? =
        cache.getClubId(clubSlug)
            ?: resolveClubContextUseCase?.resolveBySlug(clubSlug)?.clubId?.also {
                cache.putClubId(clubSlug, it)
            }
}
