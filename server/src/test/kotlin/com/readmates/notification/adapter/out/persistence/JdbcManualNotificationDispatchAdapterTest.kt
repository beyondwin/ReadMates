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
import com.readmates.notification.application.port.out.targetSnapshotRevision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.service.HostSessionAttendanceService
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.Sha256
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.toClubActor
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
import java.nio.file.Files
import java.nio.file.Path
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
    set state = 'PUBLISHED', visibility = 'PUBLIC', access_scope = 'GUEST_READABLE'
    where club_id = '00000000-0000-0000-0000-000000000001'
      and id in (
        '00000000-0000-0000-0000-000000000301',
        '00000000-0000-0000-0000-000000000302'
      );
    update public_projection_current
    set origin_readable = true
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        '00000000-0000-0000-0000-000000000301',
        '00000000-0000-0000-0000-000000000302'
      )
      and emergency_denied = false;
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
    fun `confirmation locks the session row before insertOutbox`() {
        val source = confirmStoreSource()
        val lockIndex =
            source.indexOf("findSessionContext(input.clubId, input.selection.sessionId, forUpdate = true)")
        val insertIndex = source.indexOf("writer.insertOutbox(")
        assertThat(lockIndex).isGreaterThanOrEqualTo(0)
        assertThat(insertIndex).isGreaterThan(lockIndex)
    }

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
        val emailDisabledMemberId = membershipId("member1@example.com")
        val originalPreference = mutableReplayState(emailDisabledMemberId).preference
        val excludedMemberId = membershipId("member2@example.com")
        try {
            disablePreference("member1@example.com")
            val selection =
                selection(
                    excludedMembershipIds = listOf(excludedMemberId),
                    includedMembershipIds = emptyList(),
                )

            val snapshot = adapter.previewTargets(clubId, selection)

            assertThat(snapshot.baseCount).isEqualTo(6)
            assertThat(snapshot.finalTargetCount).isEqualTo(5)
            assertThat(snapshot.excludedCount).isEqualTo(1)
            assertThat(snapshot.inAppEligibleCount).isEqualTo(5)
            assertThat(snapshot.emailEligibleCount).isEqualTo(4)
            assertThat(snapshot.emailSkippedByPreferenceCount).isEqualTo(1)
            assertThat(snapshot.emailMissingCount).isZero()
            assertThat(snapshot.targetMembershipIds).hasSize(snapshot.finalTargetCount)
            assertThat(snapshot.inAppMembershipIds).hasSize(snapshot.inAppEligibleCount)
            assertThat(snapshot.emailMembershipIds).hasSize(snapshot.emailEligibleCount)
            assertThat(snapshot.targetMembershipIds).contains(emailDisabledMemberId).doesNotContain(excludedMemberId)
            assertThat(snapshot.inAppMembershipIds).contains(emailDisabledMemberId)
            assertThat(snapshot.emailMembershipIds).doesNotContain(emailDisabledMemberId)
        } finally {
            restorePreference(emailDisabledMemberId, originalPreference)
        }
    }

    @Test
    fun `previewTargets freezes only email eligible ids for email only requests`() {
        val changedMembershipId = membershipId("member1@example.com")
        val originalPreference = mutableReplayState(changedMembershipId).preference
        try {
            disablePreference("member1@example.com")
            val snapshot =
                adapter.previewTargets(
                    clubId,
                    selection(requestedChannels = ManualNotificationRequestedChannels.EMAIL),
                )

            assertThat(snapshot.inAppMembershipIds).isEmpty()
            assertThat(snapshot.emailMembershipIds).hasSize(snapshot.emailEligibleCount)
            assertThat(snapshot.targetMembershipIds).hasSize(snapshot.finalTargetCount)
        } finally {
            restorePreference(changedMembershipId, originalPreference)
        }
    }

    @Test
    fun `previewTargets keeps all active recipients eligible for in app only requests`() {
        val changedMembershipId = membershipId("member1@example.com")
        val originalPreference = mutableReplayState(changedMembershipId).preference
        try {
            disablePreference("member1@example.com")

            val snapshot =
                adapter.previewTargets(
                    clubId,
                    selection(requestedChannels = ManualNotificationRequestedChannels.IN_APP),
                )

            assertThat(snapshot.finalTargetCount).isEqualTo(6)
            assertThat(snapshot.inAppEligibleCount).isEqualTo(6)
            assertThat(snapshot.emailEligibleCount).isZero()
            assertThat(snapshot.emailSkippedByPreferenceCount).isZero()
            assertThat(snapshot.emailMissingCount).isZero()
            assertThat(snapshot.inAppMembershipIds).contains(changedMembershipId)
            assertThat(snapshot.emailMembershipIds).isEmpty()
        } finally {
            restorePreference(changedMembershipId, originalPreference)
        }
    }

    @Test
    fun `preview target hash remains byte stable for the seeded audience`() {
        val snapshot = adapter.previewTargets(clubId, selection())

        assertThat(snapshot.snapshotHash())
            .isEqualTo("89613ad89b63f48a69300f5986783c5b779272de3aa2d0248592452d43863d58")
    }

    @Test
    fun `SESSION_PARTICIPANTS uses the active participant snapshot and participant set revision`() {
        val removedMembershipId = membershipId("member1@example.com")
        val originalParticipation = participantStatus("participation_status", removedMembershipId)
        val originalRevision =
            jdbcTemplate.queryForObject(
                "select participant_set_revision from sessions where id = ?",
                Long::class.java,
                sessionId.toString(),
            ) ?: 0
        try {
            jdbcTemplate.update(
                """
                update session_participants
                set participation_status = 'REMOVED'
                where club_id = ? and session_id = ? and membership_id = ?
                """.trimIndent(),
                clubId.toString(),
                sessionId.toString(),
                removedMembershipId.toString(),
            )
            jdbcTemplate.update(
                "update sessions set participant_set_revision = ? where id = ?",
                originalRevision + 1,
                sessionId.toString(),
            )
            val snapshot =
                adapter.previewTargets(
                    clubId,
                    selection().copy(audience = ManualNotificationAudience.SESSION_PARTICIPANTS),
                )
            assertThat(snapshot.targetMembershipIds).doesNotContain(removedMembershipId)
            assertThat(snapshot.audienceRevision).isEqualTo("participantSet:${originalRevision + 1}")
        } finally {
            jdbcTemplate.update(
                """
                update session_participants
                set participation_status = ?
                where club_id = ? and session_id = ? and membership_id = ?
                """.trimIndent(),
                originalParticipation,
                clubId.toString(),
                sessionId.toString(),
                removedMembershipId.toString(),
            )
            jdbcTemplate.update(
                "update sessions set participant_set_revision = ? where id = ?",
                originalRevision,
                sessionId.toString(),
            )
        }
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
    fun `CONFIRMED_ATTENDEES snapshot hash consumes attendance revisions`() {
        val attendeeId = membershipId("host@example.com")
        val originalRevision =
            jdbcTemplate.queryForObject(
                """
                select attendance_revision
                from session_participants
                where session_id = ? and membership_id = ?
                """.trimIndent(),
                Long::class.java,
                sessionId.toString(),
                attendeeId.toString(),
            ) ?: 0
        val before =
            adapter.previewTargets(
                clubId,
                selection().copy(audience = ManualNotificationAudience.CONFIRMED_ATTENDEES),
            )
        try {
            jdbcTemplate.update(
                """
                update session_participants
                set attendance_revision = attendance_revision + 1
                where session_id = ? and membership_id = ?
                """.trimIndent(),
                sessionId.toString(),
                attendeeId.toString(),
            )
            val after =
                adapter.previewTargets(
                    clubId,
                    selection().copy(audience = ManualNotificationAudience.CONFIRMED_ATTENDEES),
                )
            assertThat(after.audienceRevision).isNotEqualTo(before.audienceRevision)
            assertThat(after.snapshotHash()).isNotEqualTo(before.snapshotHash())
        } finally {
            jdbcTemplate.update(
                """
                update session_participants
                set attendance_revision = ?
                where session_id = ? and membership_id = ?
                """.trimIndent(),
                originalRevision,
                sessionId.toString(),
                attendeeId.toString(),
            )
        }
    }

    @Test
    fun `seven confirmed attendees preview and confirm with a fixed length snapshot revision`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val addedAttendees = insertAdditionalConfirmedAttendees(4)
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
                requestedChannels = ManualNotificationRequestedChannels.IN_APP,
                subject = "확정 참석자 안내",
                body = "참석이 확인된 멤버에게 보내는 안내입니다.",
            )

        try {
            val snapshot = adapter.previewTargets(clubId, currentSelection)
            val context = requireNotNull(adapter.findSessionContext(clubId, sessionId))
            assertThat(snapshot.finalTargetCount).isEqualTo(7)
            assertThat(snapshot.audienceRevision).matches("^attendance:[0-9a-f]{64}$")

            val previewId =
                insertSnapshotPreview(
                    now.plusMinutes(10),
                    currentSelection,
                    snapshot,
                    context.scheduleRevision,
                    "7".repeat(64),
                )
            val preview = requireNotNull(adapter.findPreview(previewId, clubId, hostMembershipId))
            val dispatch = confirmed(confirm(previewId, now, currentSelection))

            assertThat(preview.targetSnapshotRevision).matches("^[0-9a-f]{64}$")
            assertThat(dispatch.summary.targetCount).isEqualTo(7)
            assertThat(previewManualDispatchCount(previewId)).isOne()
        } finally {
            deleteAdditionalConfirmedAttendees(addedAttendees)
        }
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
        assertThat(page.items.single().maskedEmail).isEqualTo("m***@example.com")
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
        assertThat(page.items.single { it.manualDispatchId == stored.manualDispatchId }.requestedBy)
            .isEqualTo("h***@example.com")
    }

    @Test
    fun `listDispatches continues without duplicate ids`() {
        val storedIds =
            (1..3)
                .map { index -> insertManualDispatchFixture("manual-dispatch-page-$index").manualDispatchId }
                .toSet()

        val first =
            adapter.listDispatches(
                clubId,
                sessionId,
                NotificationEventType.SESSION_REMINDER_DUE,
                PageRequest.cursor(2, null, defaultLimit = 50, maxLimit = 100),
            )
        val second =
            adapter.listDispatches(
                clubId,
                sessionId,
                NotificationEventType.SESSION_REMINDER_DUE,
                PageRequest.cursor(2, first.nextCursor, defaultLimit = 50, maxLimit = 100),
            )

        assertThat(first.items).hasSize(2)
        assertThat(first.nextCursor).isNotBlank()
        assertThat(second.items).hasSize(1)
        assertThat(second.nextCursor).isNull()
        assertThat(first.items.map { it.manualDispatchId }).doesNotContainAnyElementsOf(
            second.items.map { it.manualDispatchId },
        )
        assertThat((first.items + second.items).map { it.manualDispatchId })
            .containsExactlyInAnyOrderElementsOf(storedIds)
    }

    @Test
    fun `insertPreview and findPreview round trip host scoped preview`() {
        val expiresAt = OffsetDateTime.of(2026, 5, 13, 9, 10, 0, 0, ZoneOffset.UTC)

        val selectionHash = "388bfc07eacd106f40fd7d98d76d77e66b1226e28bf3bb4b34519b32fe6ffb36"
        val targetSnapshotHash = "89613ad89b63f48a69300f5986783c5b779272de3aa2d0248592452d43863d58"
        val id = adapter.insertPreview(clubId, hostMembershipId, selectionHash, targetSnapshotHash, expiresAt)
        val record = adapter.findPreview(id, clubId, hostMembershipId)

        assertThat(record!!.selectionHash).isEqualTo(selectionHash)
        assertThat(record.targetSnapshotHash).isEqualTo(targetSnapshotHash)
        assertThat(record.expiresAt).isEqualTo(expiresAt)
    }

    @Test
    fun `insertPreview freezes schedule target evidence and exact custom copy`() {
        val expiresAt = OffsetDateTime.of(2026, 5, 13, 9, 10, 0, 0, ZoneOffset.UTC)
        val currentSelection = selection().copy(subject = "  운영 제목  ", body = "첫 줄\n둘째 줄")
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val context = requireNotNull(adapter.findSessionContext(clubId, sessionId))
        val contentHash = "c".repeat(64)
        val id = insertSnapshotPreview(expiresAt, currentSelection, snapshot, context.scheduleRevision, contentHash)

        val record = requireNotNull(adapter.findPreview(id, clubId, hostMembershipId))

        assertThat(record.scheduleRevision).isEqualTo(context.scheduleRevision)
        assertThat(record.targetMembershipIds).containsExactlyElementsOf(snapshot.targetMembershipIds)
        assertThat(record.targetSnapshotRevision).isEqualTo(snapshot.targetSnapshotRevision())
        assertThat(record.eligibilityFingerprint).isEqualTo(eligibilityFingerprint(snapshot))
        assertThat(record.subject).isEqualTo(currentSelection.subject)
        assertThat(record.body).isEqualTo(currentSelection.body)
        assertThat(record.contentHash).isEqualTo(contentHash)
    }

    @Test
    fun `confirm dispatch payload uses exact preview copy without exposing a mutable template`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val currentSelection = selection().copy(subject = "호스트가 고친 제목", body = "정확한 첫 줄\n정확한 둘째 줄")
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val context = requireNotNull(adapter.findSessionContext(clubId, sessionId))
        val contentHash = "d".repeat(64)
        val previewId = insertSnapshotPreview(now.plusMinutes(10), currentSelection, snapshot, context.scheduleRevision, contentHash)

        val dispatch = confirmed(confirm(previewId, now, currentSelection))
        val payload =
            requireNotNull(
                jdbcTemplate.queryForObject(
                    "select payload_json from notification_event_outbox where id = ?",
                    String::class.java,
                    dispatch.eventId.toString(),
                ),
            )

        assertThat(payload).contains("\"subject\": \"호스트가 고친 제목\"")
        assertThat(payload).contains("\"body\": \"정확한 첫 줄\\n정확한 둘째 줄\"")
        assertThat(payload).contains("\"contentHash\": \"$contentHash\"")
    }

    @Test
    fun `confirm rejects schedule drift as stale before outbox or dispatch`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val currentSelection = selection().copy(subject = "일정 고정 제목", body = "일정 고정 본문")
        val snapshot = adapter.previewTargets(clubId, currentSelection)
        val context = requireNotNull(adapter.findSessionContext(clubId, sessionId))
        val previewId = insertSnapshotPreview(now.plusMinutes(10), currentSelection, snapshot, context.scheduleRevision, "e".repeat(64))

        jdbcTemplate.update(
            "update sessions set schedule_revision = schedule_revision + 1 where club_id = ? and id = ?",
            clubId.toString(),
            sessionId.toString(),
        )

        val attempt = confirm(previewId, now, currentSelection)

        assertThat(attempt).isEqualTo(
            ManualNotificationConfirmAttempt.Rejected(ManualNotificationConfirmRejection.PREVIEW_STALE),
        )
        assertThat(previewManualDispatchCount(previewId)).isZero()
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from notification_event_outbox where dedupe_key like 'manual:%:preview:$previewId'",
                Int::class.java,
            ),
        ).isZero()
    }

    @Test
    fun `confirm waits for the preview row lock before consuming it`() {
        val now = OffsetDateTime.of(2026, 7, 23, 0, 0, 0, 0, ZoneOffset.UTC)
        val currentSelection = selection()
        val previewId = insertLockTestPreview(now, currentSelection)
        val executor = Executors.newSingleThreadExecutor()

        openProbeConnection().use { sessionLock ->
            sessionLock.autoCommit = false
            sessionLock
                .prepareStatement(
                    "select id from memberships where club_id = ? for update",
                ).use { statement ->
                    statement.setString(1, clubId.toString())
                    statement.executeQuery().use { resultSet -> assertThat(resultSet.next()).isTrue() }
                }
            val confirmation =
                CompletableFuture.supplyAsync(
                    { confirm(previewId, now, currentSelection) },
                    executor,
                )

            try {
                assertThatThrownBy { confirmation.get(250, TimeUnit.MILLISECONDS) }
                    .isInstanceOf(TimeoutException::class.java)
                assertConfirmOwnsPreviewRow(previewId)
                sessionLock.commit()

                val stored = confirmed(confirmation.get(10, TimeUnit.SECONDS))
                assertThat(stored.status).isEqualTo(ManualNotificationConfirmInsertStatus.CREATED)
                assertThat(eventCount(stored.eventId)).isEqualTo(1)
                assertThat(previewManualDispatchCount(previewId)).isEqualTo(1)
            } finally {
                if (!sessionLock.autoCommit) {
                    sessionLock.rollback()
                }
                executor.shutdownNow()
            }
        }
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
            assertThat(first.manualDispatchId).isEqualTo(second.manualDispatchId)
            assertThat(first.createdAt).isEqualTo(second.createdAt)
            assertThat(second.summary).isEqualTo(first.summary)
            assertThat(second.summary.targetCount).isEqualTo(snapshot.finalTargetCount)
            assertThat(second.summary.expectedInAppCount).isEqualTo(snapshot.inAppEligibleCount)
            assertThat(second.summary.expectedEmailCount).isEqualTo(snapshot.emailEligibleCount)
            assertThat(eventCount(first.eventId)).isEqualTo(1)
            assertThat(previewManualDispatchCount(previewId)).isEqualTo(1)
            assertThat(first.summary).isNotNull
            assertThat(second.manualDispatchId).isEqualTo(first.manualDispatchId)
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
                                host.toClubActor(),
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
                    ManualNotificationConfirmRejection.PREVIEW_STALE,
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
                            memberApprovalService.activateViewer(host.toClubActor(), changedMembershipId)
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
                    ManualNotificationConfirmRejection.PREVIEW_STALE,
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
                                                    expectedAttendanceRevision = 0,
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
                        ManualNotificationConfirmRejection.PREVIEW_STALE,
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
                        ManualNotificationConfirmRejection.PREVIEW_STALE,
                    ),
                )
            assertThat(previewManualDispatchCount(previewId)).isZero()
        } finally {
            restorePreference(changedMembershipId, originalPreference)
        }
    }

    private fun confirmStoreSource(): String {
        val sourceRoot =
            listOf(Path.of("src/main/kotlin"), Path.of("server/src/main/kotlin"))
                .first(Files::exists)
        return Files.readString(
            sourceRoot.resolve("com/readmates/notification/adapter/out/persistence/ManualNotificationConfirmStore.kt"),
        )
    }

    private fun insertManualDispatchFixture(identitySeed: String = "manual-dispatch-list") =
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
                            id = UUID.nameUUIDFromBytes(identitySeed.toByteArray()),
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

    private fun insertSnapshotPreview(
        expiresAt: OffsetDateTime,
        selection: ManualNotificationSelection,
        snapshot: ManualNotificationTargetSnapshot,
        scheduleRevision: Long,
        contentHash: String,
    ): UUID =
        adapter.insertPreview(
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selectionHash = "a".repeat(64),
            targetSnapshotHash = snapshot.snapshotHash(),
            scheduleRevision = scheduleRevision,
            targetSnapshotRevision = snapshot.targetSnapshotRevision(),
            targetMembershipIds = snapshot.targetMembershipIds,
            eligibilityFingerprint = eligibilityFingerprint(snapshot),
            subject = selection.subject,
            body = selection.body,
            contentHash = contentHash,
            expiresAt = expiresAt,
        )

    private fun eligibilityFingerprint(snapshot: ManualNotificationTargetSnapshot): String =
        Sha256.hex(
            listOf(snapshot.inAppMembershipIds.sorted(), snapshot.emailMembershipIds.sorted(), snapshot.audienceRevision)
                .joinToString("|"),
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

    private fun insertAdditionalConfirmedAttendees(count: Int): List<Triple<UUID, UUID, UUID>> =
        (1..count).map { index ->
            val userId = UUID.nameUUIDFromBytes("manual-large-attendee-user-$index".toByteArray())
            val membershipId = UUID.nameUUIDFromBytes("manual-large-attendee-membership-$index".toByteArray())
            val participantId = UUID.nameUUIDFromBytes("manual-large-attendee-participant-$index".toByteArray())
            jdbcTemplate.update(
                """
                insert into users (id, google_subject_id, email, name, short_name, auth_provider)
                values (?, ?, ?, ?, ?, 'GOOGLE')
                """.trimIndent(),
                userId.toString(),
                "manual-large-attendee-$index",
                "manual-large-attendee-$index@example.test",
                "대상 멤버 $index",
                "대상$index",
            )
            jdbcTemplate.update(
                """
                insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
                values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), ?, 'mushroom-green-book')
                """.trimIndent(),
                membershipId.toString(),
                clubId.toString(),
                userId.toString(),
                "대상$index",
            )
            jdbcTemplate.update(
                """
                insert into session_participants (
                  id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
                )
                values (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE')
                """.trimIndent(),
                participantId.toString(),
                clubId.toString(),
                sessionId.toString(),
                membershipId.toString(),
            )
            Triple(userId, membershipId, participantId)
        }

    private fun deleteAdditionalConfirmedAttendees(attendees: List<Triple<UUID, UUID, UUID>>) {
        attendees.asReversed().forEach { (userId, membershipId, participantId) ->
            jdbcTemplate.update("delete from session_participants where id = ?", participantId.toString())
            jdbcTemplate.update("delete from memberships where id = ?", membershipId.toString())
            jdbcTemplate.update("delete from users where id = ?", userId.toString())
        }
    }

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

    private fun assertConfirmOwnsPreviewRow(previewId: UUID) {
        openProbeConnection().use { connection ->
            connection.autoCommit = false
            assertThatThrownBy {
                connection
                    .prepareStatement(
                        "select id from notification_manual_dispatch_previews where id = ? for update nowait",
                    ).use { statement ->
                        statement.setString(1, previewId.toString())
                        statement.executeQuery().use { it.next() }
                    }
            }.isInstanceOf(SQLException::class.java)
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
