package com.readmates.session.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.model.CompleteHostActionDecisionCommand
import com.readmates.notification.application.model.HostActionDecisionCommand
import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.HostActionPreview
import com.readmates.notification.application.model.HostActionPreviewCommand
import com.readmates.notification.application.model.HostActionTargetCounts
import com.readmates.notification.application.model.HostConfirmedAction
import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.application.model.PreparedHostActionDecision
import com.readmates.notification.application.model.RecordHostConfirmedNotificationEventCommand
import com.readmates.notification.application.port.`in`.ConfirmHostActionNotificationUseCase
import com.readmates.notification.application.port.`in`.RecordHostConfirmedNotificationEventUseCase
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.notification.application.port.out.StoredHostActionDecision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostAttendanceAuditTransition
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.HostSessionBasicAuditSnapshot
import com.readmates.session.application.HostSessionDeletionCounts
import com.readmates.session.application.HostSessionDeletionPreviewResponse
import com.readmates.session.application.HostSessionDeletionResponse
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionFeedbackDocument
import com.readmates.session.application.HostSessionListPage
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.HostSessionListSummary
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.PreviewHostSessionVisibilityCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.out.HostSessionAttendancePort
import com.readmates.session.application.port.out.HostSessionAuditPort
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionLifecyclePort
import com.readmates.session.application.port.out.HostSessionPublicationPort
import com.readmates.session.application.port.out.HostSessionQueryPort
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.session.application.port.out.HostSessionVisibilityUpdateResult
import com.readmates.sessionrecord.config.HostActionConfirmationProperties
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

class HostSessionServicesTest {
    private val host =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubSlug = "reading-sai",
            email = "host@example.com",
            displayName = "호스트",
            accountName = "김호스트",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

    @Test
    fun `delegates create to host draft port`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionDraftCommandService(port)
        val command = hostSessionCommand()

        val result = service.create(command)

        assertEquals(command.title, result.title)
        assertEquals("create:${command.title}", port.calls.single())
    }

    @Test
    fun `service delegates host session list`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionQueryService(port)

        service.list(host, PageRequest.cursor(null, null, defaultLimit = 50, maxLimit = 100))

        assertEquals(host, port.listHost)
    }

    @Test
    fun `service delegates visibility update`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionLifecycleService(port, port, port)
        val command = UpdateHostSessionVisibilityCommand(host, UUID.randomUUID(), SessionRecordVisibility.MEMBER)

        service.updateVisibility(command)

        assertEquals(command, port.visibilityCommand)
    }

    @Test
    fun `safe default keeps closed session legacy visibility compatibility`() {
        val port =
            RecordingHostSessionPorts().apply {
                visibilityState = "CLOSED"
                currentVisibility = SessionRecordVisibility.MEMBER
            }
        val service = HostSessionLifecycleService(port, port, port)

        service.updateVisibility(
            UpdateHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.PUBLIC),
        )

        assertThat(port.visibilityCommand?.visibility).isEqualTo(SessionRecordVisibility.PUBLIC)
    }

    @Test
    fun `required rollout stages closed session legacy visibility changes`() {
        val port =
            RecordingHostSessionPorts().apply {
                visibilityState = "CLOSED"
                currentVisibility = SessionRecordVisibility.MEMBER
            }
        val service =
            HostSessionLifecycleService(
                port,
                port,
                port,
                confirmationProperties = HostActionConfirmationProperties(required = true),
            )

        assertThrows(HostSessionRecordStagingRequiredException::class.java) {
            service.updateVisibility(
                UpdateHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.PUBLIC),
            )
        }
        assertThat(port.visibilityCommand).isNull()
    }

    @Test
    fun `required rollout keeps non historical visibility updates compatible`() {
        val port =
            RecordingHostSessionPorts().apply {
                visibilityState = "OPEN"
                currentVisibility = SessionRecordVisibility.HOST_ONLY
            }
        val service =
            HostSessionLifecycleService(
                port,
                port,
                port,
                confirmationProperties = HostActionConfirmationProperties(required = true),
            )

        service.updateVisibility(
            UpdateHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.HOST_ONLY),
        )

        assertThat(port.visibilityCommand?.visibility).isEqualTo(SessionRecordVisibility.HOST_ONLY)
    }

    @Test
    fun `required next book publication rejects missing decision before visibility mutation`() {
        val port =
            RecordingHostSessionPorts().apply {
                visibilityState = "DRAFT"
                currentVisibility = SessionRecordVisibility.HOST_ONLY
            }
        val service =
            HostSessionLifecycleService(
                port,
                port,
                port,
                confirmationProperties = HostActionConfirmationProperties(required = true),
            )

        val error =
            assertThrows(HostActionNotificationException::class.java) {
                service.updateVisibility(
                    UpdateHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.MEMBER),
                )
            }

        assertThat(error.error).isEqualTo(HostActionNotificationError.CONFIRMATION_REQUIRED)
        assertThat(port.visibilityCommand).isNull()
    }

    @Test
    fun `safe default preserves legacy next book publication behavior`() {
        val port =
            RecordingHostSessionPorts().apply {
                visibilityState = "DRAFT"
                currentVisibility = SessionRecordVisibility.HOST_ONLY
            }
        val legacyRecorder = RecordingLegacyNotificationRecorder()
        val service =
            HostSessionLifecycleService(
                port,
                port,
                port,
                recordNotificationEventUseCase = legacyRecorder,
            )

        service.updateVisibility(
            UpdateHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.MEMBER),
        )

        assertThat(legacyRecorder.nextBookSessions).containsExactly(sessionId)
    }

    @Test
    fun `required next book publication previews and completes explicit send`() {
        val port =
            RecordingHostSessionPorts().apply {
                visibilityState = "DRAFT"
                currentVisibility = SessionRecordVisibility.HOST_ONLY
            }
        val gate = RecordingHostActionGate(host)
        val recorder = RecordingConfirmedEventRecorder()
        val service =
            HostSessionLifecycleService(
                port,
                port,
                port,
                notificationGate = gate,
                confirmedEventRecorder = recorder,
                confirmationProperties = HostActionConfirmationProperties(required = true),
            )

        val preview =
            service.previewVisibility(
                PreviewHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.MEMBER),
            )
        val result =
            service.updateVisibility(
                UpdateHostSessionVisibilityCommand(
                    host,
                    sessionId,
                    SessionRecordVisibility.MEMBER,
                    preview.previewId,
                    NotificationDecision.SEND,
                ),
            )

        assertThat(result.visibility).isEqualTo(SessionRecordVisibility.MEMBER)
        assertThat(gate.prepared).hasSize(1)
        assertThat(gate.completed).hasSize(1)
        assertThat(recorder.commands).hasSize(1)
        assertThat(recorder.commands.single().eventType).isEqualTo(NotificationEventType.NEXT_BOOK_PUBLISHED)
    }

    @Test
    fun `required next book publication skip records decision without event and replays idempotently`() {
        val port =
            RecordingHostSessionPorts().apply {
                visibilityState = "DRAFT"
                currentVisibility = SessionRecordVisibility.HOST_ONLY
            }
        val gate = RecordingHostActionGate(host)
        val recorder = RecordingConfirmedEventRecorder()
        val service =
            HostSessionLifecycleService(
                port,
                port,
                port,
                notificationGate = gate,
                confirmedEventRecorder = recorder,
                confirmationProperties = HostActionConfirmationProperties(required = true),
            )
        val preview =
            service.previewVisibility(
                PreviewHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.PUBLIC),
            )
        val command =
            UpdateHostSessionVisibilityCommand(
                host,
                sessionId,
                SessionRecordVisibility.PUBLIC,
                preview.previewId,
                NotificationDecision.SKIP,
            )

        service.updateVisibility(command)
        gate.completedDecision = gate.lastDecision
        val replayed = service.updateVisibility(command)

        assertThat(gate.completed).hasSize(1)
        assertThat(recorder.commands).isEmpty()
        assertThat(port.visibilityUpdateCount).isEqualTo(1)
        assertThat(replayed.visibility).isEqualTo(SessionRecordVisibility.PUBLIC)
        val mismatchedReplay =
            assertThrows(HostActionNotificationException::class.java) {
                service.updateVisibility(command.copy(visibility = SessionRecordVisibility.MEMBER))
            }
        assertThat(mismatchedReplay.error).isEqualTo(HostActionNotificationError.PREVIEW_ALREADY_CONSUMED)
        assertThat(port.visibilityUpdateCount).isEqualTo(1)
    }

    @Test
    fun `consumed visibility replay rejects intervening content without another write`() {
        val port =
            RecordingHostSessionPorts().apply {
                visibilityState = "DRAFT"
                currentVisibility = SessionRecordVisibility.HOST_ONLY
            }
        val gate = RecordingHostActionGate(host)
        val service =
            HostSessionLifecycleService(
                port,
                port,
                port,
                notificationGate = gate,
                confirmedEventRecorder = RecordingConfirmedEventRecorder(),
                confirmationProperties = HostActionConfirmationProperties(required = true),
            )
        val preview =
            service.previewVisibility(
                PreviewHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.MEMBER),
            )
        val command =
            UpdateHostSessionVisibilityCommand(
                host,
                sessionId,
                SessionRecordVisibility.MEMBER,
                preview.previewId,
                NotificationDecision.SKIP,
            )
        service.updateVisibility(command)
        gate.completedDecision = gate.lastDecision
        port.visibilityUpdatedAt = port.visibilityUpdatedAt.plusSeconds(1)

        val error =
            assertThrows(HostActionNotificationException::class.java) {
                service.updateVisibility(command)
            }

        assertThat(error.error).isEqualTo(HostActionNotificationError.PREVIEW_ALREADY_CONSUMED)
        assertThat(port.visibilityUpdateCount).isEqualTo(1)
    }

    @Test
    fun `visibility apply revalidates locked preview payload before mutation`() {
        val port =
            RecordingHostSessionPorts().apply {
                visibilityState = "DRAFT"
                currentVisibility = SessionRecordVisibility.HOST_ONLY
            }
        val gate = RecordingHostActionGate(host)
        val service =
            HostSessionLifecycleService(
                port,
                port,
                port,
                notificationGate = gate,
                confirmedEventRecorder = RecordingConfirmedEventRecorder(),
                confirmationProperties = HostActionConfirmationProperties(required = true),
            )
        val preview =
            service.previewVisibility(
                PreviewHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.MEMBER),
            )
        port.visibilityBookTitle = "Changed notification payload"

        val error =
            assertThrows(HostActionNotificationException::class.java) {
                service.updateVisibility(
                    UpdateHostSessionVisibilityCommand(
                        host,
                        sessionId,
                        SessionRecordVisibility.MEMBER,
                        preview.previewId,
                        NotificationDecision.SEND,
                    ),
                )
            }

        assertThat(error.error).isEqualTo(HostActionNotificationError.PREVIEW_MISMATCH)
        assertThat(port.visibilityUpdateCount).isZero()
        assertThat(port.visibilityLockCount).isEqualTo(2)
    }

    @Test
    fun `service delegates open transition`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionLifecycleService(port, port, port)
        val command = HostSessionIdCommand(host, UUID.randomUUID())

        service.open(command)

        assertEquals(command, port.openCommand)
    }

    @Test
    fun `service delegates close transition`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionLifecycleService(port, port, port)
        val command = HostSessionIdCommand(host, UUID.randomUUID())

        service.close(command)

        assertEquals(command, port.closeCommand)
    }

    @Test
    fun `service delegates publish transition`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionLifecycleService(port, port, port)
        val command = HostSessionIdCommand(host, UUID.randomUUID())

        service.publish(command)

        assertEquals(command, port.publishCommand)
    }

    @Test
    fun `service delegates upcoming sessions`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionQueryService(port)

        service.upcoming(host)

        assertEquals(host, port.upcomingMember)
    }

    @Test
    fun `delegates attendance confirmation to host attendance port`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionAttendanceService(port)
        val command =
            ConfirmAttendanceCommand(
                host = host,
                sessionId = sessionId,
                entries = listOf(AttendanceEntryCommand("membership-1", "ATTENDED")),
            )

        val result = service.confirmAttendance(command)

        assertEquals(1, result.count)
        assertEquals("confirmAttendance:$sessionId:1", port.calls.single())
    }

    @Test
    fun `basic update audit records allowlisted field names without credential values`() {
        val port = RecordingHostSessionPorts()
        val before = basicAuditSnapshot()
        port.basicSnapshots += before
        port.basicSnapshots +=
            before.copy(
                title = "수정된 회차",
                meetingUrl = "https://changed.invalid/private",
                meetingPasscode = "changed-private-value",
            )
        val service = HostSessionDraftCommandService(port, port)

        service.update(UpdateHostSessionCommand(host, sessionId, hostSessionCommand()))

        assertThat(port.basicAuditFields).containsExactlyInAnyOrder("meetingPasscode", "meetingUrl", "title")
        assertThat(port.basicAuditFields.joinToString())
            .doesNotContain("changed.invalid")
            .doesNotContain("changed-private-value")
    }

    @Test
    fun `attendance audit records membership id and changed state only`() {
        val port = RecordingHostSessionPorts()
        val membershipId = UUID.fromString("00000000-0000-0000-0000-000000000401")
        port.attendanceStates = mapOf(membershipId to "ABSENT")
        val service = HostSessionAttendanceService(port, port)
        val command =
            ConfirmAttendanceCommand(
                host = host,
                sessionId = sessionId,
                entries = listOf(AttendanceEntryCommand(membershipId.toString(), "ATTENDED")),
            )

        service.confirmAttendance(command)

        assertThat(port.attendanceAuditTransitions)
            .containsExactly(HostAttendanceAuditTransition(membershipId.toString(), "ABSENT", "ATTENDED"))
    }

    @Test
    fun `delegates dashboard query to host query port`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionQueryService(port)

        val result = service.dashboard(host)

        assertEquals(2, result.rsvpPending)
        assertEquals("dashboard:${host.email}", port.calls.single())
    }

    @Test
    fun `evicts club content after publication update`() {
        val port = RecordingHostSessionPorts()
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = HostSessionPublicationService(port, invalidation)
        val command =
            UpsertPublicationCommand(
                host = host,
                sessionId = sessionId,
                publicSummary = "요약",
                visibility = SessionRecordVisibility.PUBLIC,
            )

        service.upsertPublication(command)

        assertEquals(listOf(host.clubId), invalidation.clubs)
    }

    @Test
    fun `evicts host mutation after commit when transaction synchronization is active`() {
        val port = RecordingHostSessionPorts()
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = HostSessionPublicationService(port, invalidation)
        val command =
            UpsertPublicationCommand(
                host = host,
                sessionId = sessionId,
                publicSummary = "요약",
                visibility = SessionRecordVisibility.PUBLIC,
            )

        TransactionSynchronizationManager.initSynchronization()
        try {
            service.upsertPublication(command)

            assertEquals(emptyList<UUID>(), invalidation.clubs)

            TransactionSynchronizationManager.getSynchronizations().forEach { synchronization ->
                synchronization.afterCommit()
            }

            assertEquals(listOf(host.clubId), invalidation.clubs)
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
        }
    }

    @Test
    fun `invalidation failure does not fail host mutation`() {
        val port = RecordingHostSessionPorts()
        val invalidation = ThrowingReadCacheInvalidationPort()
        val service = HostSessionPublicationService(port, invalidation)
        val command =
            UpsertPublicationCommand(
                host = host,
                sessionId = sessionId,
                publicSummary = "요약",
                visibility = SessionRecordVisibility.PUBLIC,
            )

        var result: HostPublicationResponse? = null
        assertDoesNotThrow {
            service
                .upsertPublication(command)
                .also { result = it }
        }

        assertEquals(SessionRecordVisibility.PUBLIC, result?.visibility)
        assertEquals(1, invalidation.attempts)
    }

    @Test
    fun `does not evict when host write port throws`() {
        val port =
            RecordingHostSessionPorts().apply {
                throwOnUpsertPublication = true
            }
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = HostSessionPublicationService(port, invalidation)
        val command =
            UpsertPublicationCommand(
                host = host,
                sessionId = sessionId,
                publicSummary = "요약",
                visibility = SessionRecordVisibility.PUBLIC,
            )

        assertThrows(IllegalStateException::class.java) {
            service.upsertPublication(command)
        }

        assertEquals(emptyList<UUID>(), invalidation.clubs)
    }

    @Test
    fun `does not evict when current session transitions are no-ops`() {
        val port =
            RecordingHostSessionPorts().apply {
                openChanged = false
                closeChanged = false
                publishChanged = false
            }
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = HostSessionLifecycleService(port, port, port, invalidation)
        val command = HostSessionIdCommand(host, sessionId)

        service.open(command)
        service.close(command)
        service.publish(command)

        assertEquals(emptyList<UUID>(), invalidation.clubs)
    }

    @Test
    fun `changed lifecycle transitions log club session and states only`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionLifecycleService(port, port, port)
        val command = HostSessionIdCommand(host, sessionId)

        captureHostSessionLogs().use { logs ->
            service.open(command)
            service.close(command)
            service.publish(command)

            assertThat(logs.events.map { it.level }).containsExactly(Level.INFO, Level.INFO, Level.INFO)
            assertThat(logs.events.map { it.message }).containsExactly(
                "Session state changed clubId={} sessionId={} oldState={} newState={}",
                "Session state changed clubId={} sessionId={} oldState={} newState={}",
                "Session state changed clubId={} sessionId={} oldState={} newState={}",
            )
            assertThat(logs.events.map { it.argumentArray.toList() }).containsExactly(
                listOf(host.clubId, sessionId, "DRAFT", "OPEN"),
                listOf(host.clubId, sessionId, "OPEN", "CLOSED"),
                listOf(host.clubId, sessionId, "CLOSED", "PUBLISHED"),
            )
            assertThat(logs.events.map { it.formattedMessage }.joinToString("\n"))
                .doesNotContain(host.email)
                .doesNotContain(host.displayName)
        }
    }

    @Test
    fun `no-op lifecycle transitions do not log state changes`() {
        val port =
            RecordingHostSessionPorts().apply {
                openChanged = false
                closeChanged = false
                publishChanged = false
            }
        val service = HostSessionLifecycleService(port, port, port)
        val command = HostSessionIdCommand(host, sessionId)

        captureHostSessionLogs().use { logs ->
            service.open(command)
            service.close(command)
            service.publish(command)

            assertThat(logs.events).isEmpty()
        }
    }

    private fun hostSessionCommand() =
        HostSessionCommand(
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

    private fun basicAuditSnapshot() =
        HostSessionBasicAuditSnapshot(
            title = "7회차",
            bookTitle = "책",
            bookAuthor = "저자",
            bookLink = null,
            bookImageUrl = null,
            date = "2026-05-20",
            startTime = "19:30",
            endTime = "21:30",
            questionDeadlineAt = "2026-05-19T14:59Z",
            locationLabel = "온라인",
            meetingUrl = "https://original.invalid/private",
            meetingPasscode = "original-private-value",
        )

    private class RecordingHostSessionPorts :
        HostSessionQueryPort,
        HostSessionDraftPort,
        HostSessionLifecyclePort,
        HostSessionDeletionPort,
        HostSessionAttendancePort,
        HostSessionAuditPort,
        HostSessionPublicationPort {
        val calls = mutableListOf<String>()
        var listHost: CurrentMember? = null
        var visibilityCommand: UpdateHostSessionVisibilityCommand? = null
        var openCommand: HostSessionIdCommand? = null
        var closeCommand: HostSessionIdCommand? = null
        var publishCommand: HostSessionIdCommand? = null
        var upcomingMember: CurrentMember? = null
        var openChanged = true
        var closeChanged = true
        var publishChanged = true
        var throwOnUpsertPublication = false
        var visibilityState = "OPEN"
        var currentVisibility = SessionRecordVisibility.HOST_ONLY
        var visibilityBookTitle = "테스트 책"
        var visibilityUpdatedAt = OffsetDateTime.parse("2026-07-23T10:00:00Z")
        var visibilityUpdateCount = 0
        var visibilityLockCount = 0
        val basicSnapshots = ArrayDeque<HostSessionBasicAuditSnapshot>()
        var basicAuditFields: Set<String> = emptySet()
        var attendanceStates: Map<UUID, String> = emptyMap()
        var attendanceAuditTransitions: List<HostAttendanceAuditTransition> = emptyList()

        override fun list(
            host: CurrentMember,
            pageRequest: PageRequest,
            query: HostSessionListQuery,
        ): HostSessionListPage {
            listHost = host
            return HostSessionListPage(
                items = emptyList(),
                nextCursor = null,
                summary = HostSessionListSummary(0, 0, 0),
            )
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

        override fun loadBasicSnapshot(
            host: CurrentMember,
            sessionId: UUID,
        ): HostSessionBasicAuditSnapshot? = basicSnapshots.removeFirstOrNull()

        override fun loadAttendanceStates(
            host: CurrentMember,
            sessionId: UUID,
            membershipIds: Set<UUID>,
        ): Map<UUID, String> = attendanceStates.filterKeys { it in membershipIds }

        override fun recordBasicUpdate(
            host: CurrentMember,
            sessionId: UUID,
            changedFields: Set<String>,
        ) {
            basicAuditFields = changedFields
        }

        override fun recordAttendanceUpdate(
            host: CurrentMember,
            sessionId: UUID,
            transitions: List<HostAttendanceAuditTransition>,
        ) {
            attendanceAuditTransitions = transitions
        }

        override fun detail(command: HostSessionIdCommand) =
            hostSessionDetail(command.sessionId).also { calls += "detail:${command.sessionId}" }

        override fun update(command: UpdateHostSessionCommand) =
            hostSessionDetail(command.sessionId).also { calls += "update:${command.sessionId}:${command.session.title}" }

        override fun lockVisibilitySnapshot(command: HostSessionIdCommand): HostSessionVisibilitySnapshot {
            visibilityLockCount += 1
            return HostSessionVisibilitySnapshot(
                detail =
                    hostSessionDetail(command.sessionId).copy(
                        state = visibilityState,
                        visibility = currentVisibility,
                        bookTitle = visibilityBookTitle,
                    ),
                contentUpdatedAt = visibilityUpdatedAt,
            )
        }

        override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionVisibilityUpdateResult {
            visibilityCommand = command
            visibilityUpdateCount += 1
            val previous = currentVisibility
            currentVisibility = command.visibility
            visibilityUpdatedAt = visibilityUpdatedAt.plusNanos(1_000)
            return HostSessionVisibilityUpdateResult(
                previousVisibility = previous,
                detail =
                    hostSessionDetail(command.sessionId).copy(
                        state = visibilityState,
                        visibility = command.visibility,
                        bookTitle = visibilityBookTitle,
                    ),
            )
        }

        override fun open(command: HostSessionIdCommand): HostSessionTransitionResult {
            openCommand = command
            return HostSessionTransitionResult(
                detail = hostSessionDetail(command.sessionId).copy(state = "OPEN"),
                changed = openChanged,
            )
        }

        override fun close(command: HostSessionIdCommand): HostSessionTransitionResult {
            closeCommand = command
            return HostSessionTransitionResult(
                detail = hostSessionDetail(command.sessionId).copy(state = "CLOSED"),
                changed = closeChanged,
            )
        }

        override fun publish(command: HostSessionIdCommand): HostSessionTransitionResult {
            publishCommand = command
            return HostSessionTransitionResult(
                detail = hostSessionDetail(command.sessionId).copy(state = "PUBLISHED"),
                changed = publishChanged,
            )
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

        override fun upsertPublication(command: UpsertPublicationCommand): HostPublicationResponse {
            if (throwOnUpsertPublication) {
                throw IllegalStateException("write failed")
            }
            return HostPublicationResponse(
                sessionId = command.sessionId.toString(),
                publicSummary = command.publicSummary,
                visibility = command.visibility,
            ).also { calls += "upsertPublication:${command.sessionId}:${command.visibility}" }
        }

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

        private fun hostSessionDetail(sessionId: UUID) =
            HostSessionDetailResponse(
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
                feedbackDocument =
                    HostSessionFeedbackDocument(
                        uploaded = false,
                        fileName = null,
                        uploadedAt = null,
                    ),
                visibility = SessionRecordVisibility.HOST_ONLY,
            )

        private fun emptyDeletionCounts() =
            HostSessionDeletionCounts(
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

    private class RecordingReadCacheInvalidationPort : ReadCacheInvalidationPort {
        val clubs = mutableListOf<UUID>()

        override fun evictClubContent(clubId: UUID) {
            clubs += clubId
        }
    }

    private class RecordingHostActionGate(
        private val host: CurrentMember,
    ) : ConfirmHostActionNotificationUseCase {
        private val now = OffsetDateTime.parse("2026-07-23T10:00:00Z")
        private val previewId = UUID.fromString("00000000-0000-0000-0000-000000008001")
        var previewCommand: HostActionPreviewCommand? = null
        val prepared = mutableListOf<HostActionDecisionCommand>()
        val completed = mutableListOf<CompleteHostActionDecisionCommand>()
        var completedDecision: StoredHostActionDecision? = null
        var lastDecision: StoredHostActionDecision? = null

        override fun preview(
            host: CurrentMember,
            command: HostActionPreviewCommand,
        ): HostActionPreview {
            previewCommand = command
            return HostActionPreview(
                previewId,
                2,
                2,
                1,
                0,
                now.plusMinutes(5),
            )
        }

        override fun prepare(
            host: CurrentMember,
            command: HostActionDecisionCommand,
        ): PreparedHostActionDecision {
            prepared += command
            val preview = requireNotNull(previewCommand)
            if (preview.expectedLiveRevision != command.expectedLiveRevision ||
                preview.requestHash != command.requestHash
            ) {
                throw HostActionNotificationException(HostActionNotificationError.PREVIEW_MISMATCH)
            }
            return PreparedHostActionDecision(
                command.previewId,
                host.clubId,
                command.sessionId,
                host.membershipId,
                HostConfirmedAction.NEXT_BOOK_PUBLISH,
                NotificationEventType.NEXT_BOOK_PUBLISHED,
                command.decision,
                HostActionTargetCounts(2, 2, 1, 0),
            )
        }

        override fun complete(command: CompleteHostActionDecisionCommand): StoredHostActionDecision {
            completed += command
            return StoredHostActionDecision(
                id = UUID.fromString("00000000-0000-0000-0000-000000008002"),
                previewId = command.prepared.previewId,
                clubId = command.prepared.clubId,
                sessionId = command.prepared.sessionId,
                hostMembershipId = command.prepared.hostMembershipId,
                action = command.prepared.action,
                eventType = command.prepared.eventType,
                liveRevision = command.liveRevision,
                decision = command.prepared.decision,
                counts = command.prepared.counts,
                eventId = command.eventId,
                createdAt = now,
            ).also { lastDecision = it }
        }

        override fun findCompleted(
            host: CurrentMember,
            command: HostActionDecisionCommand,
        ): StoredHostActionDecision? = completedDecision
    }

    private class RecordingConfirmedEventRecorder : RecordHostConfirmedNotificationEventUseCase {
        val commands = mutableListOf<RecordHostConfirmedNotificationEventCommand>()

        override fun record(command: RecordHostConfirmedNotificationEventCommand): UUID {
            commands += command
            return UUID.fromString("00000000-0000-0000-0000-000000008003")
        }
    }

    private class RecordingLegacyNotificationRecorder : RecordNotificationEventUseCase {
        val nextBookSessions = mutableListOf<UUID>()

        override fun recordNextBookPublished(
            clubId: UUID,
            sessionId: UUID,
            sessionNumber: Int,
            bookTitle: String,
        ) {
            nextBookSessions += sessionId
        }

        override fun recordFeedbackDocumentPublished(
            clubId: UUID,
            sessionId: UUID,
            sessionNumber: Int,
            bookTitle: String,
            documentVersion: Int,
        ) = Unit

        override fun recordReviewPublished(
            clubId: UUID,
            sessionId: UUID,
            sessionNumber: Int,
            bookTitle: String,
            authorMembershipId: UUID,
        ) = Unit

        override fun recordSessionReminderDue(targetDate: LocalDate) = Unit

        override fun recordAiGenerationReady(
            jobId: UUID,
            sessionId: UUID,
            clubId: UUID,
            hostUserId: UUID,
        ) = Unit
    }

    private class ThrowingReadCacheInvalidationPort : ReadCacheInvalidationPort {
        var attempts = 0

        override fun evictClubContent(clubId: UUID) {
            attempts += 1
            throw IllegalStateException("invalidation failed")
        }
    }
}

private class HostSessionLogCapture(
    private val logger: Logger,
    private val appender: ListAppender<ILoggingEvent>,
) : AutoCloseable {
    val events: List<ILoggingEvent>
        get() = appender.list

    override fun close() {
        logger.detachAppender(appender)
        appender.stop()
    }
}

private fun captureHostSessionLogs(): HostSessionLogCapture {
    val logger = LoggerFactory.getLogger(HostSessionLifecycleService::class.java) as Logger
    val appender = ListAppender<ILoggingEvent>().apply { start() }
    logger.addAppender(appender)
    return HostSessionLogCapture(logger, appender)
}
