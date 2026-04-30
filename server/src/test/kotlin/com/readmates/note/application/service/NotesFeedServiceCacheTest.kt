package com.readmates.note.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import com.readmates.note.application.port.out.LoadNotesFeedPort
import com.readmates.note.application.port.out.NotesReadCachePort
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

class NotesFeedServiceCacheTest {
    private val firstPage = PageRequest.cursor(null, null, defaultLimit = 60, maxLimit = 120)
    private val sessionPage = PageRequest.cursor(null, null, defaultLimit = 30, maxLimit = 100)
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
    fun `paged club feed bypasses legacy unpaged cache`() {
        val cache = RecordingNotesCache(feed = listOf(feedItem(text = "cached feed item")))
        val loader = RecordingNotesLoader()
        val service = NotesFeedService(loader, cache)

        val result = service.getNotesFeed(member, null, firstPage)

        assertEquals(1, result.items.size)
        assertEquals("Question", result.items.single().text)
        assertEquals(0, cache.getCalls)
        assertEquals(0, cache.putCalls)
        assertEquals(1, loader.feedLoads)
    }

    @Test
    fun `paged session feed bypasses legacy unpaged cache`() {
        val cache = RecordingNotesCache(sessionFeed = listOf(feedItem(text = "cached session item")))
        val loader = RecordingNotesLoader()
        val service = NotesFeedService(loader, cache)
        val sessionId = SESSION_ID.toString()

        val firstResult = service.getNotesFeed(member, sessionId, firstPage)
        val secondResult = service.getNotesFeed(member, sessionId, firstPage)

        assertEquals("Question", firstResult.items.single().text)
        assertEquals("Question", secondResult.items.single().text)
        assertEquals(0, cache.getCalls)
        assertEquals(0, cache.putCalls)
        assertEquals(2, loader.sessionFeedLoads)
    }

    @Test
    fun `paged sessions list bypasses legacy unpaged cache`() {
        val cache = RecordingNotesCache(sessions = listOf(noteSession(bookTitle = "Cached Book")))
        val loader = RecordingNotesLoader()
        val service = NotesFeedService(loader, cache)

        val firstResult = service.listNoteSessions(member, sessionPage)
        val secondResult = service.listNoteSessions(member, sessionPage)

        assertEquals("Book", firstResult.items.single().bookTitle)
        assertEquals("Book", secondResult.items.single().bookTitle)
        assertEquals(0, cache.getCalls)
        assertEquals(0, cache.putCalls)
        assertEquals(2, loader.sessionsLoads)
    }

    @Test
    fun `invalid session id returns empty result without cache or loader`() {
        val cache = RecordingNotesCache()
        val loader = RecordingNotesLoader()
        val service = NotesFeedService(loader, cache)

        val result = service.getNotesFeed(member, "not-a-uuid", firstPage)

        assertEquals(emptyList<NoteFeedResult>(), result.items)
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

        override fun loadNoteSessions(clubId: UUID, pageRequest: PageRequest): CursorPage<NoteSessionResult> =
            CursorPage(listOf(noteSession()), null).also { sessionsLoads += 1 }

        override fun loadNotesFeed(clubId: UUID, pageRequest: PageRequest): CursorPage<NoteFeedResult> =
            CursorPage(listOf(feedItem()), null).also { feedLoads += 1 }

        override fun loadNotesFeedForSession(
            clubId: UUID,
            sessionId: UUID,
            pageRequest: PageRequest,
        ): CursorPage<NoteFeedResult> =
            CursorPage(listOf(feedItem()), null).also { sessionFeedLoads += 1 }
    }

    private class RecordingNotesCache(
        private val feed: List<NoteFeedResult>? = null,
        private val sessionFeed: List<NoteFeedResult>? = null,
        private val sessions: List<NoteSessionResult>? = null,
    ) : NotesReadCachePort {
        var getCalls = 0
        var putCalls = 0

        override fun getFeed(clubId: UUID): List<NoteFeedResult>? {
            getCalls += 1
            return feed
        }

        override fun putFeed(clubId: UUID, result: List<NoteFeedResult>) {
            putCalls += 1
        }

        override fun getSessionFeed(clubId: UUID, sessionId: UUID): List<NoteFeedResult>? {
            getCalls += 1
            return sessionFeed
        }

        override fun putSessionFeed(clubId: UUID, sessionId: UUID, result: List<NoteFeedResult>) {
            putCalls += 1
        }

        override fun getSessions(clubId: UUID): List<NoteSessionResult>? {
            getCalls += 1
            return sessions
        }

        override fun putSessions(clubId: UUID, result: List<NoteSessionResult>) {
            putCalls += 1
        }
    }

    companion object {
        private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        private val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")

        fun feedItem(text: String = "Question") = NoteFeedResult(
            sessionId = SESSION_ID.toString(),
            sessionNumber = 1,
            bookTitle = "Book",
            date = "2026-04-28",
            authorName = "Member",
            authorShortName = "Member",
            kind = "QUESTION",
            text = text,
        )

        fun noteSession(bookTitle: String = "Book") = NoteSessionResult(
            sessionId = SESSION_ID.toString(),
            sessionNumber = 1,
            bookTitle = bookTitle,
            date = "2026-04-28",
            questionCount = 1,
            oneLinerCount = 0,
            longReviewCount = 0,
            highlightCount = 0,
            totalCount = 1,
        )
    }
}
