package com.readmates.notification.adapter.out.persistence

import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.service.MemberApprovalService
import com.readmates.auth.application.service.MemberLifecycleService
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.ManualNotificationSendMode
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationManualDispatchPayload
import com.readmates.notification.application.port.out.ManualNotificationConfirmAttempt
import com.readmates.notification.application.port.out.ManualNotificationConfirmInsertStatus
import com.readmates.notification.application.port.out.ManualNotificationConfirmRejection
import com.readmates.notification.application.port.out.ManualNotificationConfirmTransactionInput
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.application.port.out.contentRevision
import com.readmates.notification.application.port.out.snapshotHash
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.service.HostSessionAttendanceService
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.MDC
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Connection
import java.sql.DriverManager
import java.sql.SQLException
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

private const val PREPARE_MANUAL_DISPATCH_SQL = """
    delete from notification_manual_dispatches where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_manual_dispatch_previews where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_deliveries where club_id = '00000000-0000-0000-0000-000000000001';
    delete from member_notifications where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-000000000001'
      and (dedupe_key like 'manual:%' or dedupe_key like 'manual-dispatch-test-%');
    update sessions
    set state = 'OPEN'
    where club_id = '00000000-0000-0000-0000-000000000001'
      and id = '00000000-0000-0000-0000-000000000301';
"""

private const val RESTORE_MANUAL_DISPATCH_SQL = """
    delete from notification_manual_dispatches where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_manual_dispatch_previews where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_deliveries where club_id = '00000000-0000-0000-0000-000000000001';
    delete from member_notifications where club_id = '00000000-0000-0000-0000-000000000001';
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-000000000001'
      and (dedupe_key like 'manual:%' or dedupe_key like 'manual-dispatch-test-%');
    update sessions
    set state = 'PUBLISHED'
    where club_id = '00000000-0000-0000-0000-000000000001'
      and id = '00000000-0000-0000-0000-000000000301';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [PREPARE_MANUAL_DISPATCH_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [RESTORE_MANUAL_DISPATCH_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
@Suppress("LargeClass")
class JdbcManualNotificationDispatchAdapterTest(
    @param:Autowired private val adapter: JdbcManualNotificationDispatchAdapter,
    @param:Autowired private val memberLifecycleService: MemberLifecycleService,
    @param:Autowired private val memberApprovalService: MemberApprovalService,
    @param:Autowired private val attendanceService: HostSessionAttendanceService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val transactionManager: PlatformTransactionManager,
    @param:Autowired private val environment: Environment,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
    private val host =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = hostMembershipId,
            clubId = clubId,
            clubSlug = "reading-sai",
            email = "host@example.com",
            displayName = "호스트",
            accountName = "호스트",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    @Test
    fun `findSessionContext returns session metadata and feedback document state`() {
        val context = adapter.findSessionContext(clubId, sessionId)

        assertThat(context).isNotNull
        assertThat(context!!.sessionNumber).isGreaterThan(0)
        assertThat(context.bookTitle).isNotBlank()
        assertThat(context.feedbackDocumentUploaded).isTrue()
        assertThat(context.feedbackDocumentVersion).isPositive()
    }

    @Test
    fun `findSessionContext returns latest session record content revision`() {
        val revisionId = UUID.nameUUIDFromBytes("manual-context-revision".toByteArray())
        jdbcTemplate.update(
            """
            insert into session_record_revisions (
              id, session_id, club_id, version, source, snapshot_json, snapshot_sha256, applied_by_membership_id
            ) values (?, ?, ?, 999999, 'MANUAL', '{}', ?, ?)
            """.trimIndent(),
            revisionId.toString(),
            sessionId.toString(),
            clubId.toString(),
            "d".repeat(64),
            hostMembershipId.toString(),
        )

        try {
            assertThat(adapter.findSessionContext(clubId, sessionId)!!.sessionRecordContentRevision)
                .isEqualTo("d".repeat(64))
        } finally {
            jdbcTemplate.update("delete from session_record_revisions where id = ?", revisionId.toString())
        }
    }

    @Test
    fun `previewTargets applies audience edits and email preference counts`() {
        disablePreference("member1@example.com")
        val selection =
            selection(
                excludedMembershipIds = listOf(membershipId("member2@example.com")),
                includedMembershipIds = emptyList(),
            )

        val snapshot = adapter.previewTargets(clubId, selection)

        assertThat(snapshot.finalTargetCount).isGreaterThan(0)
        assertThat(snapshot.excludedCount).isEqualTo(1)
        assertThat(snapshot.emailSkippedByPreferenceCount).isGreaterThanOrEqualTo(1)
        assertThat(snapshot.targetMembershipIds).hasSize(snapshot.finalTargetCount)
        assertThat(snapshot.inAppMembershipIds).hasSize(snapshot.inAppEligibleCount)
        assertThat(snapshot.emailMembershipIds).hasSize(snapshot.emailEligibleCount)
        assertThat(snapshot.targetMembershipIds).doesNotContain(membershipId("member2@example.com"))
    }

    @Test
    fun `previewTargets freezes only email eligible ids for email only requests`() {
        disablePreference("member1@example.com")
        val snapshot =
            adapter.previewTargets(
                clubId,
                selection(requestedChannels = ManualNotificationRequestedChannels.EMAIL),
            )

        assertThat(snapshot.inAppMembershipIds).isEmpty()
        assertThat(snapshot.emailMembershipIds).hasSize(snapshot.emailEligibleCount)
        assertThat(snapshot.targetMembershipIds).hasSize(snapshot.finalTargetCount)
    }

    @Test
    fun `previewTargets restricts selected members to active same club memberships`() {
        val selected = listOf(membershipId("member1@example.com"), membershipId("member2@example.com"))
        val foreignMembership = UUID.nameUUIDFromBytes("foreign-membership".toByteArray())

        val snapshot =
            adapter.previewTargets(
                clubId,
                selection().copy(
                    audience = ManualNotificationAudience.SELECTED_MEMBERS,
                    selectedMembershipIds = selected + foreignMembership,
                ),
            )

        assertThat(snapshot.targetMembershipIds).containsExactlyInAnyOrderElementsOf(selected)
        assertThat(snapshot.finalTargetCount).isEqualTo(selected.size)
    }

    @Test
    fun `listMembers filters by display name or email with stable cursor`() {
        val page = adapter.listMembers(clubId, sessionId, "member", PageRequest.cursor(1, null, defaultLimit = 50, maxLimit = 100))

        assertThat(page.items).hasSize(1)
        assertThat(page.nextCursor).isNotBlank()

        val next =
            adapter.listMembers(
                clubId,
                sessionId,
                "member",
                PageRequest.cursor(10, page.nextCursor, defaultLimit = 50, maxLimit = 100),
            )
        assertThat(next.items.map { it.membershipId }).doesNotContain(page.items.single().membershipId)
    }

    @Test
    fun `validateMembershipEdits rejects out of club ids`() {
        val otherClubMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000901")

        assertThat(adapter.validateMembershipEdits(clubId, setOf(otherClubMembershipId))).isFalse()
    }

    @Test
    fun `listDispatches returns masked audit rows`() {
        val stored = insertManualDispatchFixture()

        val page =
            adapter.listDispatches(
                clubId,
                sessionId,
                NotificationEventType.SESSION_REMINDER_DUE,
                PageRequest.cursor(10, null, defaultLimit = 50, maxLimit = 100),
            )

        assertThat(page.items.map { it.manualDispatchId }).contains(stored.manualDispatchId)
        assertThat(page.items.single { it.manualDispatchId == stored.manualDispatchId }.requestedBy).contains("***@")
    }

    @Test
    fun `insertPreview and findPreview round trip host scoped preview`() {
        val expiresAt = OffsetDateTime.of(2026, 5, 13, 9, 10, 0, 0, ZoneOffset.UTC)

        val targetSnapshotHash = "b".repeat(64)
        val id = adapter.insertPreview(clubId, hostMembershipId, "a".repeat(64), targetSnapshotHash, expiresAt)
        val record = adapter.findPreview(id, clubId, hostMembershipId)

        assertThat(record!!.selectionHash).isEqualTo("a".repeat(64))
        assertThat(record.targetSnapshotHash).isEqualTo(targetSnapshotHash)
        assertThat(record.expiresAt).isEqualTo(expiresAt)
    }

    @Test
    fun `insertManualDispatch writes event outbox and audit row`() {
        val dispatchId = UUID.nameUUIDFromBytes("manual-dispatch".toByteArray())
        val payload =
            NotificationEventPayload(
                sessionId = sessionId,
                sessionNumber = 7,
                bookTitle = "Example Book",
                manualDispatch =
                    NotificationManualDispatchPayload(
                        id = dispatchId,
                        source = NotificationDispatchSource.MANUAL,
                        requestedByMembershipId = hostMembershipId,
                        requestedChannels = ManualNotificationRequestedChannels.BOTH,
                        audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                        contentRevision = reminderRevision(),
                        resend = true,
                        sendMode = ManualNotificationSendMode.NOW,
                    ),
            )

        val stored =
            adapter.insertManualDispatch(
                clubId = clubId,
                hostMembershipId = hostMembershipId,
                selection = selection(),
                payload = payload,
                targetSnapshot = ManualNotificationTargetSnapshot(3, 0, 0, 3, 3, 2, 1, 0),
                resend = true,
            )

        assertThat(stored.manualDispatchId).isEqualTo(dispatchId)
        assertThat(eventCount(stored.eventId)).isEqualTo(1)
        assertThat(manualDispatchCount(dispatchId)).isEqualTo(1)
    }

    @Test
    fun `confirm replays persisted summary after revision member channel and ttl changes`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val currentSelection = selection()
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val previewId =
            adapter.insertPreview(
                clubId,
                hostMembershipId,
                "a".repeat(64),
                snapshot.snapshotHash(),
                now.plusMinutes(10),
            )
        val first = confirmed(confirm(previewId, now, currentSelection))
        val mutableMembershipId = snapshot.emailMembershipIds.first { it != hostMembershipId }
        val originalState = mutableReplayState(mutableMembershipId)

        try {
            makeReplayStateIneligible(mutableMembershipId, originalState.date.plusDays(1))
            val second = confirmed(confirm(previewId, now.plusMinutes(11), currentSelection))

            assertThat(first.status).isEqualTo(ManualNotificationConfirmInsertStatus.CREATED)
            assertThat(second.status).isEqualTo(ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED)
            assertThat(first.eventId).isEqualTo(second.eventId)
            assertThat(second.summary).isEqualTo(first.summary)
            assertThat(second.summary.targetCount).isEqualTo(snapshot.finalTargetCount)
            assertThat(second.summary.expectedInAppCount).isEqualTo(snapshot.inAppEligibleCount)
            assertThat(second.summary.expectedEmailCount).isEqualTo(snapshot.emailEligibleCount)
            assertThat(eventCount(first.eventId)).isEqualTo(1)
            assertThat(previewManualDispatchCount(previewId)).isEqualTo(1)
        } finally {
            restoreMutableReplayState(mutableMembershipId, originalState)
        }
    }

    @Test
    fun `distinct previews confirmed concurrently create one dispatch without resend approval`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val currentSelection = selection()
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val previewIds =
            listOf(
                adapter.insertPreview(
                    clubId,
                    hostMembershipId,
                    "a".repeat(64),
                    snapshot.snapshotHash(),
                    now.plusMinutes(10),
                ),
                adapter.insertPreview(
                    clubId,
                    hostMembershipId,
                    "a".repeat(64),
                    snapshot.snapshotHash(),
                    now.plusMinutes(10),
                ),
            )
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val results =
                previewIds.mapIndexed { index, previewId ->
                    CompletableFuture.supplyAsync(
                        {
                            start.await()
                            adapter.confirmManualDispatch(
                                ManualNotificationConfirmTransactionInput(
                                    previewId = previewId,
                                    clubId = clubId,
                                    hostMembershipId = hostMembershipId,
                                    selectionHash = "a".repeat(64),
                                    now = now,
                                    selection = currentSelection,
                                    resendConfirmed = false,
                                ),
                            )
                        },
                        executor,
                    )
                }
            start.countDown()
            val stored = results.map { it.get() }

            assertThat(stored)
                .describedAs("confirmation attempts")
                .allMatch { it is ManualNotificationConfirmAttempt.Confirmed }
            val dispatches = stored.map { (it as ManualNotificationConfirmAttempt.Confirmed).dispatch }
            assertThat(dispatches.count { it.status == ManualNotificationConfirmInsertStatus.CREATED }).isEqualTo(1)
            assertThat(dispatches.count { it.status == ManualNotificationConfirmInsertStatus.DUPLICATE }).isEqualTo(1)
            assertThat(revisionManualDispatchCount(currentSelection.contentRevision)).isEqualTo(1)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `different hosts confirm the same revision concurrently without deadlock or duplicate outbox`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val secondHostMembershipId = membershipId("member1@example.com")
        val currentSelection = selection()
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            jdbcTemplate.update(
                "update memberships set role = 'HOST' where club_id = ? and id = ?",
                clubId.toString(),
                secondHostMembershipId.toString(),
            )
            val hosts = listOf(hostMembershipId, secondHostMembershipId)
            val previewIds =
                hosts.map { membershipId ->
                    adapter.insertPreview(
                        clubId,
                        membershipId,
                        "a".repeat(64),
                        snapshot.snapshotHash(),
                        now.plusMinutes(10),
                    )
                }
            val results =
                previewIds.zip(hosts).map { (previewId, membershipId) ->
                    CompletableFuture.supplyAsync(
                        {
                            start.await()
                            adapter.confirmManualDispatch(
                                ManualNotificationConfirmTransactionInput(
                                    previewId = previewId,
                                    clubId = clubId,
                                    hostMembershipId = membershipId,
                                    selectionHash = "a".repeat(64),
                                    now = now,
                                    selection = currentSelection,
                                    resendConfirmed = false,
                                ),
                            )
                        },
                        executor,
                    )
                }

            start.countDown()
            val attempts = results.map { it.get() }

            assertThat(attempts)
                .describedAs("confirmation attempts")
                .allMatch { it is ManualNotificationConfirmAttempt.Confirmed }
            val dispatches = attempts.map { (it as ManualNotificationConfirmAttempt.Confirmed).dispatch }
            assertThat(dispatches.count { it.status == ManualNotificationConfirmInsertStatus.CREATED }).isEqualTo(1)
            assertThat(dispatches.count { it.status == ManualNotificationConfirmInsertStatus.DUPLICATE }).isEqualTo(1)
            assertThat(revisionManualDispatchCount(currentSelection.contentRevision)).isEqualTo(1)
        } finally {
            executor.shutdownNow()
            jdbcTemplate.update(
                "update memberships set role = 'MEMBER' where club_id = ? and id = ?",
                clubId.toString(),
                secondHostMembershipId.toString(),
            )
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `different hosts confirm different sessions concurrently with the shared club lock`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val secondSessionId = UUID.fromString("00000000-0000-0000-0000-000000000302")
        val secondHostMembershipId = membershipId("member1@example.com")
        val firstSelection = selection()
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            jdbcTemplate.update(
                "update memberships set role = 'HOST' where club_id = ? and id = ?",
                clubId.toString(),
                secondHostMembershipId.toString(),
            )
            jdbcTemplate.update(
                "update sessions set state = 'DRAFT', visibility = 'HOST_ONLY' where club_id = ? and id = ?",
                clubId.toString(),
                secondSessionId.toString(),
            )
            val secondSelection = selection(sessionId = secondSessionId)
            val attempts =
                listOf(
                    hostMembershipId to firstSelection,
                    secondHostMembershipId to secondSelection,
                ).map { (membershipId, currentSelection) ->
                    val snapshot = adapter.previewTargets(clubId, currentSelection)
                    val previewId =
                        adapter.insertPreview(
                            clubId,
                            membershipId,
                            "a".repeat(64),
                            snapshot.snapshotHash(),
                            now.plusMinutes(10),
                        )
                    CompletableFuture.supplyAsync(
                        {
                            start.await()
                            adapter.confirmManualDispatch(
                                ManualNotificationConfirmTransactionInput(
                                    previewId = previewId,
                                    clubId = clubId,
                                    hostMembershipId = membershipId,
                                    selectionHash = "a".repeat(64),
                                    now = now,
                                    selection = currentSelection,
                                    resendConfirmed = false,
                                ),
                            )
                        },
                        executor,
                    )
                }

            start.countDown()
            val confirmed = attempts.map { it.get(10, TimeUnit.SECONDS) }

            assertThat(confirmed)
                .allMatch {
                    it is ManualNotificationConfirmAttempt.Confirmed &&
                        it.dispatch.status == ManualNotificationConfirmInsertStatus.CREATED
                }
            assertThat(revisionManualDispatchCount(firstSelection.contentRevision)).isEqualTo(1)
            assertThat(
                revisionManualDispatchCount(
                    secondSelection.contentRevision,
                    secondSelection.sessionId,
                ),
            ).isEqualTo(1)
        } finally {
            executor.shutdownNow()
            jdbcTemplate.update(
                "update memberships set role = 'MEMBER' where club_id = ? and id = ?",
                clubId.toString(),
                secondHostMembershipId.toString(),
            )
            jdbcTemplate.update(
                "update sessions set state = 'PUBLISHED', visibility = 'PUBLIC' where club_id = ? and id = ?",
                clubId.toString(),
                secondSessionId.toString(),
            )
        }
    }

    @Test
    fun `confirm waits behind a real member lifecycle mutation using the same club lock`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val changedMembershipId = membershipId("member1@example.com")
        val originalParticipation = participantStatus("participation_status", changedMembershipId)
        val currentSelection = selection()
        val previewId = insertLockTestPreview(now, currentSelection)
        val lifecycleMutationApplied = CountDownLatch(1)
        val releaseLifecycle = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        val transactionTemplate = TransactionTemplate(transactionManager)

        try {
            val lifecycle =
                CompletableFuture.runAsync(
                    {
                        transactionTemplate.executeWithoutResult {
                            memberLifecycleService.suspend(
                                host,
                                changedMembershipId,
                                MemberLifecycleRequest(),
                            )
                            lifecycleMutationApplied.countDown()
                            check(releaseLifecycle.await(10, TimeUnit.SECONDS))
                        }
                    },
                    executor,
                )
            check(lifecycleMutationApplied.await(10, TimeUnit.SECONDS))
            assertThat(
                awaitConfirmAfterMutation(
                    executor,
                    previewId,
                    now,
                    currentSelection,
                    releaseLifecycle,
                    lifecycle,
                ),
            ).isEqualTo(
                ManualNotificationConfirmAttempt.Rejected(
                    ManualNotificationConfirmRejection.RECIPIENTS_CHANGED,
                ),
            )
        } finally {
            releaseLifecycle.countDown()
            executor.shutdownNow()
            restoreLifecycleLockTestState(changedMembershipId, originalParticipation)
        }
    }

    @Test
    fun `confirm waits behind a real viewer activation using the same club lock`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val changedMembershipId = membershipId("member1@example.com")
        val originalState = viewerActivationState(changedMembershipId)
        val activationApplied = CountDownLatch(1)
        val releaseActivation = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        val transactionTemplate = TransactionTemplate(transactionManager)

        try {
            jdbcTemplate.update(
                "update memberships set status = 'VIEWER' where club_id = ? and id = ?",
                clubId.toString(),
                changedMembershipId.toString(),
            )
            val currentSelection = selection()
            val previewId = insertLockTestPreview(now, currentSelection)
            val activation =
                CompletableFuture.runAsync(
                    {
                        transactionTemplate.executeWithoutResult {
                            memberApprovalService.activateViewer(host, changedMembershipId)
                            activationApplied.countDown()
                            check(releaseActivation.await(10, TimeUnit.SECONDS))
                        }
                    },
                    executor,
                )
            check(activationApplied.await(10, TimeUnit.SECONDS))
            assertThat(
                awaitConfirmAfterMutation(
                    executor,
                    previewId,
                    now,
                    currentSelection,
                    releaseActivation,
                    activation,
                ),
            ).isEqualTo(
                ManualNotificationConfirmAttempt.Rejected(
                    ManualNotificationConfirmRejection.RECIPIENTS_CHANGED,
                ),
            )
        } finally {
            releaseActivation.countDown()
            executor.shutdownNow()
            restoreViewerActivationState(changedMembershipId, originalState)
        }
    }

    @Test
    fun `confirm waits behind a real attendance mutation using the same club lock`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val changedMembershipId = membershipId("member1@example.com")
        val originalState = attendanceState(changedMembershipId)
        val changedAttendance = if (originalState.status == "ATTENDED") "ABSENT" else "ATTENDED"
        val auditRequestId = "manual-confirm-lock-${UUID.randomUUID()}"
        val currentSelection = selection()
        val previewId = insertLockTestPreview(now, currentSelection)
        val attendanceApplied = CountDownLatch(1)
        val releaseAttendance = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        val transactionTemplate = TransactionTemplate(transactionManager)

        try {
            val attendance =
                CompletableFuture.runAsync(
                    {
                        transactionTemplate.executeWithoutResult {
                            MDC.put("requestId", auditRequestId)
                            try {
                                attendanceService.confirmAttendance(
                                    ConfirmAttendanceCommand(
                                        host = host,
                                        sessionId = sessionId,
                                        entries =
                                            listOf(
                                                AttendanceEntryCommand(
                                                    membershipId = changedMembershipId.toString(),
                                                    attendanceStatus = changedAttendance,
                                                ),
                                            ),
                                    ),
                                )
                                attendanceApplied.countDown()
                                check(releaseAttendance.await(10, TimeUnit.SECONDS))
                            } finally {
                                MDC.remove("requestId")
                            }
                        }
                    },
                    executor,
                )
            check(attendanceApplied.await(10, TimeUnit.SECONDS))
            assertThat(
                awaitConfirmAfterMutation(
                    executor,
                    previewId,
                    now,
                    currentSelection,
                    releaseAttendance,
                    attendance,
                ),
            ).isInstanceOf(ManualNotificationConfirmAttempt.Confirmed::class.java)
        } finally {
            releaseAttendance.countDown()
            executor.shutdownNow()
            restoreAttendanceLockTestState(changedMembershipId, originalState, auditRequestId)
        }
    }

    @Test
    fun `confirm rechecks current content revision after session lock without outbox`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val currentSelection = selection()
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val previewId =
            adapter.insertPreview(
                clubId,
                hostMembershipId,
                "b".repeat(64),
                snapshot.snapshotHash(),
                now.plusMinutes(10),
            )
        val originalDate =
            jdbcTemplate.queryForObject(
                "select session_date from sessions where club_id = ? and id = ?",
                java.time.LocalDate::class.java,
                clubId.toString(),
                sessionId.toString(),
            )
        requireNotNull(originalDate)

        try {
            jdbcTemplate.update(
                "update sessions set session_date = ? where club_id = ? and id = ?",
                originalDate.plusDays(1),
                clubId.toString(),
                sessionId.toString(),
            )

            val attempt =
                confirm(
                    previewId,
                    now,
                    currentSelection,
                    selectionHash = "b".repeat(64),
                )

            assertThat(attempt)
                .isEqualTo(
                    ManualNotificationConfirmAttempt.Rejected(
                        ManualNotificationConfirmRejection.CONTENT_REVISION_STALE,
                    ),
                )
            assertThat(revisionManualDispatchCount(currentSelection.contentRevision)).isZero()
        } finally {
            jdbcTemplate.update(
                "update sessions set session_date = ? where club_id = ? and id = ?",
                originalDate,
                clubId.toString(),
                sessionId.toString(),
            )
        }
    }

    @Test
    fun `confirm rejects when host role is revoked after preview without outbox`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val currentSelection = selection()
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val previewId =
            adapter.insertPreview(
                clubId,
                hostMembershipId,
                "a".repeat(64),
                snapshot.snapshotHash(),
                now.plusMinutes(10),
            )

        try {
            jdbcTemplate.update(
                "update memberships set role = 'MEMBER' where club_id = ? and id = ?",
                clubId.toString(),
                hostMembershipId.toString(),
            )

            val attempt = confirm(previewId, now, currentSelection)

            assertThat(attempt)
                .isEqualTo(
                    ManualNotificationConfirmAttempt.Rejected(
                        ManualNotificationConfirmRejection.HOST_NOT_AUTHORIZED,
                    ),
                )
            assertThat(previewManualDispatchCount(previewId)).isZero()
        } finally {
            jdbcTemplate.update(
                "update memberships set role = 'HOST' where club_id = ? and id = ?",
                clubId.toString(),
                hostMembershipId.toString(),
            )
        }
    }

    @Test
    fun `confirm rejects when selected membership becomes inactive after preview without outbox`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val selectedMembershipId = membershipId("member1@example.com")
        val currentSelection =
            selection().copy(
                audience = ManualNotificationAudience.SELECTED_MEMBERS,
                selectedMembershipIds = listOf(selectedMembershipId),
            )
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val previewId =
            adapter.insertPreview(
                clubId,
                hostMembershipId,
                "a".repeat(64),
                snapshot.snapshotHash(),
                now.plusMinutes(10),
            )

        try {
            jdbcTemplate.update(
                "update memberships set status = 'INACTIVE' where club_id = ? and id = ?",
                clubId.toString(),
                selectedMembershipId.toString(),
            )

            val attempt = confirm(previewId, now, currentSelection)

            assertThat(attempt)
                .isEqualTo(
                    ManualNotificationConfirmAttempt.Rejected(
                        ManualNotificationConfirmRejection.RECIPIENT_INVALID,
                    ),
                )
            assertThat(previewManualDispatchCount(previewId)).isZero()
        } finally {
            jdbcTemplate.update(
                "update memberships set status = 'ACTIVE' where club_id = ? and id = ?",
                clubId.toString(),
                selectedMembershipId.toString(),
            )
        }
    }

    @Test
    fun `confirm rejects when attendance eligibility changes after preview without outbox`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val feedbackRevision =
            requireNotNull(
                adapter
                    .findSessionContext(clubId, sessionId)
                    ?.contentRevision(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED),
            )
        val currentSelection =
            selection().copy(
                eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
                contentRevision = feedbackRevision,
                audience = ManualNotificationAudience.CONFIRMED_ATTENDEES,
            )
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val changedMembershipId = membershipId("member1@example.com")
        val previewId =
            adapter.insertPreview(
                clubId,
                hostMembershipId,
                "a".repeat(64),
                snapshot.snapshotHash(),
                now.plusMinutes(10),
            )

        try {
            jdbcTemplate.update(
                """
                update session_participants
                set attendance_status = 'ABSENT'
                where club_id = ? and session_id = ? and membership_id = ?
                """.trimIndent(),
                clubId.toString(),
                sessionId.toString(),
                changedMembershipId.toString(),
            )

            val attempt = confirm(previewId, now, currentSelection)

            assertThat(attempt)
                .isEqualTo(
                    ManualNotificationConfirmAttempt.Rejected(
                        ManualNotificationConfirmRejection.RECIPIENTS_CHANGED,
                    ),
                )
            assertThat(previewManualDispatchCount(previewId)).isZero()
        } finally {
            jdbcTemplate.update(
                """
                update session_participants
                set attendance_status = 'ATTENDED'
                where club_id = ? and session_id = ? and membership_id = ?
                """.trimIndent(),
                clubId.toString(),
                sessionId.toString(),
                changedMembershipId.toString(),
            )
        }
    }

    @Test
    fun `confirm rejects when recipient preference changes after preview without outbox`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val changedMembershipId = membershipId("member1@example.com")
        val originalPreference = mutableReplayState(changedMembershipId).preference
        val currentSelection = selection(requestedChannels = ManualNotificationRequestedChannels.EMAIL)
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val previewId =
            adapter.insertPreview(
                clubId,
                hostMembershipId,
                "a".repeat(64),
                snapshot.snapshotHash(),
                now.plusMinutes(10),
            )

        try {
            disablePreference("member1@example.com")

            val attempt = confirm(previewId, now, currentSelection)

            assertThat(attempt)
                .isEqualTo(
                    ManualNotificationConfirmAttempt.Rejected(
                        ManualNotificationConfirmRejection.RECIPIENTS_CHANGED,
                    ),
                )
            assertThat(previewManualDispatchCount(previewId)).isZero()
        } finally {
            restorePreference(changedMembershipId, originalPreference)
        }
    }

    private fun insertManualDispatchFixture() =
        adapter.insertManualDispatch(
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selection = selection(),
            payload =
                NotificationEventPayload(
                    sessionId = sessionId,
                    sessionNumber = 7,
                    bookTitle = "Example Book",
                    manualDispatch =
                        NotificationManualDispatchPayload(
                            id = UUID.nameUUIDFromBytes("manual-dispatch-list".toByteArray()),
                            source = NotificationDispatchSource.MANUAL,
                            requestedByMembershipId = hostMembershipId,
                            requestedChannels = ManualNotificationRequestedChannels.BOTH,
                            audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                            contentRevision = reminderRevision(),
                            resend = true,
                            sendMode = ManualNotificationSendMode.NOW,
                        ),
                ),
            targetSnapshot = ManualNotificationTargetSnapshot(3, 0, 0, 3, 3, 2, 1, 0),
            resend = true,
        )

    private fun selection(
        sessionId: UUID = this.sessionId,
        requestedChannels: ManualNotificationRequestedChannels = ManualNotificationRequestedChannels.BOTH,
        excludedMembershipIds: List<UUID> = emptyList(),
        includedMembershipIds: List<UUID> = emptyList(),
    ) = ManualNotificationSelection(
        sessionId = sessionId,
        eventType = NotificationEventType.SESSION_REMINDER_DUE,
        contentRevision = reminderRevision(sessionId),
        audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
        requestedChannels = requestedChannels,
        excludedMembershipIds = excludedMembershipIds,
        includedMembershipIds = includedMembershipIds,
        sendMode = ManualNotificationSendMode.NOW,
    )

    private fun reminderRevision(sessionId: UUID = this.sessionId): String =
        requireNotNull(
            adapter
                .findSessionContext(clubId, sessionId)
                ?.contentRevision(NotificationEventType.SESSION_REMINDER_DUE),
        )

    private fun confirm(
        previewId: UUID,
        now: OffsetDateTime,
        selection: ManualNotificationSelection,
        selectionHash: String = "a".repeat(64),
    ): ManualNotificationConfirmAttempt =
        adapter.confirmManualDispatch(
            ManualNotificationConfirmTransactionInput(
                previewId = previewId,
                clubId = clubId,
                hostMembershipId = hostMembershipId,
                selectionHash = selectionHash,
                now = now,
                selection = selection,
                resendConfirmed = false,
            ),
        )

    private fun confirmed(
        attempt: ManualNotificationConfirmAttempt,
    ): com.readmates.notification.application.port.out.ManualNotificationConfirmedDispatch {
        assertThat(attempt)
            .describedAs("confirmation attempt")
            .isInstanceOf(ManualNotificationConfirmAttempt.Confirmed::class.java)
        return (attempt as ManualNotificationConfirmAttempt.Confirmed).dispatch
    }

    private fun mutableReplayState(membershipId: UUID): MutableReplayState {
        val date =
            jdbcTemplate.queryForObject(
                "select session_date from sessions where club_id = ? and id = ?",
                LocalDate::class.java,
                clubId.toString(),
                sessionId.toString(),
            )
        val membershipStatus =
            jdbcTemplate.queryForObject(
                "select status from memberships where club_id = ? and id = ?",
                String::class.java,
                clubId.toString(),
                membershipId.toString(),
            )
        val preference =
            jdbcTemplate
                .query(
                    """
                    select email_enabled, session_reminder_due_enabled
                    from notification_preferences
                    where club_id = ? and membership_id = ?
                    """.trimIndent(),
                    { rs, _ -> rs.getBoolean("email_enabled") to rs.getBoolean("session_reminder_due_enabled") },
                    clubId.toString(),
                    membershipId.toString(),
                ).singleOrNull()
        return MutableReplayState(requireNotNull(date), requireNotNull(membershipStatus), preference)
    }

    private fun makeReplayStateIneligible(
        membershipId: UUID,
        changedDate: LocalDate,
    ) {
        jdbcTemplate.update(
            "update sessions set session_date = ? where club_id = ? and id = ?",
            changedDate,
            clubId.toString(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            "update memberships set status = 'INACTIVE' where club_id = ? and id = ?",
            clubId.toString(),
            membershipId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into notification_preferences (membership_id, club_id, email_enabled, session_reminder_due_enabled)
            values (?, ?, false, false)
            on duplicate key update email_enabled = false, session_reminder_due_enabled = false
            """.trimIndent(),
            membershipId.toString(),
            clubId.toString(),
        )
    }

    private fun restoreMutableReplayState(
        membershipId: UUID,
        state: MutableReplayState,
    ) {
        jdbcTemplate.update(
            "update sessions set session_date = ? where club_id = ? and id = ?",
            state.date,
            clubId.toString(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            "update memberships set status = ? where club_id = ? and id = ?",
            state.membershipStatus,
            clubId.toString(),
            membershipId.toString(),
        )
        restorePreference(membershipId, state.preference)
    }

    private fun restorePreference(
        membershipId: UUID,
        preference: Pair<Boolean, Boolean>?,
    ) {
        if (preference == null) {
            jdbcTemplate.update(
                "delete from notification_preferences where club_id = ? and membership_id = ?",
                clubId.toString(),
                membershipId.toString(),
            )
            return
        }
        jdbcTemplate.update(
            """
            update notification_preferences
            set email_enabled = ?, session_reminder_due_enabled = ?
            where club_id = ? and membership_id = ?
            """.trimIndent(),
            preference.first,
            preference.second,
            clubId.toString(),
            membershipId.toString(),
        )
    }

    private fun disablePreference(email: String) {
        val membershipId = membershipId(email)
        jdbcTemplate.update(
            """
            insert into notification_preferences (membership_id, club_id, email_enabled, session_reminder_due_enabled)
            values (?, ?, false, false)
            on duplicate key update email_enabled = false, session_reminder_due_enabled = false
            """.trimIndent(),
            membershipId.toString(),
            clubId.toString(),
        )
    }

    private fun membershipId(email: String): UUID =
        UUID.fromString(
            jdbcTemplate.queryForObject(
                """
                select memberships.id
                from memberships
                join users on users.id = memberships.user_id
                where memberships.club_id = ?
                  and users.email = ?
                """.trimIndent(),
                String::class.java,
                clubId.toString(),
                email,
            )!!,
        )

    private fun eventCount(eventId: UUID): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_event_outbox where id = ?",
            Int::class.java,
            eventId.toString(),
        ) ?: 0

    private fun manualDispatchCount(dispatchId: UUID): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_manual_dispatches where id = ?",
            Int::class.java,
            dispatchId.toString(),
        ) ?: 0

    private fun previewManualDispatchCount(previewId: UUID): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_manual_dispatches where preview_id = ?",
            Int::class.java,
            previewId.toString(),
        ) ?: 0

    private fun revisionManualDispatchCount(
        contentRevision: String,
        sessionId: UUID = this.sessionId,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_manual_dispatches
            where club_id = ?
              and session_id = ?
              and event_type = ?
              and content_revision = ?
            """.trimIndent(),
            Int::class.java,
            clubId.toString(),
            sessionId.toString(),
            NotificationEventType.SESSION_REMINDER_DUE.name,
            contentRevision,
        ) ?: 0

    private fun insertLockTestPreview(
        now: OffsetDateTime,
        currentSelection: ManualNotificationSelection,
    ): UUID {
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        return adapter.insertPreview(
            clubId,
            hostMembershipId,
            "a".repeat(64),
            snapshot.snapshotHash(),
            now.plusMinutes(10),
        )
    }

    private fun awaitConfirmAfterMutation(
        executor: java.util.concurrent.Executor,
        previewId: UUID,
        now: OffsetDateTime,
        currentSelection: ManualNotificationSelection,
        releaseMutation: CountDownLatch,
        mutation: CompletableFuture<Void>,
    ): ManualNotificationConfirmAttempt {
        val confirmStarted = CountDownLatch(1)
        val confirmation =
            CompletableFuture.supplyAsync(
                {
                    confirmStarted.countDown()
                    confirm(previewId, now, currentSelection)
                },
                executor,
            )
        check(confirmStarted.await(10, TimeUnit.SECONDS))
        assertThatThrownBy { confirmation.get(250, TimeUnit.MILLISECONDS) }
            .isInstanceOf(TimeoutException::class.java)
        assertMutationOwnsClubBeforeConfirmReachesPreview(previewId)

        releaseMutation.countDown()
        mutation.get(10, TimeUnit.SECONDS)
        return confirmation.get(10, TimeUnit.SECONDS)
    }

    private fun participantStatus(
        column: String,
        membershipId: UUID,
    ): String {
        check(column == "participation_status" || column == "attendance_status")
        return jdbcTemplate.queryForObject(
            """
            select $column
            from session_participants
            where club_id = ? and session_id = ? and membership_id = ?
            """.trimIndent(),
            String::class.java,
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )!!
    }

    private fun assertMutationOwnsClubBeforeConfirmReachesPreview(previewId: UUID) {
        openProbeConnection().use { connection ->
            connection.autoCommit = false
            assertThatThrownBy {
                connection.prepareStatement("select id from clubs where id = ? for update nowait").use { statement ->
                    statement.setString(1, clubId.toString())
                    statement.executeQuery().use { it.next() }
                }
            }.isInstanceOf(SQLException::class.java)
            connection.rollback()
        }
        openProbeConnection().use { connection ->
            connection.autoCommit = false
            connection
                .prepareStatement(
                    "select id from notification_manual_dispatch_previews where id = ? for update nowait",
                ).use { statement ->
                    statement.setString(1, previewId.toString())
                    statement.executeQuery().use { resultSet ->
                        assertThat(resultSet.next()).isTrue()
                        assertThat(resultSet.getString("id")).isEqualTo(previewId.toString())
                    }
                }
            connection.rollback()
        }
    }

    private fun openProbeConnection(): Connection =
        DriverManager.getConnection(
            environment.getRequiredProperty("spring.datasource.url"),
            environment.getRequiredProperty("spring.datasource.username"),
            environment.getRequiredProperty("spring.datasource.password"),
        )

    private fun viewerActivationState(membershipId: UUID): ViewerActivationState =
        jdbcTemplate.queryForObject(
            """
            select
              memberships.status,
              memberships.joined_at,
              memberships.updated_at,
              session_participants.participation_status,
              session_participants.updated_at as participant_updated_at
            from memberships
            join session_participants
              on session_participants.club_id = memberships.club_id
             and session_participants.membership_id = memberships.id
             and session_participants.session_id = ?
            where memberships.club_id = ? and memberships.id = ?
            """.trimIndent(),
            { rs, _ ->
                ViewerActivationState(
                    status = rs.getString("status"),
                    joinedAt = rs.getObject("joined_at", LocalDateTime::class.java),
                    updatedAt = rs.getObject("updated_at", LocalDateTime::class.java),
                    participationStatus = rs.getString("participation_status"),
                    participantUpdatedAt = rs.getObject("participant_updated_at", LocalDateTime::class.java),
                )
            },
            sessionId.toString(),
            clubId.toString(),
            membershipId.toString(),
        )

    private fun restoreViewerActivationState(
        membershipId: UUID,
        state: ViewerActivationState,
    ) {
        jdbcTemplate.update(
            """
            update memberships
            set status = ?, joined_at = ?, updated_at = ?
            where club_id = ? and id = ?
            """.trimIndent(),
            state.status,
            state.joinedAt,
            state.updatedAt,
            clubId.toString(),
            membershipId.toString(),
        )
        jdbcTemplate.update(
            """
            update session_participants
            set participation_status = ?, updated_at = ?
            where club_id = ? and session_id = ? and membership_id = ?
            """.trimIndent(),
            state.participationStatus,
            state.participantUpdatedAt,
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )
    }

    private fun attendanceState(membershipId: UUID): AttendanceState =
        jdbcTemplate.queryForObject(
            """
            select attendance_status, updated_at
            from session_participants
            where club_id = ? and session_id = ? and membership_id = ?
            """.trimIndent(),
            { rs, _ ->
                AttendanceState(
                    status = rs.getString("attendance_status"),
                    updatedAt = rs.getObject("updated_at", LocalDateTime::class.java),
                )
            },
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )

    private fun restoreAttendanceState(
        membershipId: UUID,
        state: AttendanceState,
    ) {
        jdbcTemplate.update(
            """
            update session_participants
            set attendance_status = ?, updated_at = ?
            where club_id = ? and session_id = ? and membership_id = ?
            """.trimIndent(),
            state.status,
            state.updatedAt,
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )
    }

    private fun restoreAttendanceLockTestState(
        membershipId: UUID,
        state: AttendanceState,
        auditRequestId: String,
    ) {
        restoreAttendanceState(membershipId, state)
        jdbcTemplate.update(
            "delete from host_session_change_audit where request_id = ?",
            auditRequestId,
        )
    }

    private fun restoreLifecycleLockTestState(
        membershipId: UUID,
        originalParticipation: String,
    ) {
        jdbcTemplate.update(
            "update memberships set status = 'ACTIVE' where club_id = ? and id = ?",
            clubId.toString(),
            membershipId.toString(),
        )
        jdbcTemplate.update(
            """
            update session_participants
            set participation_status = ?
            where club_id = ? and session_id = ? and membership_id = ?
            """.trimIndent(),
            originalParticipation,
            clubId.toString(),
            sessionId.toString(),
            membershipId.toString(),
        )
    }

    private data class MutableReplayState(
        val date: LocalDate,
        val membershipStatus: String,
        val preference: Pair<Boolean, Boolean>?,
    )

    private data class ViewerActivationState(
        val status: String,
        val joinedAt: LocalDateTime?,
        val updatedAt: LocalDateTime?,
        val participationStatus: String,
        val participantUpdatedAt: LocalDateTime?,
    )

    private data class AttendanceState(
        val status: String,
        val updatedAt: LocalDateTime?,
    )
}
