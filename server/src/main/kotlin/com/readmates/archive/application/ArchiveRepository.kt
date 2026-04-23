package com.readmates.archive.application

import com.readmates.note.api.NoteFeedItem
import com.readmates.note.api.NoteSessionItem
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class ArchiveRepository(
    private val notesFeedQueryRepository: NotesFeedQueryRepository,
) {
    fun findNoteSessions(clubId: UUID): List<NoteSessionItem> =
        notesFeedQueryRepository.findNoteSessions(clubId)

    fun findNotesFeed(clubId: UUID): List<NoteFeedItem> =
        notesFeedQueryRepository.findNotesFeed(clubId)

    fun findNotesFeedForSession(clubId: UUID, sessionId: UUID): List<NoteFeedItem> =
        notesFeedQueryRepository.findNotesFeedForSession(clubId, sessionId)
}
