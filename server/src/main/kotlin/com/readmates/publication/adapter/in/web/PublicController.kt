package com.readmates.publication.adapter.`in`.web

import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicClubStatsResult
import com.readmates.publication.application.model.PublicHighlightResult
import com.readmates.publication.application.model.PublicOneLinerResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.model.PublicSessionSummaryResult
import com.readmates.publication.application.port.`in`.GetPublicClubUseCase
import com.readmates.publication.application.port.`in`.GetPublicSessionUseCase
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
@RequestMapping("/api/public")
class PublicController(
    private val getPublicClubUseCase: GetPublicClubUseCase,
    private val getPublicSessionUseCase: GetPublicSessionUseCase,
) {
    @GetMapping("/club")
    fun club(): PublicClubResponse =
        getPublicClubUseCase.getClub()?.toResponse()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/sessions/{sessionId}")
    fun session(@PathVariable sessionId: String): PublicSessionDetailResponse {
        val id = runCatching { UUID.fromString(sessionId) }.getOrNull()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        return getPublicSessionUseCase.getSession(id)?.toResponse()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
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
