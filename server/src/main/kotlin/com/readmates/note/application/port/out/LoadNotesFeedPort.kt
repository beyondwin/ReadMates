package com.readmates.note.application.port.out

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import java.util.UUID

interface LoadNotesFeedPort {
    fun loadNoteSessions(clubId: UUID): List<NoteSessionResult>
    fun loadNotesFeed(clubId: UUID): List<NoteFeedResult>
    fun loadNotesFeedForSession(clubId: UUID, sessionId: UUID): List<NoteFeedResult>
}
