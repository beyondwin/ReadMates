package com.readmates.note.application.service

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.port.`in`.GetNotesFeedUseCase
import com.readmates.note.application.port.`in`.ListNoteSessionsUseCase
import com.readmates.note.application.port.out.LoadNotesFeedPort
import com.readmates.note.application.port.out.NotesReadCachePort
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class NotesFeedService(
    private val loadNotesFeedPort: LoadNotesFeedPort,
    private val cache: NotesReadCachePort = NotesReadCachePort.Noop(),
) : GetNotesFeedUseCase,
    ListNoteSessionsUseCase {
    override fun getNotesFeed(
        member: CurrentMember,
        sessionId: String?,
        pageRequest: PageRequest,
    ): CursorPage<NoteFeedResult> {
        if (sessionId != null) {
            val parsedSessionId = parseSessionIdOrNull(sessionId) ?: return CursorPage(emptyList(), null)
            return loadNotesFeedPort.loadNotesFeedForSession(member.clubId, parsedSessionId, pageRequest)
        }
        return loadNotesFeedPort.loadNotesFeed(member.clubId, pageRequest)
    }

    override fun listNoteSessions(member: CurrentMember, pageRequest: PageRequest) =
        loadNotesFeedPort.loadNoteSessions(member.clubId, pageRequest)

    private fun parseSessionIdOrNull(sessionId: String): UUID? =
        runCatching { UUID.fromString(sessionId) }.getOrNull()

}
