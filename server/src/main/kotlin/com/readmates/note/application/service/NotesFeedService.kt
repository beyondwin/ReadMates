package com.readmates.note.application.service

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.port.`in`.GetNotesFeedUseCase
import com.readmates.note.application.port.`in`.ListNoteSessionsUseCase
import com.readmates.note.application.port.out.LoadNotesFeedPort
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class NotesFeedService(
    private val loadNotesFeedPort: LoadNotesFeedPort,
) : GetNotesFeedUseCase,
    ListNoteSessionsUseCase {
    override fun getNotesFeed(member: CurrentMember, sessionId: String?): List<NoteFeedResult> {
        if (sessionId != null) {
            val parsedSessionId = parseSessionIdOrNull(sessionId) ?: return emptyList()
            return loadNotesFeedPort.loadNotesFeedForSession(member.clubId, parsedSessionId)
        }

        return loadNotesFeedPort.loadNotesFeed(member.clubId)
    }

    override fun listNoteSessions(member: CurrentMember) =
        loadNotesFeedPort.loadNoteSessions(member.clubId)

    private fun parseSessionIdOrNull(sessionId: String): UUID? =
        runCatching { UUID.fromString(sessionId) }.getOrNull()
}
