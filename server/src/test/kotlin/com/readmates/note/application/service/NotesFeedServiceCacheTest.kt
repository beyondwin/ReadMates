package com.readmates.note.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import com.readmates.note.application.port.out.LoadNotesFeedPort
import com.readmates.note.application.port.out.NotesReadCachePort
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

class NotesFeedServiceCacheTest {
    private val member = CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = CLUB_ID,
        clubSlug = "reading-sai",
        email = "member@example.com",
        displayName = "Member",
        accountName = "Member",
        role = MembershipRole.MEMBER,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    @Test
    fun `returns cached club feed without loading port`() {
        val cache = NotesReadCachePort.InMemoryForTest(feed = listOf(feedItem()))
        val loader = RecordingNotesLoader()
        val service = NotesFeedService(loader, cache)

        val result = service.getNotesFeed(member, null)

        assertEquals(1, result.size)
        assertEquals(0, loader.feedLoads)
    }

    @Test
    fun `loads and stores session feed on cache miss`() {
        val cache = NotesReadCachePort.InMemoryForTest()
        val loader = RecordingNotesLoader()
        val service = NotesFeedService(loader, cache)
        val sessionId = SESSION_ID.toString()

        service.getNotesFeed(member, sessionId)
        service.getNotesFeed(member, sessionId)

        assertEquals(1, loader.sessionFeedLoads)
    }

    @Test
    fun `loads and stores sessions list on cache miss`() {
        val cache = NotesReadCachePort.InMemoryForTest()
        val loader = RecordingNotesLoader()
        val service = NotesFeedService(loader, cache)

        service.listNoteSessions(member)
        service.listNoteSessions(member)

        assertEquals(1, loader.sessionsLoads)
    }

    @Test
    fun `invalid session id returns empty result without cache or loader`() {
        val cache = RecordingNotesCache()
        val loader = RecordingNotesLoader()
        val service = NotesFeedService(loader, cache)

        val result = service.getNotesFeed(member, "not-a-uuid")

        assertEquals(emptyList<NoteFeedResult>(), result)
        assertEquals(0, cache.getCalls)
        assertEquals(0, cache.putCalls)
        assertEquals(0, loader.feedLoads)
        assertEquals(0, loader.sessionFeedLoads)
        assertEquals(0, loader.sessionsLoads)
    }

    private class RecordingNotesLoader : LoadNotesFeedPort {
        var feedLoads = 0
        var sessionFeedLoads = 0
        var sessionsLoads = 0

        override fun loadNoteSessions(clubId: UUID): List<NoteSessionResult> =
            listOf(noteSession()).also { sessionsLoads += 1 }

        override fun loadNotesFeed(clubId: UUID): List<NoteFeedResult> =
            listOf(feedItem()).also { feedLoads += 1 }

        override fun loadNotesFeedForSession(clubId: UUID, sessionId: UUID): List<NoteFeedResult> =
            listOf(feedItem()).also { sessionFeedLoads += 1 }
    }

    private class RecordingNotesCache : NotesReadCachePort {
        var getCalls = 0
        var putCalls = 0

        override fun getFeed(clubId: UUID): List<NoteFeedResult>? {
            getCalls += 1
            return null
        }

        override fun putFeed(clubId: UUID, result: List<NoteFeedResult>) {
            putCalls += 1
        }

        override fun getSessionFeed(clubId: UUID, sessionId: UUID): List<NoteFeedResult>? {
            getCalls += 1
            return null
        }

        override fun putSessionFeed(clubId: UUID, sessionId: UUID, result: List<NoteFeedResult>) {
            putCalls += 1
        }

        override fun getSessions(clubId: UUID): List<NoteSessionResult>? {
            getCalls += 1
            return null
        }

        override fun putSessions(clubId: UUID, result: List<NoteSessionResult>) {
            putCalls += 1
        }
    }

    companion object {
        private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        private val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")

        fun feedItem() = NoteFeedResult(
            sessionId = SESSION_ID.toString(),
            sessionNumber = 1,
            bookTitle = "Book",
            date = "2026-04-28",
            authorName = "Member",
            authorShortName = "Member",
            kind = "QUESTION",
            text = "Question",
        )

        fun noteSession() = NoteSessionResult(
            sessionId = SESSION_ID.toString(),
            sessionNumber = 1,
            bookTitle = "Book",
            date = "2026-04-28",
            questionCount = 1,
            oneLinerCount = 0,
            longReviewCount = 0,
            highlightCount = 0,
            totalCount = 1,
        )
    }
}
