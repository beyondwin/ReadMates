package com.readmates.note.api

import com.readmates.archive.application.ArchiveRepository
import com.readmates.auth.application.MemberAccountRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

data class NoteFeedItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val authorName: String?,
    val authorShortName: String?,
    val kind: String,
    val text: String,
)

data class NoteSessionItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val questionCount: Int,
    val oneLinerCount: Int,
    val longReviewCount: Int,
    val highlightCount: Int,
    val totalCount: Int,
)

@RestController
@RequestMapping("/api/notes")
class NotesFeedController(
    private val memberAccountRepository: MemberAccountRepository,
    private val archiveRepository: ArchiveRepository,
) {
    @GetMapping("/feed")
    fun feed(
        authentication: Authentication?,
        @RequestParam("sessionId", required = false) sessionId: String?,
    ): List<NoteFeedItem> {
        val currentMember = currentMember(authentication)
        if (sessionId != null) {
            val parsedSessionId = parseSessionIdOrNull(sessionId) ?: return emptyList()
            return archiveRepository.findNotesFeedForSession(currentMember.clubId, parsedSessionId)
        }

        return archiveRepository.findNotesFeed(currentMember.clubId)
    }

    @GetMapping("/sessions")
    fun sessions(authentication: Authentication?): List<NoteSessionItem> {
        val currentMember = currentMember(authentication)
        return archiveRepository.findNoteSessions(currentMember.clubId)
    }

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }

    private fun parseSessionIdOrNull(sessionId: String): UUID? =
        runCatching { UUID.fromString(sessionId) }.getOrNull()
}
