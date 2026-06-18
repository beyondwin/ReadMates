package com.readmates.sessionclosing.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionclosing.application.model.ClosingChecklistId
import com.readmates.sessionclosing.application.model.ClosingChecklistState
import com.readmates.sessionclosing.application.model.ClosingOverallState
import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
import com.readmates.sessionclosing.application.model.NotificationClosingEvent
import com.readmates.sessionclosing.application.model.NotificationClosingStatus
import com.readmates.sessionclosing.application.model.SessionClosingSnapshot
import com.readmates.sessionclosing.application.port.out.LoadSessionClosingStatusPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

class SessionClosingStatusServiceTest {
    private val sessionId = UUID.fromString("11111111-1111-1111-1111-111111111111")
    private val host = member(role = MembershipRole.HOST)
    private val member = member(role = MembershipRole.MEMBER)
    private val port = FakeLoadSessionClosingStatusPort()
    private val service = SessionClosingStatusService(port)

    @Test
    fun `rejects non host member`() {
        port.snapshot = closedSessionSnapshot()

        assertThrows(AccessDeniedException::class.java) {
            service.getHostSessionClosingStatus(member, sessionId)
        }
    }

    @Test
    fun `open session requires close session as primary action`() {
        port.snapshot =
            closedSessionSnapshot(
                SnapshotFixture(
                    state = "OPEN",
                    summaryPublished = false,
                    highlightCount = 0,
                    oneLinerCount = 0,
                ),
            )

        val status = service.getHostSessionClosingStatus(host, sessionId)

        assertThat(status.overall.state).isEqualTo(ClosingOverallState.IN_PROGRESS)
        assertThat(status.overall.primaryAction).isEqualTo(ClosingPrimaryAction.CLOSE_SESSION)
        assertThat(status.checklist.first { it.id == ClosingChecklistId.SESSION_CLOSED }.state)
            .isEqualTo(ClosingChecklistState.ACTION_REQUIRED)
    }

    @Test
    fun `closed session without record package points to import records`() {
        port.snapshot =
            closedSessionSnapshot(
                SnapshotFixture(
                    state = "CLOSED",
                    summaryPublished = false,
                    highlightCount = 0,
                    oneLinerCount = 0,
                ),
            )

        val status = service.getHostSessionClosingStatus(host, sessionId)

        assertThat(status.overall.state).isEqualTo(ClosingOverallState.IN_PROGRESS)
        assertThat(status.overall.primaryAction).isEqualTo(ClosingPrimaryAction.IMPORT_RECORDS)
        assertThat(status.checklist.first { it.id == ClosingChecklistId.RECORD_PACKAGE_SAVED }.state)
            .isEqualTo(ClosingChecklistState.ACTION_REQUIRED)
    }

    @Test
    fun `invalid feedback document blocks closing`() {
        port.snapshot =
            closedSessionSnapshot(
                SnapshotFixture(feedbackDocumentState = FeedbackDocumentClosingState.INVALID),
            )

        val status = service.getHostSessionClosingStatus(host, sessionId)

        assertThat(status.overall.state).isEqualTo(ClosingOverallState.BLOCKED)
        assertThat(status.checklist.first { it.id == ClosingChecklistId.FEEDBACK_DOCUMENT_READY }.state)
            .isEqualTo(ClosingChecklistState.BLOCKED)
    }

    @Test
    fun `public published session with sent notification is published`() {
        port.snapshot =
            closedSessionSnapshot(
                SnapshotFixture(
                    state = "PUBLISHED",
                    visibility = SessionRecordVisibility.PUBLIC,
                    publicVisible = true,
                    publicRecordHref = "/clubs/reading-sai/sessions/11111111-1111-1111-1111-111111111111",
                    latestNotificationEvent =
                        NotificationClosingEvent(
                            eventType = "FEEDBACK_DOCUMENT_PUBLISHED",
                            status = NotificationClosingStatus.PUBLISHED,
                            createdAt = OffsetDateTime.parse("2026-06-18T10:00:00Z"),
                        ),
                ),
            )

        val status = service.getHostSessionClosingStatus(host, sessionId)

        assertThat(status.overall.state).isEqualTo(ClosingOverallState.PUBLISHED)
        assertThat(status.overall.primaryAction).isEqualTo(ClosingPrimaryAction.REVIEW_PUBLIC_PAGE)
        assertThat(status.evidence.publicRecordHref).isEqualTo("/clubs/reading-sai/sessions/$sessionId")
    }

    private fun closedSessionSnapshot(fixture: SnapshotFixture = SnapshotFixture()) =
        SessionClosingSnapshot(
            sessionId = sessionId,
            sessionNumber = 7,
            bookTitle = "Test Book",
            meetingDate = LocalDate.parse("2026-06-18"),
            state = fixture.state,
            recordVisibility = fixture.visibility,
            summaryPublished = fixture.summaryPublished,
            highlightCount = fixture.highlightCount,
            oneLinerCount = fixture.oneLinerCount,
            feedbackDocumentState = fixture.feedbackDocumentState,
            latestNotificationEvent = fixture.latestNotificationEvent,
            publicVisible = fixture.publicVisible,
            publicRecordHref = fixture.publicRecordHref,
            memberReflectionHref = "/clubs/reading-sai/app/sessions/$sessionId",
        )

    private data class SnapshotFixture(
        val state: String = "CLOSED",
        val visibility: SessionRecordVisibility = SessionRecordVisibility.MEMBER,
        val summaryPublished: Boolean = true,
        val highlightCount: Int = 2,
        val oneLinerCount: Int = 3,
        val feedbackDocumentState: FeedbackDocumentClosingState = FeedbackDocumentClosingState.AVAILABLE,
        val latestNotificationEvent: NotificationClosingEvent? = null,
        val publicVisible: Boolean = false,
        val publicRecordHref: String? = null,
    )

    private fun member(role: MembershipRole) =
        CurrentMember(
            userId = UUID.randomUUID(),
            membershipId = UUID.randomUUID(),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubSlug = "reading-sai",
            email = "host@example.com",
            displayName = "Host",
            accountName = "Host",
            role = role,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private class FakeLoadSessionClosingStatusPort : LoadSessionClosingStatusPort {
        var snapshot: SessionClosingSnapshot? = null

        override fun loadHostSessionClosingSnapshot(
            host: CurrentMember,
            sessionId: UUID,
        ): SessionClosingSnapshot? = snapshot
    }
}
