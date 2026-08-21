package com.readmates.session.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.HostAttendanceAuditTransition
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostSessionBasicAuditSnapshot
import com.readmates.session.application.HostSessionChangeNotRestorableException
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionFeedbackDocument
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionRestoreStaleException
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionChangeKind
import com.readmates.session.application.model.HostSessionChangeReceipt
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.port.`in`.PreviewHostSessionRestoreCommand
import com.readmates.session.application.port.`in`.RestoreHostSessionCommand
import com.readmates.session.application.port.out.HostSessionAttendancePort
import com.readmates.session.application.port.out.HostSessionAuditPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionRecoverableChange
import com.readmates.session.application.port.out.HostSessionRecoveryPort
import com.readmates.session.application.port.out.HostSessionRestoreCurrentState
import com.readmates.session.application.port.out.HostSessionRestoreLock
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.session.application.port.out.HostSessionVisibilityUpdateResult
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import java.util.UUID

class HostSessionRecoveryServiceTest {
    @Test
    fun `preview and restore reverse changed basic fields and record restore lineage`() {
        val fixture = Fixture().withBasicChange()
        val preview = fixture.service.preview(fixture.previewCommand())

        assertThat(preview.canRestore).isTrue()
        assertThat(preview.blockedReason).isNull()
        assertThat(preview.kind).isEqualTo(HostSessionChangeKind.BASIC_INFO)
        assertThat(preview.items).contains(
            item("title", current = TITLE_AFTER, target = TITLE_BEFORE),
        )
        assertThat(preview.expectedCurrentHash).matches("[0-9a-f]{64}")

        val receipt = fixture.service.restore(fixture.restoreCommand(preview.expectedCurrentHash))

        assertThat(receipt).isEqualTo(fixture.basicReceipt)
        assertThat(fixture.draft.updated?.session?.title).isEqualTo(TITLE_BEFORE)
        assertThat(fixture.draft.updated?.session?.bookTitle).isEqualTo(BOOK_TITLE)
        assertThat(fixture.draft.updated?.session?.meetingUrl).isEqualTo("")
        assertThat(fixture.audit.basicRestoredFromChangeId).isEqualTo(CHANGE_ID)
        assertThat(fixture.cache.clubs).containsExactly(CLUB_ID)
    }

    @Test
    fun `preview redacts meeting credentials and keeps them out of captured logs`() {
        val fixture = Fixture().withBasicChange()
        val logs = captureLogs()
        val preview = logs.use { fixture.service.preview(fixture.previewCommand()) }

        assertThat(preview.items).containsExactly(
            item("title", current = TITLE_AFTER, target = TITLE_BEFORE),
            item("meetingUrl", sensitive = true),
            item("meetingPasscode", sensitive = true),
        )
        val rendered = preview.toString() + logs.events.joinToString { it.formattedMessage }
        assertThat(rendered).doesNotContain(MEETING_URL, MEETING_PASSCODE)
    }

    @Test
    fun `restore attendance reverses every transition in one command`() {
        val fixture = Fixture().withAttendanceChange()
        val preview = fixture.service.preview(fixture.previewCommand())

        assertThat(preview.canRestore).isTrue()
        assertThat(preview.items).containsExactly(
            attendanceItem(FIRST_MEMBER, current = "ATTENDED", target = "UNKNOWN"),
            attendanceItem(SECOND_MEMBER, current = "ABSENT", target = "UNKNOWN"),
        )

        fixture.service.restore(fixture.restoreCommand(preview.expectedCurrentHash))

        assertThat(fixture.attendance.confirmed?.entries).containsExactly(
            AttendanceEntryCommand(FIRST_MEMBER.toString(), "UNKNOWN"),
            AttendanceEntryCommand(SECOND_MEMBER.toString(), "UNKNOWN"),
        )
        assertThat(fixture.audit.attendanceRestoredFromChangeId).isEqualTo(CHANGE_ID)
    }

    @Test
    fun `missing snapshot is not restorable`() {
        val fixture = Fixture().withBasicChange(before = null, after = null)
        val preview = fixture.service.preview(fixture.previewCommand())

        assertThat(preview.canRestore).isFalse()
        assertThat(preview.blockedReason).isEqualTo("SNAPSHOT_UNAVAILABLE")
        assertRestoreNotRestorable(fixture, preview, "SNAPSHOT_UNAVAILABLE")
    }

    @Test
    fun `attendance without snapshots is not restorable even when changed fields exist`() {
        val fixture = Fixture().withAttendanceChange(completeSnapshots = false)
        val preview = fixture.service.preview(fixture.previewCommand())

        assertThat(preview.canRestore).isFalse()
        assertThat(preview.blockedReason).isEqualTo("SNAPSHOT_UNAVAILABLE")
        assertRestoreNotRestorable(fixture, preview, "SNAPSHOT_UNAVAILABLE")
        assertThat(fixture.attendance.confirmed).isNull()
    }

    @Test
    fun `another clubs change is not found`() {
        val fixture = Fixture().withMissingChange()

        assertThatThrownBy { fixture.service.preview(fixture.previewCommand()) }
            .isInstanceOf(HostSessionNotFoundException::class.java)
        assertThatThrownBy { fixture.service.restore(fixture.restoreCommand("a".repeat(64))) }
            .isInstanceOf(HostSessionNotFoundException::class.java)
    }

    @Test
    fun `removed attendance participant blocks partial restore`() {
        val fixture = Fixture().withAttendanceChange(current = mapOf(FIRST_MEMBER to "ATTENDED"))
        val preview = fixture.service.preview(fixture.previewCommand())

        assertThat(preview.canRestore).isFalse()
        assertThat(preview.blockedReason).isEqualTo("PARTICIPANT_NOT_ACTIVE")
        assertThat(preview.items.map { it.subjectId }).containsExactly(FIRST_MEMBER, SECOND_MEMBER)
        assertRestoreNotRestorable(fixture, preview, "PARTICIPANT_NOT_ACTIVE")
        assertThat(fixture.attendance.confirmed).isNull()
    }

    @Test
    fun `already restored lineage is not restorable`() {
        val fixture = Fixture().withBasicChange(alreadyRestored = true)
        val preview = fixture.service.preview(fixture.previewCommand())

        assertThat(preview.canRestore).isFalse()
        assertThat(preview.blockedReason).isEqualTo("ALREADY_RESTORED")
        assertRestoreNotRestorable(fixture, preview, "ALREADY_RESTORED")
    }

    @Test
    fun `stale expected hash is rejected`() {
        val fixture = Fixture().withBasicChange()
        val preview = fixture.service.preview(fixture.previewCommand())
        fixture.currentBasic = fixture.currentBasic.copy(title = "다른 제목")

        assertThatThrownBy { fixture.service.restore(fixture.restoreCommand(preview.expectedCurrentHash)) }
            .isInstanceOf(HostSessionRestoreStaleException::class.java)
        assertThat(fixture.draft.updated).isNull()
    }

    @Test
    fun `non host cannot preview or restore`() {
        val fixture = Fixture().withBasicChange()
        val member = host().copy(role = MembershipRole.MEMBER)

        assertThatThrownBy { fixture.service.preview(fixture.previewCommand(member)) }
            .isInstanceOf(AccessDeniedException::class.java)
        assertThatThrownBy { fixture.service.restore(fixture.restoreCommand("a".repeat(64), member)) }
            .isInstanceOf(AccessDeniedException::class.java)
    }

    private fun assertRestoreNotRestorable(
        fixture: Fixture,
        preview: com.readmates.session.application.model.HostSessionRestorePreview,
        reason: String,
    ) {
        assertThatThrownBy { fixture.service.restore(fixture.restoreCommand(preview.expectedCurrentHash)) }
            .isInstanceOf(HostSessionChangeNotRestorableException::class.java)
            .extracting("blockedReason")
            .isEqualTo(reason)
    }

    private class Fixture {
        val recovery = FakeRecoveryPort()
        val audit = FakeAuditPort()
        val draft = FakeDraftPort()
        val attendance = FakeAttendancePort()
        val cache = RecordingCache()
        val service = HostSessionRecoveryService(recovery, audit, draft, attendance, cache)
        var currentBasic = afterSnapshot()

        fun withBasicChange(
            before: HostSessionBasicAuditSnapshot? = beforeSnapshot(),
            after: HostSessionBasicAuditSnapshot? = afterSnapshot(),
            alreadyRestored: Boolean = false,
        ) = apply {
            currentBasic = after ?: beforeSnapshot()
            recovery.change =
                HostSessionRecoverableChange(
                    changeId = CHANGE_ID,
                    sessionId = SESSION_ID,
                    kind = HostSessionChangeKind.BASIC_INFO,
                    changedFields = listOf("title", "meetingUrl", "meetingPasscode"),
                    before = before,
                    after = after,
                    transitions = emptyList(),
                    alreadyRestored = alreadyRestored,
                    completeSnapshots = before != null && after != null,
                )
            recovery.current = { HostSessionRestoreCurrentState(currentBasic, emptyMap()) }
        }

        fun withAttendanceChange(
            current: Map<UUID, String> =
                mapOf(FIRST_MEMBER to "ATTENDED", SECOND_MEMBER to "ABSENT"),
            completeSnapshots: Boolean = true,
        ) = apply {
            recovery.change =
                HostSessionRecoverableChange(
                    changeId = CHANGE_ID,
                    sessionId = SESSION_ID,
                    kind = HostSessionChangeKind.ATTENDANCE,
                    changedFields = emptyList(),
                    before = null,
                    after = null,
                    transitions =
                        listOf(
                            HostAttendanceAuditTransition(FIRST_MEMBER.toString(), "UNKNOWN", "ATTENDED"),
                            HostAttendanceAuditTransition(SECOND_MEMBER.toString(), "UNKNOWN", "ABSENT"),
                        ),
                    alreadyRestored = false,
                    completeSnapshots = completeSnapshots,
                )
            recovery.current = { HostSessionRestoreCurrentState(null, current) }
        }

        fun withMissingChange() = apply { recovery.change = null }

        fun previewCommand(actor: CurrentMember = host()) =
            PreviewHostSessionRestoreCommand(actor, SESSION_ID, CHANGE_ID)

        fun restoreCommand(
            hash: String,
            actor: CurrentMember = host(),
        ) = RestoreHostSessionCommand(actor, SESSION_ID, CHANGE_ID, hash)

        val basicReceipt =
            HostSessionChangeReceipt(RESTORE_CHANGE_ID, HostSessionChangeKind.BASIC_INFO, true)
    }

    private class FakeRecoveryPort : HostSessionRecoveryPort {
        var change: HostSessionRecoverableChange? = null
        var current: () -> HostSessionRestoreCurrentState =
            { HostSessionRestoreCurrentState(null, emptyMap()) }

        override fun loadChange(
            host: CurrentMember,
            sessionId: UUID,
            changeId: UUID,
        ) = change

        override fun loadCurrentState(
            host: CurrentMember,
            sessionId: UUID,
            membershipIds: Set<UUID>,
        ) = current().let { state ->
            state.copy(attendance = state.attendance.filterKeys { it in membershipIds })
        }

        override fun lockForRestore(
            host: CurrentMember,
            sessionId: UUID,
            changeId: UUID,
        ) = change?.let { HostSessionRestoreLock(it, current()) }
    }

    private class FakeAuditPort : HostSessionAuditPort {
        var basicRestoredFromChangeId: UUID? = null
        var attendanceRestoredFromChangeId: UUID? = null

        override fun loadBasicSnapshot(
            host: CurrentMember,
            sessionId: UUID,
        ) = null

        override fun loadAttendanceStates(
            host: CurrentMember,
            sessionId: UUID,
            membershipIds: Set<UUID>,
        ) = emptyMap<UUID, String>()

        override fun recordBasicUpdate(
            host: CurrentMember,
            sessionId: UUID,
            before: HostSessionBasicAuditSnapshot,
            after: HostSessionBasicAuditSnapshot,
            changedFields: Set<String>,
            restoredFromChangeId: UUID?,
        ): HostSessionChangeReceipt {
            basicRestoredFromChangeId = restoredFromChangeId
            return HostSessionChangeReceipt(RESTORE_CHANGE_ID, HostSessionChangeKind.BASIC_INFO, true)
        }

        override fun recordAttendanceUpdate(
            host: CurrentMember,
            sessionId: UUID,
            transitions: List<HostAttendanceAuditTransition>,
            restoredFromChangeId: UUID?,
        ): HostSessionChangeReceipt {
            attendanceRestoredFromChangeId = restoredFromChangeId
            return HostSessionChangeReceipt(RESTORE_CHANGE_ID, HostSessionChangeKind.ATTENDANCE, true)
        }
    }

    private class FakeDraftPort : HostSessionDraftPort {
        var updated: UpdateHostSessionCommand? = null

        override fun create(command: HostSessionCommand) = error("unused")

        override fun update(command: UpdateHostSessionCommand): HostSessionDetailResponse {
            updated = command
            return detail()
        }

        override fun lockVisibilitySnapshot(command: HostSessionIdCommand) =
            HostSessionVisibilitySnapshot(detail(), java.time.OffsetDateTime.parse("2026-05-20T00:00:00Z"))

        override fun updateVisibility(command: UpdateHostSessionVisibilityCommand) =
            HostSessionVisibilityUpdateResult(SessionRecordVisibility.HOST_ONLY, detail())
    }

    private class FakeAttendancePort : HostSessionAttendancePort {
        var confirmed: ConfirmAttendanceCommand? = null

        override fun confirmAttendance(command: ConfirmAttendanceCommand): HostAttendanceResponse {
            confirmed = command
            return HostAttendanceResponse(command.sessionId.toString(), command.entries.size)
        }
    }

    private class RecordingCache : ReadCacheInvalidationPort {
        val clubs = mutableListOf<UUID>()

        override fun evictClubContent(clubId: UUID) {
            clubs += clubId
        }
    }

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val CHANGE_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000501")
        val RESTORE_CHANGE_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000502")
        val FIRST_MEMBER: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
        val SECOND_MEMBER: UUID = UUID.fromString("00000000-0000-0000-0000-000000000202")
        const val TITLE_BEFORE = "7회차"
        const val TITLE_AFTER = "7회차 · 복원"
        const val BOOK_TITLE = "테스트 책"
        const val MEETING_URL = "https://meet.example.invalid/restore-secret"
        const val MEETING_PASSCODE = "restore-passcode-secret"
    }
}

private fun host() =
    CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        clubSlug = "reading-sai",
        email = "host@example.test",
        displayName = "호스트",
        accountName = "김호스트",
        role = MembershipRole.HOST,
        membershipStatus = MembershipStatus.ACTIVE,
    )

private fun beforeSnapshot() =
    HostSessionBasicAuditSnapshot(
        title = "7회차",
        bookTitle = "테스트 책",
        bookAuthor = "테스트 저자",
        bookLink = "https://example.com/books/test-book",
        bookImageUrl = "https://example.com/covers/test-book.jpg",
        date = "2026-05-20",
        startTime = "19:30",
        endTime = "21:30",
        questionDeadlineAt = "2026-05-19T14:59Z",
        locationLabel = "온라인",
        meetingUrl = null,
        meetingPasscode = null,
    )

private fun afterSnapshot() =
    beforeSnapshot().copy(
        title = "7회차 · 복원",
        meetingUrl = "https://meet.example.invalid/restore-secret",
        meetingPasscode = "restore-passcode-secret",
    )

private fun item(
    field: String,
    current: String? = null,
    target: String? = null,
    sensitive: Boolean = false,
) = com.readmates.session.application.model.HostSessionRestoreItem(
    field = field,
    currentValue = current,
    targetValue = target,
    sensitive = sensitive,
)

private fun attendanceItem(
    membershipId: UUID,
    current: String?,
    target: String?,
) = com.readmates.session.application.model.HostSessionRestoreItem(
    field = "attendanceStatus",
    subjectId = membershipId,
    currentValue = current,
    targetValue = target,
)

private fun detail() =
    HostSessionDetailResponse(
        sessionId = "00000000-0000-0000-0000-000000000301",
        sessionNumber = 7,
        title = "7회차",
        bookTitle = "테스트 책",
        bookAuthor = "테스트 저자",
        bookLink = null,
        bookImageUrl = null,
        date = "2026-05-20",
        startTime = "19:30",
        endTime = "21:30",
        questionDeadlineAt = "2026-05-19T14:59Z",
        locationLabel = "온라인",
        meetingUrl = null,
        meetingPasscode = null,
        publication = null,
        state = "DRAFT",
        attendees = emptyList(),
        feedbackDocument = HostSessionFeedbackDocument(false, null, null),
        visibility = SessionRecordVisibility.HOST_ONLY,
    )

private fun captureLogs(): HostSessionRecoveryLogCapture {
    val logger = LoggerFactory.getLogger("com.readmates.session") as Logger
    val appender = ListAppender<ILoggingEvent>()
    appender.start()
    logger.level = Level.DEBUG
    logger.addAppender(appender)
    return HostSessionRecoveryLogCapture(logger, appender)
}

private class HostSessionRecoveryLogCapture(
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
