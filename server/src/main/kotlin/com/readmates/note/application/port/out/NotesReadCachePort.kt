package com.readmates.note.application.port.out

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import java.util.UUID

interface NotesReadCachePort {
    fun getFeed(clubId: UUID): List<NoteFeedResult>?
    fun putFeed(clubId: UUID, result: List<NoteFeedResult>)
    fun getSessionFeed(clubId: UUID, sessionId: UUID): List<NoteFeedResult>?
    fun putSessionFeed(clubId: UUID, sessionId: UUID, result: List<NoteFeedResult>)
    fun getSessions(clubId: UUID): List<NoteSessionResult>?
    fun putSessions(clubId: UUID, result: List<NoteSessionResult>)

    class Noop : NotesReadCachePort {
        override fun getFeed(clubId: UUID): List<NoteFeedResult>? = null

        override fun putFeed(clubId: UUID, result: List<NoteFeedResult>) = Unit

        override fun getSessionFeed(clubId: UUID, sessionId: UUID): List<NoteFeedResult>? = null

        override fun putSessionFeed(clubId: UUID, sessionId: UUID, result: List<NoteFeedResult>) = Unit

        override fun getSessions(clubId: UUID): List<NoteSessionResult>? = null

        override fun putSessions(clubId: UUID, result: List<NoteSessionResult>) = Unit
    }

    class InMemoryForTest(
        private var feed: List<NoteFeedResult>? = null,
    ) : NotesReadCachePort {
        private val sessionFeeds = mutableMapOf<Pair<UUID, UUID>, List<NoteFeedResult>>()
        private val sessions = mutableMapOf<UUID, List<NoteSessionResult>>()

        override fun getFeed(clubId: UUID): List<NoteFeedResult>? = feed

        override fun putFeed(clubId: UUID, result: List<NoteFeedResult>) {
            feed = result
        }

        override fun getSessionFeed(clubId: UUID, sessionId: UUID): List<NoteFeedResult>? =
            sessionFeeds[clubId to sessionId]

        override fun putSessionFeed(clubId: UUID, sessionId: UUID, result: List<NoteFeedResult>) {
            sessionFeeds[clubId to sessionId] = result
        }

        override fun getSessions(clubId: UUID): List<NoteSessionResult>? = sessions[clubId]

        override fun putSessions(clubId: UUID, result: List<NoteSessionResult>) {
            sessions[clubId] = result
        }
    }
}
