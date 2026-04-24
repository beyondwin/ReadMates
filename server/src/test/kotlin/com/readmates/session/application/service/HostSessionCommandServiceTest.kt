package com.readmates.session.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.HostSessionDeletionCounts
import com.readmates.session.application.HostSessionDeletionPreviewResponse
import com.readmates.session.application.HostSessionDeletionResponse
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionFeedbackDocument
import com.readmates.session.application.HostSessionListItem
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.out.HostSessionWritePort
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

class HostSessionCommandServiceTest {
    private val host = CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        email = "host@example.com",
        displayName = "호스트",
        accountName = "김호스트",
        role = MembershipRole.HOST,
        membershipStatus = MembershipStatus.ACTIVE,
    )
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

    @Test
    fun `delegates create to host write port`() {
        val port = RecordingHostSessionWritePort()
        val service = HostSessionCommandService(port)
        val command = hostSessionCommand()

        val result = service.create(command)

        assertEquals(command.title, result.title)
        assertEquals("create:${command.title}", port.calls.single())
    }

    @Test
    fun `service delegates host session list`() {
        val port = RecordingHostSessionWritePort()
        val service = HostSessionCommandService(port)

        service.list(host)

        assertEquals(host, port.listHost)
    }

    @Test
    fun `service delegates visibility update`() {
        val port = RecordingHostSessionWritePort()
        val service = HostSessionCommandService(port)
        val command = UpdateHostSessionVisibilityCommand(host, UUID.randomUUID(), SessionRecordVisibility.MEMBER)

        service.updateVisibility(command)

        assertEquals(command, port.visibilityCommand)
    }

    @Test
    fun `service delegates open transition`() {
        val port = RecordingHostSessionWritePort()
        val service = HostSessionCommandService(port)
        val command = HostSessionIdCommand(host, UUID.randomUUID())

        service.open(command)

        assertEquals(command, port.openCommand)
    }

    @Test
    fun `service delegates upcoming sessions`() {
        val port = RecordingHostSessionWritePort()
        val service = HostSessionCommandService(port)

        service.upcoming(host)

        assertEquals(host, port.upcomingMember)
    }

    @Test
    fun `delegates attendance confirmation to host write port`() {
        val port = RecordingHostSessionWritePort()
        val service = HostSessionCommandService(port)
        val command = ConfirmAttendanceCommand(
            host = host,
            sessionId = sessionId,
            entries = listOf(AttendanceEntryCommand("membership-1", "ATTENDED")),
        )

        val result = service.confirmAttendance(command)

        assertEquals(1, result.count)
        assertEquals("confirmAttendance:$sessionId:1", port.calls.single())
    }

    @Test
    fun `delegates dashboard query to host write port`() {
        val port = RecordingHostSessionWritePort()
        val service = HostSessionCommandService(port)

        val result = service.dashboard(host)

        assertEquals(2, result.rsvpPending)
        assertEquals("dashboard:${host.email}", port.calls.single())
    }

    private fun hostSessionCommand() = HostSessionCommand(
        host = host,
        title = "7회차",
        bookTitle = "책",
        bookAuthor = "저자",
        bookLink = "https://example.com/book",
        bookImageUrl = "https://example.com/image.jpg",
        date = "2026-05-20",
        startTime = "19:30",
        endTime = "21:30",
        questionDeadlineAt = null,
        locationLabel = "온라인",
        meetingUrl = "https://meet.example.com/readmates",
        meetingPasscode = "readmates",
    )

    private class RecordingHostSessionWritePort : HostSessionWritePort {
        val calls = mutableListOf<String>()
        var listHost: CurrentMember? = null
        var visibilityCommand: UpdateHostSessionVisibilityCommand? = null
        var openCommand: HostSessionIdCommand? = null
        var upcomingMember: CurrentMember? = null

        override fun list(host: CurrentMember): List<HostSessionListItem> {
            listHost = host
            return emptyList()
        }

        override fun create(command: HostSessionCommand) =
            CreatedSessionResponse(
                sessionId = "00000000-0000-0000-0000-000000000301",
                sessionNumber = 7,
                title = command.title,
                bookTitle = command.bookTitle,
                bookAuthor = command.bookAuthor,
                bookLink = command.bookLink,
                bookImageUrl = command.bookImageUrl,
                date = command.date,
                startTime = command.startTime ?: "20:00",
                endTime = command.endTime ?: "22:00",
                questionDeadlineAt = "2026-05-19T14:59Z",
                locationLabel = command.locationLabel ?: "온라인",
                meetingUrl = command.meetingUrl,
                meetingPasscode = command.meetingPasscode,
                state = "OPEN",
                visibility = SessionRecordVisibility.HOST_ONLY,
            ).also { calls += "create:${command.title}" }

        override fun detail(command: HostSessionIdCommand) =
            hostSessionDetail(command.sessionId).also { calls += "detail:${command.sessionId}" }

        override fun update(command: UpdateHostSessionCommand) =
            hostSessionDetail(command.sessionId).also { calls += "update:${command.sessionId}:${command.session.title}" }

        override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse {
            visibilityCommand = command
            return hostSessionDetail(command.sessionId).copy(visibility = command.visibility)
        }

        override fun open(command: HostSessionIdCommand): HostSessionDetailResponse {
            openCommand = command
            return hostSessionDetail(command.sessionId).copy(state = "OPEN")
        }

        override fun deletionPreview(command: HostSessionIdCommand) =
            HostSessionDeletionPreviewResponse(
                sessionId = command.sessionId.toString(),
                sessionNumber = 7,
                title = "7회차",
                state = "OPEN",
                canDelete = true,
                counts = emptyDeletionCounts(),
            ).also { calls += "deletionPreview:${command.sessionId}" }

        override fun delete(command: HostSessionIdCommand) =
            HostSessionDeletionResponse(
                sessionId = command.sessionId.toString(),
                sessionNumber = 7,
                deleted = true,
                counts = emptyDeletionCounts(),
            ).also { calls += "delete:${command.sessionId}" }

        override fun confirmAttendance(command: ConfirmAttendanceCommand) =
            HostAttendanceResponse(
                sessionId = command.sessionId.toString(),
                count = command.entries.size,
            ).also { calls += "confirmAttendance:${command.sessionId}:${command.entries.size}" }

        override fun upsertPublication(command: UpsertPublicationCommand) =
            HostPublicationResponse(
                sessionId = command.sessionId.toString(),
                publicSummary = command.publicSummary,
                visibility = command.visibility,
            ).also { calls += "upsertPublication:${command.sessionId}:${command.visibility}" }

        override fun dashboard(host: CurrentMember) =
            HostDashboardResult(
                rsvpPending = 2,
                checkinMissing = 1,
                publishPending = 0,
                feedbackPending = 0,
            ).also { calls += "dashboard:${host.email}" }

        override fun upcoming(member: CurrentMember): List<UpcomingSessionItem> {
            upcomingMember = member
            return emptyList()
        }

        private fun hostSessionDetail(sessionId: UUID) = HostSessionDetailResponse(
            sessionId = sessionId.toString(),
            sessionNumber = 7,
            title = "7회차",
            bookTitle = "책",
            bookAuthor = "저자",
            bookLink = null,
            bookImageUrl = null,
            date = "2026-05-20",
            startTime = "20:00",
            endTime = "22:00",
            questionDeadlineAt = "2026-05-19T14:59Z",
            locationLabel = "온라인",
            meetingUrl = null,
            meetingPasscode = null,
            publication = null,
            state = "OPEN",
            attendees = emptyList(),
            feedbackDocument = HostSessionFeedbackDocument(
                uploaded = false,
                fileName = null,
                uploadedAt = null,
            ),
            visibility = SessionRecordVisibility.HOST_ONLY,
        )

        private fun emptyDeletionCounts() = HostSessionDeletionCounts(
            participants = 0,
            rsvpResponses = 0,
            questions = 0,
            checkins = 0,
            oneLineReviews = 0,
            longReviews = 0,
            highlights = 0,
            publications = 0,
            feedbackReports = 0,
            feedbackDocuments = 0,
        )
    }
}
