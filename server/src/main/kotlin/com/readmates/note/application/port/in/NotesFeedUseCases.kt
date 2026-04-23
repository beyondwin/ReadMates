package com.readmates.note.application.port.`in`

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import com.readmates.shared.security.CurrentMember

interface GetNotesFeedUseCase {
    fun getNotesFeed(member: CurrentMember, sessionId: String?): List<NoteFeedResult>
}

interface ListNoteSessionsUseCase {
    fun listNoteSessions(member: CurrentMember): List<NoteSessionResult>
}
