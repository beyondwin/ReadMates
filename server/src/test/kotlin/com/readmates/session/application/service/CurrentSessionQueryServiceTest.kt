package com.readmates.session.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.CurrentSessionBoard
import com.readmates.session.application.CurrentSessionDetail
import com.readmates.session.application.CurrentSessionPayload
import com.readmates.session.application.port.out.LoadCurrentSessionPort
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.util.UUID

class CurrentSessionQueryServiceTest {
    private val session =
        CurrentSessionDetail(
            sessionId = "00000000-0000-0000-0000-000000000301",
            sessionNumber = 7,
            title = "7회차",
            bookTitle = "테스트 책",
            bookAuthor = "테스트 저자",
            bookLink = null,
            bookImageUrl = null,
            date = "2026-06-20",
            startTime = "20:00",
            endTime = "22:00",
            locationLabel = "온라인",
            meetingUrl = "https://meeting.invalid/viewer-privacy",
            meetingPasscode = "viewer-room-2048",
            questionDeadlineAt = "2026-06-19T14:59Z",
            myRsvpStatus = "NO_RESPONSE",
            attendees = emptyList(),
            myCheckin = null,
            myQuestions = emptyList(),
            myOneLineReview = null,
            myLongReview = null,
            board = CurrentSessionBoard(questions = emptyList(), longReviews = emptyList()),
        )

    @Test
    fun `viewer current session omits meeting connection secrets`() {
        val service = CurrentSessionQueryService(stubPort())

        val result = service.currentSession(member(MembershipStatus.VIEWER)).currentSession

        assertEquals(session.sessionId, result?.sessionId)
        assertNull(result?.meetingUrl)
        assertNull(result?.meetingPasscode)
    }

    @Test
    fun `member current session keeps meeting connection secrets`() {
        val service = CurrentSessionQueryService(stubPort())

        val result = service.currentSession(member(MembershipStatus.ACTIVE)).currentSession

        assertEquals(session.meetingUrl, result?.meetingUrl)
        assertEquals(session.meetingPasscode, result?.meetingPasscode)
    }

    private fun stubPort(): LoadCurrentSessionPort =
        object : LoadCurrentSessionPort {
            override fun loadCurrentSession(member: CurrentMember) = CurrentSessionPayload(session)
        }

    private fun member(status: MembershipStatus) =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000102"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000202"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubSlug = "reading-sai",
            email = "member@example.com",
            displayName = "멤버",
            accountName = "김멤버",
            role = MembershipRole.MEMBER,
            membershipStatus = status,
        )
}
