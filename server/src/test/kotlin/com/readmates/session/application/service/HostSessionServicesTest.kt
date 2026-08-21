package com.readmates.session.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.port.`in`.ConfirmHostActionNotificationUseCase
import com.readmates.notification.application.port.`in`.RecordHostConfirmedNotificationEventUseCase
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostAttendanceAuditTransition
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.HostSessionAutomaticScheduleDefaults
import com.readmates.session.application.HostSessionBasicAuditSnapshot
import com.readmates.session.application.HostSessionDeletionAssessment
import com.readmates.session.application.HostSessionDeletionCounts
import com.readmates.session.application.HostSessionDeletionPreviewResponse
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionFeedbackDocument
import com.readmates.session.application.HostSessionListPage
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.HostSessionListSummary
import com.readmates.session.application.HostSessionOpenNotAllowedException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionScheduleDefaults
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionDeletionBlockedException
import com.readmates.session.application.model.HostSessionDeletionBlocker
import com.readmates.session.application.model.HostSessionDeletionBlockerCode
import com.readmates.session.application.model.HostSessionDeletionTarget
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionLifecycleAuditEntry
import com.readmates.session.application.model.HostSessionLifecycleReasonCode
import com.readmates.session.application.model.HostSessionLifecycleReasonRequiredException
import com.readmates.session.application.model.HostSessionReverseCommand
import com.readmates.session.application.model.InvalidHostSessionLifecycleReasonException
import com.readmates.session.application.model.USER_SELECTABLE_LIFECYCLE_REASONS
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.model.hostSessionDeletionBlockers
import com.readmates.session.application.model.normalized
import com.readmates.session.application.port.out.HostSessionAttendancePort
import com.readmates.session.application.port.out.HostSessionAuditPort
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionLifecycleAuditPort
import com.readmates.session.application.port.out.HostSessionLifecyclePort
import com.readmates.session.application.port.out.HostSessionPublicationPort
import com.readmates.session.application.port.out.HostSessionQueryPort
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.session.application.port.out.HostSessionVisibilityUpdateResult
import com.readmates.session.config.HostSessionLifecycleProperties
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.sessionrecord.config.HostActionConfirmationProperties
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.observability.RequestIdFilter
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.transaction.support.TransactionSynchronizationManager
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
    fun `safe default first publication returns composer without notification dispatch`() {
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
            )

        val result =
            service.updateVisibility(
                UpdateHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.MEMBER),
            )

        assertThat(result.session.visibility).isEqualTo(SessionRecordVisibility.MEMBER)
        assertThat(result.composer?.eventType).isEqualTo(NotificationEventType.NEXT_BOOK_PUBLISHED)
        assertLifecycleHasNoNotificationDispatchCollaborator()
    }

    @Test
    fun `required first publication returns composer without notification dispatch`() {
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

        val result =
            service.updateVisibility(
                UpdateHostSessionVisibilityCommand(host, sessionId, SessionRecordVisibility.MEMBER),
            )

        assertThat(result.session.visibility).isEqualTo(SessionRecordVisibility.MEMBER)
        assertThat(result.composer?.eventType).isEqualTo(NotificationEventType.NEXT_BOOK_PUBLISHED)
        assertLifecycleHasNoNotificationDispatchCollaborator()
    }

    @Test
    fun `canonical first guest publication returns composer without notification dispatch`() {
        val port =
            RecordingHostSessionPorts().apply {
                visibilityState = "DRAFT"
                currentVisibility = SessionRecordVisibility.HOST_ONLY
                currentAccessScope = SessionAccessScope.HOST_ONLY
            }
        val service = HostSessionLifecycleService(port, port, port)

        val result =
            service.updateVisibility(
                UpdateHostSessionVisibilityCommand(
                    host = host,
                    sessionId = sessionId,
                    accessScope = SessionAccessScope.GUEST_READABLE,
                ),
            )

        assertThat(result.session.accessScope).isEqualTo(SessionAccessScope.GUEST_READABLE)
        assertThat(result.composer?.eventType).isEqualTo(NotificationEventType.NEXT_BOOK_PUBLISHED)
        assertLifecycleHasNoNotificationDispatchCollaborator()
    }

    @Test
    fun `canonical non first guest access changes do not fabricate composer`() {
        listOf(
            Triple(SessionAccessScope.GUEST_READABLE, SessionAccessScope.HOST_ONLY, "DRAFT"),
            Triple(SessionAccessScope.HOST_ONLY, SessionAccessScope.HOST_ONLY, "DRAFT"),
            Triple(SessionAccessScope.GUEST_READABLE, SessionAccessScope.GUEST_READABLE, "DRAFT"),
            Triple(SessionAccessScope.HOST_ONLY, SessionAccessScope.GUEST_READABLE, "OPEN"),
        ).forEach { (currentAccessScope, requestedAccessScope, state) ->
            val port =
                RecordingHostSessionPorts().apply {
                    visibilityState = state
                    currentVisibility =
                        if (currentAccessScope == SessionAccessScope.GUEST_READABLE) {
                            SessionRecordVisibility.MEMBER
                        } else {
                            SessionRecordVisibility.HOST_ONLY
                        }
                    this.currentAccessScope = currentAccessScope
                }
            val service = HostSessionLifecycleService(port, port, port)

            val result =
                service.updateVisibility(
                    UpdateHostSessionVisibilityCommand(
                        host = host,
                        sessionId = sessionId,
                        accessScope = requestedAccessScope,
                    ),
                )

            assertThat(result.composer)
                .describedAs("$state $currentAccessScope -> $requestedAccessScope")
                .isNull()
        }
        assertLifecycleHasNoNotificationDispatchCollaborator()
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
    fun `schedule defaults requires host and delegates to query port`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionQueryService(port)

        val result = service.scheduleDefaults(host)

        assertEquals(host, port.scheduleDefaultsHost)
        assertEquals("20:00", result.automatic.startTime)
        assertEquals("22:00", result.automatic.endTime)
    }

    @Test
    fun `schedule defaults rejects non-host`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionQueryService(port)

        assertThrows(AccessDeniedException::class.java) {
            service.scheduleDefaults(host.copy(role = MembershipRole.MEMBER))
        }
        assertEquals(null, port.scheduleDefaultsHost)
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
    fun `create guest readable draft attaches next-book composer`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionDraftCommandService(port)

        val result = service.create(hostSessionCommand().copy(accessScope = SessionAccessScope.GUEST_READABLE))

        assertThat(result.accessScope).isEqualTo(SessionAccessScope.GUEST_READABLE)
        assertThat(result.visibility).isEqualTo(SessionRecordVisibility.MEMBER)
        assertThat(result.composer).isNotNull()
        assertThat(result.composer?.eventType).isEqualTo(NotificationEventType.NEXT_BOOK_PUBLISHED)
        assertThat(result.composer?.sessionId.toString()).isEqualTo(result.sessionId)
        assertThat(result.composer?.contentRevision).isNotBlank()
        assertThat(port.calls).containsExactly("create:7회차")
    }

    @Test
    fun `create host-only draft does not attach composer`() {
        val port = RecordingHostSessionPorts()
        val service = HostSessionDraftCommandService(port)

        val result = service.create(hostSessionCommand())

        assertThat(result.accessScope).isEqualTo(SessionAccessScope.HOST_ONLY)
        assertThat(result.composer).isNull()
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
    fun `post commit invalidation failure does not fail the completed host mutation`() {
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
        TransactionSynchronizationManager.initSynchronization()
        try {
            assertDoesNotThrow {
                service
                    .upsertPublication(command)
                    .also { result = it }
            }

            assertEquals(SessionRecordVisibility.PUBLIC, result?.visibility)
            assertEquals(0, invalidation.attempts)

            assertDoesNotThrow {
                TransactionSynchronizationManager.getSynchronizations().forEach { synchronization ->
                    synchronization.afterCommit()
                }
            }

            assertEquals(SessionRecordVisibility.PUBLIC, result?.visibility)
            assertEquals(1, invalidation.attempts)
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
        }
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
    fun `duplicate lifecycle replays return stable results without second write cache eviction or audit transition`() {
        val port =
            RecordingHostSessionPorts().apply {
                openChanged = false
                closeChanged = false
                publishChanged = false
            }
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = HostSessionLifecycleService(port, port, port, invalidation)
        val command = HostSessionIdCommand(host, sessionId)

        captureHostSessionLogs().use { logs ->
            val opened = service.open(command)
            val closed = service.close(command)
            val published = service.publish(command)

            assertThat(opened.state).isEqualTo("OPEN")
            assertThat(closed.state).isEqualTo("CLOSED")
            assertThat(published.state).isEqualTo("PUBLISHED")
            assertThat(port.lifecycleStateWriteCount).isZero()
            assertThat(invalidation.clubs).isEmpty()
            assertThat(logs.events).isEmpty()
            assertLifecycleHasNoNotificationDispatchCollaborator()
        }
    }

    @Test
    fun `forbidden lifecycle transition propagates error without write cache eviction or audit transition`() {
        val failure = HostSessionOpenNotAllowedException()
        val port =
            RecordingHostSessionPorts().apply {
                openFailure = failure
            }
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = HostSessionLifecycleService(port, port, port, invalidation)

        captureHostSessionLogs().use { logs ->
            val thrown =
                assertThrows(HostSessionOpenNotAllowedException::class.java) {
                    service.open(HostSessionIdCommand(host, sessionId))
                }

            assertThat(thrown).isSameAs(failure)
            assertThat(port.lifecycleStateWriteCount).isZero()
            assertThat(invalidation.clubs).isEmpty()
            assertThat(logs.events.single().level).isEqualTo(Level.WARN)
            assertThat(logs.events.single().message)
                .isEqualTo("Session lifecycle action={} outcome=failure requestId={} clubId={} sessionId={}")
            assertThat(
                logs.events
                    .single()
                    .argumentArray
                    .toList(),
            ).containsExactly(HostSessionLifecycleAction.OPENED, null, host.clubId, sessionId)
            assertThat(
                logs.events
                    .single()
                    .throwableProxy
                    ?.className,
            ).isEqualTo(HostSessionOpenNotAllowedException::class.java.name)
            assertLifecycleHasNoNotificationDispatchCollaborator()
        }
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
                "Session lifecycle action={} outcome={} requestId={} clubId={} sessionId={} fromState={} toState={}",
                "Session lifecycle action={} outcome={} requestId={} clubId={} sessionId={} fromState={} toState={}",
                "Session lifecycle action={} outcome={} requestId={} clubId={} sessionId={} fromState={} toState={}",
            )
            assertThat(logs.events.map { it.argumentArray.toList() }).containsExactly(
                listOf(HostSessionLifecycleAction.OPENED, "changed", null, host.clubId, sessionId, "DRAFT", "OPEN"),
                listOf(HostSessionLifecycleAction.CLOSED, "changed", null, host.clubId, sessionId, "OPEN", "CLOSED"),
                listOf(
                    HostSessionLifecycleAction.PUBLISHED,
                    "changed",
                    null,
                    host.clubId,
                    sessionId,
                    "CLOSED",
                    "PUBLISHED",
                ),
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

    @Test
    fun `changed reverse transitions evict cache and log states`() {
        val harness = lifecycleHarness()
        val command = reverseCommand()
        captureHostSessionLogs().use { logs ->
            assertThat(harness.service.reopen(command).state).isEqualTo("OPEN")
            assertThat(harness.service.unpublish(command).state).isEqualTo("CLOSED")
            assertThat(harness.service.returnToDraft(command).state).isEqualTo("DRAFT")
            assertThat(harness.invalidation.clubs).containsExactly(host.clubId, host.clubId, host.clubId)
            assertThat(logs.events.map { it.argumentArray.toList() }).containsExactly(
                listOf(
                    HostSessionLifecycleAction.REOPENED,
                    "changed",
                    null,
                    host.clubId,
                    sessionId,
                    "CLOSED",
                    "OPEN",
                ),
                listOf(
                    HostSessionLifecycleAction.UNPUBLISHED,
                    "changed",
                    null,
                    host.clubId,
                    sessionId,
                    "PUBLISHED",
                    "CLOSED",
                ),
                listOf(
                    HostSessionLifecycleAction.RETURNED_TO_DRAFT,
                    "changed",
                    null,
                    host.clubId,
                    sessionId,
                    "OPEN",
                    "DRAFT",
                ),
            )
        }
    }

    @Test
    fun `noop reverse transitions do not evict cache`() {
        val harness =
            lifecycleHarness(
                port =
                    RecordingHostSessionPorts().apply {
                        reopenChanged = false
                        unpublishChanged = false
                        returnToDraftChanged = false
                    },
            )
        val command = reverseCommand()
        harness.service.reopen(command)
        harness.service.unpublish(command)
        harness.service.returnToDraft(command)
        assertThat(harness.invalidation.clubs).isEmpty()
        assertThat(harness.audit.entries).isEmpty()
    }

    @Test
    fun `changed forward transitions record one audit row each without reason`() {
        val harness = lifecycleHarness()
        val command = HostSessionIdCommand(host, sessionId)

        harness.service.open(command)
        harness.service.close(command)
        harness.service.publish(command)

        assertThat(harness.audit.entries).hasSize(3)
        assertThat(harness.audit.entries[0])
            .extracting(
                HostSessionLifecycleAuditEntry::action,
                HostSessionLifecycleAuditEntry::fromState,
                HostSessionLifecycleAuditEntry::toState,
                HostSessionLifecycleAuditEntry::reasonCode,
                HostSessionLifecycleAuditEntry::reasonNote,
            ).containsExactly(HostSessionLifecycleAction.OPENED, "DRAFT", "OPEN", null, null)
        assertThat(harness.audit.entries[1])
            .extracting(
                HostSessionLifecycleAuditEntry::action,
                HostSessionLifecycleAuditEntry::fromState,
                HostSessionLifecycleAuditEntry::toState,
                HostSessionLifecycleAuditEntry::reasonCode,
            ).containsExactly(HostSessionLifecycleAction.CLOSED, "OPEN", "CLOSED", null)
        assertThat(harness.audit.entries[2])
            .extracting(
                HostSessionLifecycleAuditEntry::action,
                HostSessionLifecycleAuditEntry::fromState,
                HostSessionLifecycleAuditEntry::toState,
                HostSessionLifecycleAuditEntry::reasonCode,
            ).containsExactly(HostSessionLifecycleAction.PUBLISHED, "CLOSED", "PUBLISHED", null)
        assertThat(harness.transitionCount("OPENED", "changed")).isEqualTo(1.0)
        assertThat(harness.transitionCount("CLOSED", "changed")).isEqualTo(1.0)
        assertThat(harness.transitionCount("PUBLISHED", "changed")).isEqualTo(1.0)
    }

    @Test
    fun `changed reverse transition records selectable reason and trims note`() {
        val harness = lifecycleHarness()
        val command =
            reverseCommand(
                reasonCode = HostSessionLifecycleReasonCode.MEETING_RESCHEDULED,
                reasonNote = "  moved online  ",
            )

        harness.service.reopen(command)

        assertThat(harness.audit.entries.single())
            .extracting(
                HostSessionLifecycleAuditEntry::action,
                HostSessionLifecycleAuditEntry::fromState,
                HostSessionLifecycleAuditEntry::toState,
                HostSessionLifecycleAuditEntry::reasonCode,
                HostSessionLifecycleAuditEntry::reasonNote,
                HostSessionLifecycleAuditEntry::sessionId,
                HostSessionLifecycleAuditEntry::host,
            ).containsExactly(
                HostSessionLifecycleAction.REOPENED,
                "CLOSED",
                "OPEN",
                HostSessionLifecycleReasonCode.MEETING_RESCHEDULED,
                "moved online",
                sessionId,
                host,
            )
        assertThat(harness.port.reopenCommand).isEqualTo(HostSessionIdCommand(host, sessionId))
        assertThat(harness.transitionCount("REOPENED", "changed")).isEqualTo(1.0)
        assertThat(harness.legacyReasonCount()).isZero()
    }

    @Test
    fun `changed reverse actions record one audit row each`() {
        val harness = lifecycleHarness()

        harness.service.reopen(reverseCommand(HostSessionLifecycleReasonCode.ACCIDENTAL_TRANSITION))
        harness.service.unpublish(reverseCommand(HostSessionLifecycleReasonCode.CONTENT_CORRECTION))
        harness.service.returnToDraft(reverseCommand(HostSessionLifecycleReasonCode.OPERATIONAL_RECOVERY))

        assertThat(harness.audit.entries).hasSize(3)
        assertThat(harness.audit.entries[0])
            .extracting(
                HostSessionLifecycleAuditEntry::action,
                HostSessionLifecycleAuditEntry::fromState,
                HostSessionLifecycleAuditEntry::toState,
            ).containsExactly(HostSessionLifecycleAction.REOPENED, "CLOSED", "OPEN")
        assertThat(harness.audit.entries[1])
            .extracting(
                HostSessionLifecycleAuditEntry::action,
                HostSessionLifecycleAuditEntry::fromState,
                HostSessionLifecycleAuditEntry::toState,
                HostSessionLifecycleAuditEntry::reasonCode,
            ).containsExactly(
                HostSessionLifecycleAction.UNPUBLISHED,
                "PUBLISHED",
                "CLOSED",
                HostSessionLifecycleReasonCode.CONTENT_CORRECTION,
            )
        assertThat(harness.audit.entries[2])
            .extracting(
                HostSessionLifecycleAuditEntry::action,
                HostSessionLifecycleAuditEntry::fromState,
                HostSessionLifecycleAuditEntry::toState,
                HostSessionLifecycleAuditEntry::reasonCode,
            ).containsExactly(
                HostSessionLifecycleAction.RETURNED_TO_DRAFT,
                "OPEN",
                "DRAFT",
                HostSessionLifecycleReasonCode.OPERATIONAL_RECOVERY,
            )
    }

    @Test
    fun `unchanged transitions record no audit rows`() {
        val harness =
            lifecycleHarness(
                port =
                    RecordingHostSessionPorts().apply {
                        openChanged = false
                        closeChanged = false
                        publishChanged = false
                        reopenChanged = false
                        unpublishChanged = false
                        returnToDraftChanged = false
                    },
            )

        harness.service.open(HostSessionIdCommand(host, sessionId))
        harness.service.close(HostSessionIdCommand(host, sessionId))
        harness.service.publish(HostSessionIdCommand(host, sessionId))
        harness.service.reopen(reverseCommand())
        harness.service.unpublish(reverseCommand())
        harness.service.returnToDraft(reverseCommand())

        assertThat(harness.audit.entries).isEmpty()
        assertThat(harness.transitionCount("OPENED", "unchanged")).isEqualTo(1.0)
        assertThat(harness.transitionCount("REOPENED", "unchanged")).isEqualTo(1.0)
        assertThat(harness.transitionCount("OPENED", "changed")).isZero()
    }

    @Test
    fun `state write failure records no audit and increments failure`() {
        val failure = HostSessionOpenNotAllowedException()
        val harness =
            lifecycleHarness(
                port = RecordingHostSessionPorts().apply { openFailure = failure },
            )

        val thrown =
            assertThrows(HostSessionOpenNotAllowedException::class.java) {
                harness.service.open(HostSessionIdCommand(host, sessionId))
            }

        assertThat(thrown).isSameAs(failure)
        assertThat(harness.audit.entries).isEmpty()
        assertThat(harness.transitionCount("OPENED", "failure")).isEqualTo(1.0)
        assertThat(harness.transitionCount("OPENED", "changed")).isZero()
        assertThat(harness.invalidation.clubs).isEmpty()
    }

    @Test
    fun `audit write failure records failure metric and does not evict cache`() {
        val failure = IllegalStateException("audit insert failed")
        val harness = lifecycleHarness(auditFailure = failure)

        val thrown =
            assertThrows(IllegalStateException::class.java) {
                harness.service.open(HostSessionIdCommand(host, sessionId))
            }

        assertThat(thrown).isSameAs(failure)
        assertThat(harness.audit.entries).isEmpty()
        assertThat(harness.port.lifecycleStateWriteCount).isEqualTo(1)
        assertThat(harness.invalidation.clubs).isEmpty()
        assertThat(harness.transitionCount("OPENED", "failure")).isEqualTo(1.0)
        assertThat(harness.transitionCount("OPENED", "changed")).isZero()
    }

    @Test
    fun `compatibility reverse missing reason records legacy unspecified and increments metric`() {
        val harness = lifecycleHarness()

        harness.service.reopen(reverseCommand(reasonCode = null))

        assertThat(harness.audit.entries.single())
            .extracting(
                HostSessionLifecycleAuditEntry::action,
                HostSessionLifecycleAuditEntry::fromState,
                HostSessionLifecycleAuditEntry::toState,
                HostSessionLifecycleAuditEntry::reasonCode,
                HostSessionLifecycleAuditEntry::reasonNote,
            ).containsExactly(
                HostSessionLifecycleAction.REOPENED,
                "CLOSED",
                "OPEN",
                HostSessionLifecycleReasonCode.LEGACY_UNSPECIFIED,
                null,
            )
        assertThat(harness.legacyReasonCount()).isEqualTo(1.0)
    }

    @Test
    fun `enforced reverse missing reason throws and records no audit`() {
        val harness = lifecycleHarness(requireReverseReason = true)

        assertThrows(HostSessionLifecycleReasonRequiredException::class.java) {
            harness.service.reopen(reverseCommand(reasonCode = null))
        }

        assertThat(harness.audit.entries).isEmpty()
        assertThat(harness.port.reopenCommand).isNull()
        assertThat(harness.legacyReasonCount()).isZero()
        assertThat(harness.transitionCount("REOPENED", "failure")).isZero()
    }

    @Test
    fun `internal reverse reason selection is rejected`() {
        assertThrows(InvalidHostSessionLifecycleReasonException::class.java) {
            reverseCommand(HostSessionLifecycleReasonCode.LEGACY_UNSPECIFIED).normalized(requireReason = false)
        }
        assertThrows(InvalidHostSessionLifecycleReasonException::class.java) {
            reverseCommand(HostSessionLifecycleReasonCode.EMPTY_SESSION_DELETED).normalized(requireReason = false)
        }

        val harness = lifecycleHarness()
        assertThrows(InvalidHostSessionLifecycleReasonException::class.java) {
            harness.service.unpublish(reverseCommand(HostSessionLifecycleReasonCode.LEGACY_UNSPECIFIED))
        }
        assertThat(harness.audit.entries).isEmpty()
        assertThat(harness.port.unpublishCommand).isNull()
    }

    @Test
    fun `reverse reason notes reject control characters and oversized values`() {
        assertThrows(InvalidHostSessionLifecycleReasonException::class.java) {
            reverseCommand(reasonNote = "ok\u0001").normalized(requireReason = false)
        }
        assertThrows(InvalidHostSessionLifecycleReasonException::class.java) {
            reverseCommand(reasonNote = "line\nbreak").normalized(requireReason = false)
        }
        assertThrows(InvalidHostSessionLifecycleReasonException::class.java) {
            reverseCommand(reasonNote = "a".repeat(501)).normalized(requireReason = false)
        }

        val trimmedBlank =
            reverseCommand(
                reasonCode = HostSessionLifecycleReasonCode.OTHER_OPERATIONAL_REASON,
                reasonNote = "   ",
            ).normalized(requireReason = false)
        assertThat(trimmedBlank.reasonNote).isNull()

        val maxNote =
            reverseCommand(
                reasonCode = HostSessionLifecycleReasonCode.OTHER_OPERATIONAL_REASON,
                reasonNote = "b".repeat(500),
            ).normalized(requireReason = false)
        assertThat(maxNote.reasonNote).hasSize(500)

        val harness = lifecycleHarness()
        assertThrows(InvalidHostSessionLifecycleReasonException::class.java) {
            harness.service.returnToDraft(reverseCommand(reasonNote = "a".repeat(501)))
        }
        assertThat(harness.audit.entries).isEmpty()
    }

    @Test
    fun `deletion blockers keep stable enum order and omit zero counts`() {
        assertThat(HostSessionDeletionBlockerCode.entries).containsExactly(
            HostSessionDeletionBlockerCode.RECORD_REVISION_EXISTS,
            HostSessionDeletionBlockerCode.NOTIFICATION_DECISION_EXISTS,
            HostSessionDeletionBlockerCode.MANUAL_DISPATCH_EXISTS,
            HostSessionDeletionBlockerCode.NOTIFICATION_EVENT_EXISTS,
            HostSessionDeletionBlockerCode.NOTIFICATION_DELIVERY_EXISTS,
            HostSessionDeletionBlockerCode.MEMBER_NOTIFICATION_EXISTS,
        )
        assertThat(
            hostSessionDeletionBlockers(1, 2, 0, 3, 0, 4).map { it.code to it.count },
        ).containsExactly(
            HostSessionDeletionBlockerCode.RECORD_REVISION_EXISTS to 1,
            HostSessionDeletionBlockerCode.NOTIFICATION_DECISION_EXISTS to 2,
            HostSessionDeletionBlockerCode.NOTIFICATION_EVENT_EXISTS to 3,
            HostSessionDeletionBlockerCode.MEMBER_NOTIFICATION_EXISTS to 4,
        )
        assertThat(hostSessionDeletionBlockers(0, 0, 0, 0, 0, 0)).isEmpty()
        assertThat(HostSessionDeletionBlockedException(emptyList()).blockers).isEmpty()
        assertThat(
            HostSessionDeletionTarget(sessionId, 7, "7회차", "OPEN"),
        ).extracting(
            HostSessionDeletionTarget::sessionId,
            HostSessionDeletionTarget::state,
        ).containsExactly(sessionId, "OPEN")
        assertThat(HostSessionDeletionBlocker(HostSessionDeletionBlockerCode.MANUAL_DISPATCH_EXISTS, 1))
            .extracting(HostSessionDeletionBlocker::code, HostSessionDeletionBlocker::count)
            .containsExactly(HostSessionDeletionBlockerCode.MANUAL_DISPATCH_EXISTS, 1)
    }

    @Test
    fun `deletion preview uses shared assessment blockers and empty list when deletable`() {
        val harness = lifecycleHarness()
        val preview = harness.service.deletionPreview(HostSessionIdCommand(host, sessionId))

        assertThat(preview).isEqualTo(
            HostSessionDeletionPreviewResponse(
                sessionId = sessionId.toString(),
                sessionNumber = 7,
                title = "7회차",
                state = "OPEN",
                canDelete = true,
                counts = emptyDeletionCounts(),
                blockers = emptyList(),
            ),
        )
        assertThat(harness.port.calls).containsExactly("assess:$sessionId")

        val blockers =
            listOf(HostSessionDeletionBlocker(HostSessionDeletionBlockerCode.MANUAL_DISPATCH_EXISTS, 1))
        harness.port.deletionAssessment = harness.port.deletionAssessment.copy(blockers = blockers)
        val blockedPreview = harness.service.deletionPreview(HostSessionIdCommand(host, sessionId))
        assertThat(blockedPreview.canDelete).isFalse()
        assertThat(blockedPreview.blockers).isEqualTo(blockers)
    }

    @Test
    fun `successful delete records audit metrics cache and correlation log`() {
        val harness = lifecycleHarness()
        val requestId = "delete-req-1"
        MDC.put(RequestIdFilter.MDC_KEY, requestId)
        try {
            captureHostSessionLogs().use { logs ->
                val response = harness.service.delete(HostSessionIdCommand(host, sessionId))

                assertThat(response.deleted).isTrue()
                assertThat(harness.port.calls).containsExactly(
                    "lockAndAssess:$sessionId",
                    "deleteAssessed:$sessionId",
                )
                assertThat(harness.audit.entries.single())
                    .extracting(
                        HostSessionLifecycleAuditEntry::action,
                        HostSessionLifecycleAuditEntry::fromState,
                        HostSessionLifecycleAuditEntry::toState,
                        HostSessionLifecycleAuditEntry::reasonCode,
                        HostSessionLifecycleAuditEntry::reasonNote,
                    ).containsExactly(
                        HostSessionLifecycleAction.DELETED,
                        "OPEN",
                        null,
                        HostSessionLifecycleReasonCode.EMPTY_SESSION_DELETED,
                        null,
                    )
                assertThat(harness.invalidation.clubs).containsExactly(host.clubId)
                assertThat(harness.transitionCount("DELETED", "deleted")).isEqualTo(1.0)
                assertThat(logs.events.single().formattedMessage)
                    .contains(requestId)
                    .contains("outcome=deleted")
                    .doesNotContain(host.email)
            }
        } finally {
            MDC.remove(RequestIdFilter.MDC_KEY)
        }
    }

    @Test
    fun `blocked delete throws shared blockers without deleting or auditing`() {
        val blockers =
            listOf(
                HostSessionDeletionBlocker(HostSessionDeletionBlockerCode.NOTIFICATION_EVENT_EXISTS, 1),
                HostSessionDeletionBlocker(HostSessionDeletionBlockerCode.MEMBER_NOTIFICATION_EXISTS, 2),
            )
        val harness =
            lifecycleHarness(
                port = RecordingHostSessionPorts().apply { deletionAssessment = deletionAssessment.copy(blockers = blockers) },
            )
        captureHostSessionLogs().use { logs ->
            val thrown =
                assertThrows(HostSessionDeletionBlockedException::class.java) {
                    harness.service.delete(HostSessionIdCommand(host, sessionId))
                }

            assertThat(thrown.blockers).isEqualTo(blockers)
            assertThat(harness.port.calls).containsExactly("lockAndAssess:$sessionId")
            assertThat(harness.audit.entries).isEmpty()
            assertThat(harness.invalidation.clubs).isEmpty()
            assertThat(harness.transitionCount("DELETED", "blocked")).isEqualTo(1.0)
            assertThat(harness.deletionBlockedCount("NOTIFICATION_EVENT_EXISTS")).isEqualTo(1.0)
            assertThat(harness.deletionBlockedCount("MEMBER_NOTIFICATION_EXISTS")).isEqualTo(1.0)
            assertThat(logs.events.single().formattedMessage)
                .contains("outcome=blocked")
                .contains("NOTIFICATION_EVENT_EXISTS")
                .contains("MEMBER_NOTIFICATION_EXISTS")
                .doesNotContain("payload")
                .doesNotContain("recipient")
                .doesNotContain("passcode")
        }
    }

    @Test
    fun `integrity failure with a now visible blocker becomes delete blocked`() {
        val blockers =
            listOf(HostSessionDeletionBlocker(HostSessionDeletionBlockerCode.MANUAL_DISPATCH_EXISTS, 1))
        val integrity = DataIntegrityViolationException("fk constraint")
        val allowed = allowedDeletionAssessment()
        val harness =
            lifecycleHarness(
                port =
                    RecordingHostSessionPorts().apply {
                        lockAssessment = allowed
                        assessAssessment = allowed.copy(blockers = blockers)
                        deleteAssessedFailure = integrity
                    },
            )

        val thrown =
            assertThrows(HostSessionDeletionBlockedException::class.java) {
                harness.service.delete(HostSessionIdCommand(host, sessionId))
            }

        assertThat(thrown.blockers).isEqualTo(blockers)
        assertThat(harness.port.calls).containsExactly(
            "lockAndAssess:$sessionId",
            "deleteAssessed:$sessionId",
            "assess:$sessionId",
        )
        assertThat(harness.invalidation.clubs).isEmpty()
        assertThat(harness.transitionCount("DELETED", "blocked")).isEqualTo(1.0)
        assertThat(harness.deletionBlockedCount("MANUAL_DISPATCH_EXISTS")).isEqualTo(1.0)
        assertThat(harness.transitionCount("DELETED", "failure")).isZero()
    }

    @Test
    fun `integrity failure without an approved blocker is rethrown`() {
        val integrity = DataIntegrityViolationException("unknown schema")
        val harness =
            lifecycleHarness(
                port =
                    RecordingHostSessionPorts().apply {
                        deleteAssessedFailure = integrity
                    },
            )

        val thrown =
            assertThrows(DataIntegrityViolationException::class.java) {
                harness.service.delete(HostSessionIdCommand(host, sessionId))
            }

        assertThat(thrown).isSameAs(integrity)
        assertThat(harness.port.calls).containsExactly(
            "lockAndAssess:$sessionId",
            "deleteAssessed:$sessionId",
            "assess:$sessionId",
        )
        assertThat(harness.transitionCount("DELETED", "failure")).isEqualTo(1.0)
        assertThat(harness.transitionCount("DELETED", "blocked")).isZero()
    }

    @Test
    fun `user selectable lifecycle reasons exclude internal codes`() {
        assertThat(USER_SELECTABLE_LIFECYCLE_REASONS).containsExactlyInAnyOrder(
            HostSessionLifecycleReasonCode.ACCIDENTAL_TRANSITION,
            HostSessionLifecycleReasonCode.MEETING_RESCHEDULED,
            HostSessionLifecycleReasonCode.CONTENT_CORRECTION,
            HostSessionLifecycleReasonCode.OPERATIONAL_RECOVERY,
            HostSessionLifecycleReasonCode.OTHER_OPERATIONAL_REASON,
        )
        assertThat(USER_SELECTABLE_LIFECYCLE_REASONS)
            .doesNotContain(
                HostSessionLifecycleReasonCode.LEGACY_UNSPECIFIED,
                HostSessionLifecycleReasonCode.EMPTY_SESSION_DELETED,
            )
    }

    @Test
    fun `changed reverse transition logs request correlation without reason note`() {
        val harness = lifecycleHarness()
        val requestId = "lifecycle-req-1"
        MDC.put(RequestIdFilter.MDC_KEY, requestId)
        try {
            captureHostSessionLogs().use { logs ->
                harness.service.reopen(
                    reverseCommand(
                        reasonCode = HostSessionLifecycleReasonCode.ACCIDENTAL_TRANSITION,
                        reasonNote = "secret-reason-note",
                    ),
                )

                assertThat(
                    logs.events
                        .single()
                        .argumentArray
                        .toList(),
                ).containsExactly(
                    HostSessionLifecycleAction.REOPENED,
                    "changed",
                    requestId,
                    host.clubId,
                    sessionId,
                    "CLOSED",
                    "OPEN",
                )
                assertThat(logs.events.single().formattedMessage)
                    .contains(requestId)
                    .doesNotContain("secret-reason-note")
                    .doesNotContain(host.email)
            }
        } finally {
            MDC.remove(RequestIdFilter.MDC_KEY)
        }
    }

    private fun allowedDeletionAssessment() =
        HostSessionDeletionAssessment(
            target =
                HostSessionDeletionTarget(
                    sessionId = sessionId,
                    sessionNumber = 7,
                    title = "7회차",
                    state = "OPEN",
                ),
            blockers = emptyList(),
            counts = emptyDeletionCounts(),
        )

    private fun reverseCommand(
        reasonCode: HostSessionLifecycleReasonCode? = HostSessionLifecycleReasonCode.ACCIDENTAL_TRANSITION,
        reasonNote: String? = null,
    ) = HostSessionReverseCommand(
        host = host,
        sessionId = sessionId,
        reasonCode = reasonCode,
        reasonNote = reasonNote,
    )

    private fun lifecycleHarness(
        port: RecordingHostSessionPorts = RecordingHostSessionPorts(),
        invalidation: RecordingReadCacheInvalidationPort = RecordingReadCacheInvalidationPort(),
        confirmationProperties: HostActionConfirmationProperties = HostActionConfirmationProperties(),
        requireReverseReason: Boolean = false,
        auditFailure: RuntimeException? = null,
    ): LifecycleHarness {
        val audit = RecordingHostSessionLifecycleAuditPort().apply { failure = auditFailure }
        val registry = SimpleMeterRegistry()
        val service =
            HostSessionLifecycleService(
                port,
                port,
                port,
                invalidation,
                confirmationProperties,
                audit,
                HostSessionOperationalMetrics(registry),
                HostSessionLifecycleProperties(requireReverseReason = requireReverseReason),
            )
        return LifecycleHarness(port, invalidation, audit, registry, service)
    }

    private class LifecycleHarness(
        val port: RecordingHostSessionPorts,
        val invalidation: RecordingReadCacheInvalidationPort,
        val audit: RecordingHostSessionLifecycleAuditPort,
        val registry: SimpleMeterRegistry,
        val service: HostSessionLifecycleService,
    ) {
        fun transitionCount(
            action: String,
            outcome: String,
        ): Double =
            registry
                .counter("session.lifecycle.transition", "action", action, "outcome", outcome)
                .count()

        fun legacyReasonCount(): Double = registry.counter("session.lifecycle.legacy.reason").count()

        fun deletionBlockedCount(blocker: String): Double = registry.counter("session.deletion.blocked", "blocker", blocker).count()
    }

    private class RecordingHostSessionLifecycleAuditPort : HostSessionLifecycleAuditPort {
        val entries = mutableListOf<HostSessionLifecycleAuditEntry>()
        var failure: RuntimeException? = null

        override fun record(entry: HostSessionLifecycleAuditEntry) {
            failure?.let { throw it }
            entries += entry
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

    private inner class RecordingHostSessionPorts :
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
        var reopenCommand: HostSessionIdCommand? = null
        var unpublishCommand: HostSessionIdCommand? = null
        var returnToDraftCommand: HostSessionIdCommand? = null
        var upcomingMember: CurrentMember? = null
        var scheduleDefaultsHost: CurrentMember? = null
        var openChanged = true
        var closeChanged = true
        var publishChanged = true
        var reopenChanged = true
        var unpublishChanged = true
        var returnToDraftChanged = true
        var openFailure: RuntimeException? = null
        var closeFailure: RuntimeException? = null
        var publishFailure: RuntimeException? = null
        var reopenFailure: RuntimeException? = null
        var unpublishFailure: RuntimeException? = null
        var returnToDraftFailure: RuntimeException? = null
        var lifecycleStateWriteCount = 0
        var throwOnUpsertPublication = false
        var visibilityState = "OPEN"
        var currentVisibility = SessionRecordVisibility.HOST_ONLY
        var currentAccessScope = SessionAccessScope.HOST_ONLY
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
                visibility =
                    if (command.accessScope == SessionAccessScope.GUEST_READABLE) {
                        SessionRecordVisibility.MEMBER
                    } else {
                        SessionRecordVisibility.HOST_ONLY
                    },
                accessScope = command.accessScope ?: SessionAccessScope.HOST_ONLY,
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
                        accessScope = currentAccessScope,
                        bookTitle = visibilityBookTitle,
                    ),
                contentUpdatedAt = visibilityUpdatedAt,
            )
        }

        override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionVisibilityUpdateResult {
            visibilityCommand = command
            visibilityUpdateCount += 1
            val previous = currentVisibility
            if (command.accessScope != null) {
                currentAccessScope = command.accessScope
                currentVisibility =
                    if (command.accessScope == SessionAccessScope.GUEST_READABLE) {
                        SessionRecordVisibility.MEMBER
                    } else {
                        SessionRecordVisibility.HOST_ONLY
                    }
            } else {
                currentVisibility = command.visibility
                currentAccessScope =
                    if (command.visibility == SessionRecordVisibility.HOST_ONLY) {
                        SessionAccessScope.HOST_ONLY
                    } else {
                        SessionAccessScope.GUEST_READABLE
                    }
            }
            visibilityUpdatedAt = visibilityUpdatedAt.plusNanos(1_000)
            return HostSessionVisibilityUpdateResult(
                previousVisibility = previous,
                detail =
                    hostSessionDetail(command.sessionId).copy(
                        state = visibilityState,
                        visibility = currentVisibility,
                        accessScope = currentAccessScope,
                        bookTitle = visibilityBookTitle,
                    ),
            )
        }

        override fun open(command: HostSessionIdCommand): HostSessionTransitionResult {
            openCommand = command
            openFailure?.let { throw it }
            if (openChanged) {
                lifecycleStateWriteCount += 1
            }
            return HostSessionTransitionResult(
                detail = hostSessionDetail(command.sessionId).copy(state = "OPEN"),
                changed = openChanged,
            )
        }

        override fun close(command: HostSessionIdCommand): HostSessionTransitionResult {
            closeCommand = command
            closeFailure?.let { throw it }
            if (closeChanged) {
                lifecycleStateWriteCount += 1
            }
            return HostSessionTransitionResult(
                detail = hostSessionDetail(command.sessionId).copy(state = "CLOSED"),
                changed = closeChanged,
            )
        }

        override fun publish(command: HostSessionIdCommand): HostSessionTransitionResult {
            publishCommand = command
            publishFailure?.let { throw it }
            if (publishChanged) {
                lifecycleStateWriteCount += 1
            }
            return HostSessionTransitionResult(
                detail = hostSessionDetail(command.sessionId).copy(state = "PUBLISHED"),
                changed = publishChanged,
            )
        }

        override fun reopen(command: HostSessionIdCommand): HostSessionTransitionResult {
            reopenCommand = command
            reopenFailure?.let { throw it }
            if (reopenChanged) {
                lifecycleStateWriteCount += 1
            }
            return HostSessionTransitionResult(
                detail = hostSessionDetail(command.sessionId).copy(state = "OPEN"),
                changed = reopenChanged,
            )
        }

        override fun unpublish(command: HostSessionIdCommand): HostSessionTransitionResult {
            unpublishCommand = command
            unpublishFailure?.let { throw it }
            if (unpublishChanged) {
                lifecycleStateWriteCount += 1
            }
            return HostSessionTransitionResult(
                detail = hostSessionDetail(command.sessionId).copy(state = "CLOSED"),
                changed = unpublishChanged,
            )
        }

        override fun returnToDraft(command: HostSessionIdCommand): HostSessionTransitionResult {
            returnToDraftCommand = command
            returnToDraftFailure?.let { throw it }
            if (returnToDraftChanged) {
                lifecycleStateWriteCount += 1
            }
            return HostSessionTransitionResult(
                detail = hostSessionDetail(command.sessionId).copy(state = "DRAFT"),
                changed = returnToDraftChanged,
            )
        }

        var deletionAssessment =
            HostSessionDeletionAssessment(
                target =
                    HostSessionDeletionTarget(
                        sessionId = sessionId,
                        sessionNumber = 7,
                        title = "7회차",
                        state = "OPEN",
                    ),
                blockers = emptyList(),
                counts = emptyDeletionCounts(),
            )
        var lockAssessment: HostSessionDeletionAssessment? = null
        var assessAssessment: HostSessionDeletionAssessment? = null
        var deleteAssessedResult = true
        var deleteAssessedFailure: RuntimeException? = null

        override fun assess(command: HostSessionIdCommand) =
            (assessAssessment ?: deletionAssessment)
                .copy(
                    target = (assessAssessment ?: deletionAssessment).target.copy(sessionId = command.sessionId),
                ).also { calls += "assess:${command.sessionId}" }

        override fun lockAndAssess(command: HostSessionIdCommand) =
            (lockAssessment ?: deletionAssessment)
                .copy(
                    target = (lockAssessment ?: deletionAssessment).target.copy(sessionId = command.sessionId),
                ).also { calls += "lockAndAssess:${command.sessionId}" }

        override fun deleteAssessed(
            command: HostSessionIdCommand,
            target: HostSessionDeletionTarget,
        ): Boolean {
            calls += "deleteAssessed:${command.sessionId}"
            deleteAssessedFailure?.let { throw it }
            return deleteAssessedResult
        }

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

        override fun scheduleDefaults(host: CurrentMember): HostSessionScheduleDefaults {
            scheduleDefaultsHost = host
            return HostSessionScheduleDefaults(
                automatic =
                    HostSessionAutomaticScheduleDefaults(
                        startTime = "20:00",
                        endTime = "22:00",
                        locationLabel = "온라인",
                        accessScope = SessionAccessScope.HOST_ONLY,
                        suggestedDate = null,
                        questionDeadlineOffsetDays = 1,
                    ),
                previousOnlineMeeting = null,
                hints = emptyList(),
            )
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
    }

    private class RecordingReadCacheInvalidationPort : ReadCacheInvalidationPort {
        val clubs = mutableListOf<UUID>()

        override fun evictClubContent(clubId: UUID) {
            clubs += clubId
        }
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

private fun captureHostSessionLogs(): HostSessionLogCapture {
    val logger = LoggerFactory.getLogger(HostSessionLifecycleService::class.java) as Logger
    val appender = ListAppender<ILoggingEvent>().apply { start() }
    logger.addAppender(appender)
    return HostSessionLogCapture(logger, appender)
}

private fun assertLifecycleHasNoNotificationDispatchCollaborator() {
    val constructorParameterTypes =
        HostSessionLifecycleService::class.java.declaredConstructors
            .flatMap { it.parameterTypes.asIterable() }

    assertThat(constructorParameterTypes)
        .doesNotContain(
            RecordNotificationEventUseCase::class.java,
            ConfirmHostActionNotificationUseCase::class.java,
            RecordHostConfirmedNotificationEventUseCase::class.java,
        )
}
