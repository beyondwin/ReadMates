package com.readmates.note.application.service

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.port.`in`.GetNotesFeedUseCase
import com.readmates.note.application.port.`in`.ListNoteSessionsUseCase
import com.readmates.note.application.port.out.LoadNotesFeedPort
import com.readmates.note.application.port.out.NotesReadCachePort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class NotesFeedService(
    private val loadNotesFeedPort: LoadNotesFeedPort,
    private val cache: NotesReadCachePort = NotesReadCachePort.Noop(),
) : GetNotesFeedUseCase,
    ListNoteSessionsUseCase {
    override fun getNotesFeed(member: CurrentMember, sessionId: String?): List<NoteFeedResult> {
        if (sessionId != null) {
            val parsedSessionId = parseSessionIdOrNull(sessionId) ?: return emptyList()
            return cache.getSessionFeed(member.clubId, parsedSessionId)
                ?: loadNotesFeedPort.loadNotesFeedForSession(member.clubId, parsedSessionId).also {
                    cache.putSessionFeed(member.clubId, parsedSessionId, it)
                }
        }

        return cache.getFeed(member.clubId)
            ?: loadNotesFeedPort.loadNotesFeed(member.clubId).also {
                cache.putFeed(member.clubId, it)
            }
    }

    override fun listNoteSessions(member: CurrentMember) =
        cache.getSessions(member.clubId)
            ?: loadNotesFeedPort.loadNoteSessions(member.clubId).also {
                cache.putSessions(member.clubId, it)
            }

    private fun parseSessionIdOrNull(sessionId: String): UUID? =
        runCatching { UUID.fromString(sessionId) }.getOrNull()
}
