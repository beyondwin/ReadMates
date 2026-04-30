package com.readmates.note.application.port.out

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.util.UUID

interface LoadNotesFeedPort {
    fun loadNoteSessions(clubId: UUID, pageRequest: PageRequest): CursorPage<NoteSessionResult>
    fun loadNotesFeed(clubId: UUID, pageRequest: PageRequest): CursorPage<NoteFeedResult>
    fun loadNotesFeedForSession(
        clubId: UUID,
        sessionId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<NoteFeedResult>
}
