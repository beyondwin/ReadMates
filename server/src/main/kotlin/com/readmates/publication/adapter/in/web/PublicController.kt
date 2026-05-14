package com.readmates.publication.adapter.`in`.web

import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_SLUG
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicClubStatsResult
import com.readmates.publication.application.model.PublicHighlightResult
import com.readmates.publication.application.model.PublicOneLinerResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.model.PublicSessionSummaryResult
import com.readmates.publication.application.port.`in`.GetPublicClubUseCase
import com.readmates.publication.application.port.`in`.GetPublicSessionUseCase
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

private const val PUBLIC_CACHE_CONTROL = "public, max-age=120, stale-while-revalidate=600"

@RestController
@RequestMapping("/api/public")
class PublicController(
    private val getPublicClubUseCase: GetPublicClubUseCase,
    private val getPublicSessionUseCase: GetPublicSessionUseCase,
) {
    @GetMapping("/club")
    fun club(): ResponseEntity<PublicClubResponse> = club(LEGACY_PUBLIC_CLUB_SLUG)

    @GetMapping("/clubs/{clubSlug}")
    fun club(
        @PathVariable clubSlug: String,
    ): ResponseEntity<PublicClubResponse> {
        val response =
            getPublicClubUseCase.getClub(clubSlug)?.toResponse()
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        return ResponseEntity
            .ok()
            .header("Cache-Control", PUBLIC_CACHE_CONTROL)
            .body(response)
    }

    @GetMapping("/sessions/{sessionId}")
    fun session(
        @PathVariable sessionId: String,
    ): ResponseEntity<PublicSessionDetailResponse> = session(LEGACY_PUBLIC_CLUB_SLUG, sessionId)

    @GetMapping("/clubs/{clubSlug}/sessions/{sessionId}")
    fun session(
        @PathVariable clubSlug: String,
        @PathVariable sessionId: String,
    ): ResponseEntity<PublicSessionDetailResponse> {
        val id =
            runCatching { UUID.fromString(sessionId) }.getOrNull()
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        val response =
            getPublicSessionUseCase.getSession(clubSlug, id)?.toResponse()
                ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        return ResponseEntity
            .ok()
            .header("Cache-Control", PUBLIC_CACHE_CONTROL)
            .body(response)
    }

    private fun PublicClubResult.toResponse() =
        PublicClubResponse(
            clubName = clubName,
            tagline = tagline,
            about = about,
            stats = stats.toResponse(),
            recentSessions = recentSessions.map { it.toResponse() },
        )

    private fun PublicClubStatsResult.toResponse() =
        PublicClubStats(
            sessions = sessions,
            books = books,
            members = members,
        )

    private fun PublicSessionSummaryResult.toResponse() =
        PublicSessionListItem(
            sessionId = sessionId,
            sessionNumber = sessionNumber,
            bookTitle = bookTitle,
            bookAuthor = bookAuthor,
            bookImageUrl = bookImageUrl,
            date = date,
            summary = summary,
            highlightCount = highlightCount,
            oneLinerCount = oneLinerCount,
        )

    private fun PublicSessionDetailResult.toResponse() =
        PublicSessionDetailResponse(
            sessionId = sessionId,
            sessionNumber = sessionNumber,
            bookTitle = bookTitle,
            bookAuthor = bookAuthor,
            bookImageUrl = bookImageUrl,
            date = date,
            summary = summary,
            highlights = highlights.map { it.toResponse() },
            oneLiners = oneLiners.map { it.toResponse() },
        )

    private fun PublicHighlightResult.toResponse() =
        PublicHighlight(
            text = text,
            sortOrder = sortOrder,
            authorName = authorName,
            authorShortName = authorShortName,
        )

    private fun PublicOneLinerResult.toResponse() =
        PublicOneLiner(
            authorName = authorName,
            authorShortName = authorShortName,
            text = text,
        )
}
