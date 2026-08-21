package com.readmates.session.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.adapter.`in`.scheduling.HostSessionTrashScheduler
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostSessionDeletionAssessment
import com.readmates.session.application.HostSessionDeletionCounts
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionFeedbackDocument
import com.readmates.session.application.HostSessionListPage
import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.HostSessionListSummary
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionScheduleDefaults
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.session.application.UpcomingSessionItem
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HOST_SESSION_TRASH_RETENTION_DAYS
import com.readmates.session.application.model.HostDashboardResult
import com.readmates.session.application.model.HostSessionDeletionBlockedException
import com.readmates.session.application.model.HostSessionDeletionBlocker
import com.readmates.session.application.model.HostSessionDeletionBlockerCode
import com.readmates.session.application.model.HostSessionDeletionTarget
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionLifecycleAuditEntry
import com.readmates.session.application.model.HostSessionLifecycleReasonCode
import com.readmates.session.application.model.HostSessionTrashExpiredException
import com.readmates.session.application.model.HostSessionTrashPage
import com.readmates.session.application.model.HostSessionTrashPurgeTarget
import com.readmates.session.application.model.HostSessionTrashRecord
import com.readmates.session.application.port.`in`.ListHostSessionTrashCommand
import com.readmates.session.application.port.out.HostSessionAttendancePort
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionLifecycleAuditPort
import com.readmates.session.application.port.out.HostSessionQueryPort
import com.readmates.session.config.HostSessionTrashProperties
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import java.time.Duration
import java.time.OffsetDateTime
import java.util.UUID

class HostSessionTrashServiceTest {
    @Test
    fun `delete moves a session to trash for seven server days without removing children`() {
        val fixture = Fixture()
        val response = fixture.deletion.delete(command())

        assertThat(response.trashed).isTrue()
        assertThat(response.sessionId).isEqualTo(SESSION_ID.toString())
        assertThat(Duration.between(parseTime(response.deletedAt), parseTime(response.purgeAfter)))
            .isEqualTo(Duration.ofDays(HOST_SESSION_TRASH_RETENTION_DAYS))
        assertThat(fixture.port.childrenRemoved).isFalse()
        assertThat(fixture.port.physicallyDeleted).isFalse()
        assertThat(fixture.port.trashedIds).containsExactly(SESSION_ID)
        assertThat(fixture.audit.entries.single().action).isEqualTo(HostSessionLifecycleAction.DELETED)
        assertThat(fixture.cache.clubs).containsExactly(CLUB_ID)
        assertThat(fixture.port.calls).containsExactly(
            "lockAndAssess:$SESSION_ID",
            "moveToTrash:$SESSION_ID",
        )
        assertThat(fixture.port.calls).doesNotContain("deleteAssessed:$SESSION_ID")
    }

    @Test
    fun `existing state and durable blockers still prevent trash`() {
        val fixture = Fixture()
        fixture.port.lockAssessment =
            fixture.port.deletionAssessment.copy(
                blockers =
                    listOf(
                        HostSessionDeletionBlocker(
                            HostSessionDeletionBlockerCode.RECORD_REVISION_EXISTS,
                            1,
                        ),
                    ),
            )

        assertThatThrownBy { fixture.deletion.delete(command()) }
            .isInstanceOf(HostSessionDeletionBlockedException::class.java)
        assertThat(fixture.port.trashedIds).isEmpty()
        assertThat(fixture.audit.entries).isEmpty()
        assertThat(fixture.cache.clubs).isEmpty()
    }

    @Test
    fun `draft restore clears trash columns and records restored lifecycle`() {
        val fixture = Fixture().withTrashed(state = "DRAFT")
        val restored = fixture.service.restore(command())

        assertThat(restored.sessionId).isEqualTo(SESSION_ID.toString())
        assertThat(restored.state).isEqualTo("DRAFT")
        assertThat(fixture.port.trashedIds).isEmpty()
        assertThat(fixture.port.childrenRemoved).isFalse()
        assertThat(fixture.audit.entries.single()).extracting(
            HostSessionLifecycleAuditEntry::action,
            HostSessionLifecycleAuditEntry::fromState,
            HostSessionLifecycleAuditEntry::toState,
            HostSessionLifecycleAuditEntry::reasonCode,
        ).containsExactly(
            HostSessionLifecycleAction.RESTORED,
            "DRAFT",
            "DRAFT",
            HostSessionLifecycleReasonCode.OPERATIONAL_RECOVERY,
        )
        assertThat(fixture.cache.clubs).containsExactly(CLUB_ID)
    }

    @Test
    fun `open restore succeeds when no other open session exists`() {
        val fixture = Fixture().withTrashed(state = "OPEN")
        val restored = fixture.service.restore(command())

        assertThat(restored.state).isEqualTo("OPEN")
        assertThat(fixture.port.findOpenSessionId(CLUB_ID)).isEqualTo(SESSION_ID)
        assertThat(fixture.audit.entries.single().action).isEqualTo(HostSessionLifecycleAction.RESTORED)
        assertThat(fixture.cache.clubs).containsExactly(CLUB_ID)
    }

    @Test
    fun `open restore conflicts when another open session exists`() {
        val fixture = Fixture().withTrashed(state = "OPEN")
        fixture.port.openSessionId = OTHER_OPEN_ID

        assertThatThrownBy { fixture.service.restore(command()) }
            .isInstanceOf(OpenSessionAlreadyExistsException::class.java)
            .extracting("openSessionId")
            .isEqualTo(OTHER_OPEN_ID)
        assertThat(fixture.port.trashedIds).containsExactly(SESSION_ID)
        assertThat(fixture.audit.entries).isEmpty()
        assertThat(fixture.cache.clubs).isEmpty()
    }

    @Test
    fun `cross club trash is not found`() {
        val fixture = Fixture().withTrashed()
        val otherClub = command(host = host(clubId = OTHER_CLUB_ID))

        assertThatThrownBy { fixture.service.trash(otherClub) }
            .isInstanceOf(HostSessionNotFoundException::class.java)
        assertThatThrownBy { fixture.service.restore(otherClub) }
            .isInstanceOf(HostSessionNotFoundException::class.java)
    }

    @Test
    fun `expired trash returns 410 before and after physical purge`() {
        val fixture = Fixture().withTrashed(purgeAfter = NOW.minusSeconds(1))

        assertThatThrownBy { fixture.service.restore(command()) }
            .isInstanceOf(HostSessionTrashExpiredException::class.java)

        fixture.port.physicallyDelete(SESSION_ID)
        fixture.port.latestAction = HostSessionLifecycleAction.DELETED

        assertThatThrownBy { fixture.service.restore(command()) }
            .isInstanceOf(HostSessionTrashExpiredException::class.java)
        assertThatThrownBy { fixture.service.trash(command()) }
            .isInstanceOf(HostSessionTrashExpiredException::class.java)
    }

    @Test
    fun `purged restored or unknown sessions stay not found`() {
        val fixture = Fixture()
        fixture.port.physicallyDelete(SESSION_ID)
        fixture.port.latestAction = HostSessionLifecycleAction.RESTORED

        assertThatThrownBy { fixture.service.restore(command()) }
            .isInstanceOf(HostSessionNotFoundException::class.java)

        fixture.port.latestAction = null
        assertThatThrownBy { fixture.service.trash(command()) }
            .isInstanceOf(HostSessionNotFoundException::class.java)
    }

    @Test
    fun `scheduler batches are bounded and idempotent and invalidate cache after purge`() {
        val fixture = Fixture()
        fixture.port.expired =
            listOf(
                HostSessionTrashPurgeTarget(SESSION_ID, CLUB_ID),
                HostSessionTrashPurgeTarget(OTHER_OPEN_ID, CLUB_ID),
            )

        assertThat(fixture.service.purgeExpired(50)).isEqualTo(2)
        assertThat(fixture.port.childrenRemoved).isTrue()
        assertThat(fixture.port.physicallyDeleted).isTrue()
        assertThat(fixture.port.purgedIds).containsExactly(SESSION_ID, OTHER_OPEN_ID)
        assertThat(fixture.cache.clubs).containsExactly(CLUB_ID)

        fixture.port.expired = emptyList()
        assertThat(fixture.service.purgeExpired(50)).isZero()
    }

    @Test
    fun `scheduler logs one failure without retrying in the same tick`() {
        var calls = 0
        val scheduler =
            HostSessionTrashScheduler(
                { _ ->
                    calls += 1
                    error("private db endpoint")
                },
                HostSessionTrashProperties(),
            )
        val logger = LoggerFactory.getLogger(HostSessionTrashScheduler::class.java) as Logger
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(appender)
        try {
            scheduler.purgeExpired()
            scheduler.purgeExpired()
        } finally {
            logger.detachAppender(appender)
            appender.stop()
        }

        assertThat(calls).isEqualTo(2)
        assertThat(appender.list).hasSize(2)
        assertThat(appender.list.map { it.level }.distinct()).containsExactly(Level.WARN)
        assertThat(appender.list.map { it.formattedMessage }.distinct())
            .containsExactly("Scheduled host session trash purge failed result=failed")
        assertThat(appender.list.map { it.formattedMessage }.joinToString())
            .doesNotContain("private db endpoint")
    }

    @Test
    fun `scheduler uses a one hour delay and batch of fifty`() {
        val scheduled =
            HostSessionTrashScheduler::class.java
                .getDeclaredMethod("purgeExpired")
                .getAnnotation(Scheduled::class.java)

        assertThat(scheduled.fixedDelayString)
            .isEqualTo("\${readmates.session.trash.purge-fixed-delay:1h}")
        assertThat(HostSessionTrashProperties().purgeFixedDelay).isEqualTo(Duration.ofHours(1))
        assertThat(HostSessionTrashProperties().purgeBatchSize).isEqualTo(50)
    }

    @Test
    fun `non host cannot list trash`() {
        val fixture = Fixture()
        assertThatThrownBy {
            fixture.service.list(
                ListHostSessionTrashCommand(
                    host = host(role = MembershipRole.MEMBER),
                    pageRequest = PageRequest(limit = 50, cursor = emptyMap()),
                ),
            )
        }.isInstanceOf(AccessDeniedException::class.java)
    }

    private class Fixture {
        val port = FakeDeletionPort()
        val query = FakeQueryPort()
        val audit = RecordingAudit()
        val cache = RecordingCache()
        val service = HostSessionTrashService(port, query, audit, cache)
        val deletion = HostSessionLifecycleService(query, port, query, cache, lifecycleAudit = audit)

        fun withTrashed(
            state: String = "DRAFT",
            purgeAfter: OffsetDateTime = NOW.plusDays(HOST_SESSION_TRASH_RETENTION_DAYS),
        ): Fixture {
            port.trashRecord =
                HostSessionTrashRecord(
                    sessionId = SESSION_ID,
                    sessionNumber = 7,
                    title = "7회차",
                    state = state,
                    deletedAt = NOW.minusDays(1),
                    purgeAfter = purgeAfter,
                    restorable = purgeAfter.isAfter(NOW),
                )
            port.trashedIds += SESSION_ID
            query.state = state
            return this
        }
    }

    private class FakeDeletionPort : HostSessionDeletionPort {
        var deletionAssessment = allowedAssessment()
        var lockAssessment: HostSessionDeletionAssessment? = null
        var trashRecord: HostSessionTrashRecord? = null
        var openSessionId: UUID? = null
        var latestAction: HostSessionLifecycleAction? = HostSessionLifecycleAction.DELETED
        var expired = emptyList<HostSessionTrashPurgeTarget>()
        var childrenRemoved = false
        var physicallyDeleted = false
        val trashedIds = mutableListOf<UUID>()
        val purgedIds = mutableListOf<UUID>()
        val calls = mutableListOf<String>()

        override fun assess(command: HostSessionIdCommand) =
            deletionAssessment.also { calls += "assess:${command.sessionId}" }

        override fun lockAndAssess(command: HostSessionIdCommand) =
            (lockAssessment ?: deletionAssessment).also { calls += "lockAndAssess:${command.sessionId}" }

        override fun deleteAssessed(
            command: HostSessionIdCommand,
            target: HostSessionDeletionTarget,
        ): Boolean {
            calls += "deleteAssessed:${command.sessionId}"
            childrenRemoved = true
            physicallyDeleted = true
            return true
        }

        override fun moveToTrash(
            command: HostSessionIdCommand,
            target: HostSessionDeletionTarget,
        ): HostSessionTrashRecord {
            calls += "moveToTrash:${command.sessionId}"
            trashedIds += command.sessionId
            val deletedAt = NOW
            return HostSessionTrashRecord(
                sessionId = target.sessionId,
                sessionNumber = target.sessionNumber,
                title = target.title,
                state = target.state,
                deletedAt = deletedAt,
                purgeAfter = deletedAt.plusDays(HOST_SESSION_TRASH_RETENTION_DAYS),
                restorable = true,
            )
        }

        override fun listTrash(
            host: CurrentMember,
            pageRequest: PageRequest,
        ): HostSessionTrashPage {
            calls += "listTrash:${host.clubId}"
            return HostSessionTrashPage(emptyList(), null)
        }

        override fun findTrash(command: HostSessionIdCommand): HostSessionTrashRecord? {
            calls += "findTrash:${command.sessionId}"
            if (command.host.clubId != CLUB_ID || physicallyDeleted) return null
            return trashRecord
        }

        override fun lockClub(clubId: UUID) {
            calls += "lockClub:$clubId"
        }

        override fun lockTrash(command: HostSessionIdCommand): HostSessionTrashRecord? {
            calls += "lockTrash:${command.sessionId}"
            if (command.host.clubId != CLUB_ID || physicallyDeleted) return null
            return trashRecord
        }

        override fun restoreTrash(command: HostSessionIdCommand): Boolean {
            calls += "restoreTrash:${command.sessionId}"
            val restored = trashRecord
            trashedIds.remove(command.sessionId)
            trashRecord = null
            if (restored?.state == "OPEN") {
                openSessionId = command.sessionId
            }
            return true
        }

        override fun findOpenSessionId(clubId: UUID): UUID? {
            calls += "findOpenSessionId:$clubId"
            return openSessionId ?: trashedIds.firstOrNull()?.takeIf { false }
        }

        override fun deletionCounts(
            clubId: UUID,
            sessionId: UUID,
        ) = emptyCounts()

        override fun lockExpiredForPurge(limit: Int): List<HostSessionTrashPurgeTarget> {
            calls += "lockExpiredForPurge:$limit"
            return expired.take(limit)
        }

        override fun purgeLocked(target: HostSessionTrashPurgeTarget): Boolean {
            calls += "purgeLocked:${target.sessionId}"
            childrenRemoved = true
            physicallyDeleted = true
            purgedIds += target.sessionId
            return true
        }

        override fun latestDeletedOrRestoredAction(
            clubId: UUID,
            sessionId: UUID,
        ): HostSessionLifecycleAction? {
            if (clubId != CLUB_ID) return null
            return latestAction
        }

        fun physicallyDelete(sessionId: UUID) {
            physicallyDeleted = true
            trashedIds.remove(sessionId)
            trashRecord = null
        }
    }

    private class FakeQueryPort :
        HostSessionQueryPort,
        HostSessionAttendancePort,
        com.readmates.session.application.port.out.HostSessionDraftPort,
        com.readmates.session.application.port.out.HostSessionLifecyclePort {
        var state = "DRAFT"

        override fun list(
            host: CurrentMember,
            pageRequest: PageRequest,
            query: HostSessionListQuery,
        ) = HostSessionListPage(emptyList(), null, HostSessionListSummary(0, 0, 0))

        override fun detail(command: HostSessionIdCommand) = hostSessionDetail(command.sessionId, state)

        override fun dashboard(host: CurrentMember) = HostDashboardResult(0, 0, 0, 0)

        override fun upcoming(member: CurrentMember) = emptyList<UpcomingSessionItem>()

        override fun scheduleDefaults(host: CurrentMember) =
            HostSessionScheduleDefaults(
                automatic =
                    com.readmates.session.application.HostSessionAutomaticScheduleDefaults(
                        startTime = "20:00",
                        endTime = "22:00",
                        locationLabel = "온라인",
                        accessScope = com.readmates.session.domain.SessionAccessScope.HOST_ONLY,
                        suggestedDate = null,
                        questionDeadlineOffsetDays = 1,
                    ),
                previousOnlineMeeting = null,
                hints = emptyList(),
            )

        override fun confirmAttendance(command: ConfirmAttendanceCommand) =
            HostAttendanceResponse(command.sessionId.toString(), 0)

        override fun create(command: com.readmates.session.application.model.HostSessionCommand) =
            error("unused")

        override fun update(command: com.readmates.session.application.model.UpdateHostSessionCommand) =
            hostSessionDetail(command.sessionId, state)

        override fun lockVisibilitySnapshot(command: HostSessionIdCommand) =
            error("unused")

        override fun updateVisibility(
            command: com.readmates.session.application.model.UpdateHostSessionVisibilityCommand,
        ) = error("unused")

        override fun open(command: HostSessionIdCommand) = error("unused")

        override fun close(command: HostSessionIdCommand) = error("unused")

        override fun publish(command: HostSessionIdCommand) = error("unused")

        override fun reopen(command: HostSessionIdCommand) = error("unused")

        override fun unpublish(command: HostSessionIdCommand) = error("unused")

        override fun returnToDraft(command: HostSessionIdCommand) = error("unused")
    }

    private class RecordingAudit : HostSessionLifecycleAuditPort {
        val entries = mutableListOf<HostSessionLifecycleAuditEntry>()

        override fun record(entry: HostSessionLifecycleAuditEntry): UUID? {
            entries += entry
            return UUID.fromString("00000000-0000-0000-0000-000000000601")
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
        val OTHER_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")
        val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val OTHER_OPEN_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000302")
        val NOW: OffsetDateTime = OffsetDateTime.parse("2026-08-21T10:00:00Z")

        fun host(
            clubId: UUID = CLUB_ID,
            role: MembershipRole = MembershipRole.HOST,
        ) = CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = clubId,
            clubSlug = "readmates",
            email = "host@example.com",
            displayName = "호스트",
            accountName = "김호스트",
            role = role,
            membershipStatus = MembershipStatus.ACTIVE,
        )

        fun command(host: CurrentMember = host()) = HostSessionIdCommand(host, SESSION_ID)

        fun parseTime(value: String) = OffsetDateTime.parse(value)

        fun allowedAssessment() =
            HostSessionDeletionAssessment(
                target =
                    HostSessionDeletionTarget(
                        sessionId = SESSION_ID,
                        sessionNumber = 7,
                        title = "7회차",
                        state = "OPEN",
                    ),
                blockers = emptyList(),
                counts = emptyCounts(),
            )

        fun emptyCounts() =
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

        fun hostSessionDetail(
            sessionId: UUID,
            state: String,
        ) = HostSessionDetailResponse(
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
            state = state,
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
}
