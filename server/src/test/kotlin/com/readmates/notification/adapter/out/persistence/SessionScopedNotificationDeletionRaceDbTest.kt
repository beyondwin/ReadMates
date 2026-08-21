package com.readmates.notification.adapter.out.persistence

import com.readmates.auth.domain.MembershipRole
import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.ManualNotificationSendMode
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationManualDispatchPayload
import com.readmates.notification.application.model.NotificationSessionNotFoundException
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.model.HostSessionDeletionBlockedException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.service.HostSessionLifecycleService
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private const val CLEANUP_SESSION_SCOPED_RACE_SQL = """
    delete from notification_manual_dispatches
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id like '00000000-0000-0000-0000-0000000094%';
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-000000000001'
      and aggregate_type = 'SESSION'
      and aggregate_id like '00000000-0000-0000-0000-0000000094%';
    delete from host_action_notification_decisions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id like '00000000-0000-0000-0000-0000000094%';
    delete from host_action_notification_previews
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id like '00000000-0000-0000-0000-0000000094%';
    delete from host_session_lifecycle_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id like '00000000-0000-0000-0000-0000000094%';
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and id like '00000000-0000-0000-0000-0000000094%';
"""

/**
 * Session-scoped durable-effect producers inventoried from
 * `enqueueEvent(`, `insertOutbox(`, and `insertManualDispatch(`:
 *
 * - Confirmed record/feedback/next-book events: NotificationEventService.record* -> enqueueEvent SESSION
 * - Review published: NotificationEventService.recordReviewPublished -> enqueueEvent SESSION
 * - Scheduled reminders: enqueueSessionReminderDue (SESSION aggregate, session-reminder:date:sessionId)
 * - Manual dispatch: ManualNotificationConfirmWriter.insertManualDispatch / insertOutbox SESSION
 * - Host action decisions: JdbcHostActionNotificationAdapter.completeDecision
 * - Session record revisions: lockEditor -> loadLive(..., forUpdate=true) before insertAppliedRevision
 *
 * AI_GENERATION_JOB (recordAiGenerationReady) is not a session aggregate and must not take a SESSION lock.
 */
@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_SESSION_SCOPED_RACE_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SESSION_SCOPED_RACE_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class SessionScopedNotificationDeletionRaceDbTest(
    @param:Autowired private val outboxAdapter: JdbcNotificationEventOutboxAdapter,
    @param:Autowired private val manualDispatchAdapter: JdbcManualNotificationDispatchAdapter,
    @param:Autowired private val lifecycleService: HostSessionLifecycleService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val transactionManager: PlatformTransactionManager,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")
    private val host =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = hostMembershipId,
            clubId = clubId,
            clubSlug = "readmates",
            email = "host@example.com",
            displayName = "김호스트",
            accountName = "김호스트",
            role = MembershipRole.HOST,
        )
    private val effectTemplate = TransactionTemplate(transactionManager)
    private val deleteTemplate = TransactionTemplate(transactionManager)

    @Test
    fun `session outbox cannot commit after its session is deleted`() {
        val sessionId = insertDeletableSession("9401")

        deleteTemplate.execute { lifecycleService.delete(HostSessionIdCommand(host, sessionId)) }

        assertThatThrownBy { enqueueSessionOutbox(sessionId, "race-outbox-after-delete") }
            .isInstanceOf(NotificationSessionNotFoundException::class.java)
        assertThat(orphanSessionAggregateCount(sessionId)).isZero()
        assertThat(sessionExists(sessionId)).isTrue()
        assertThat(sessionIsActive(sessionId)).isFalse()
    }

    @Test
    fun `session outbox then delete is blocked and leaves no orphan`() {
        val sessionId = insertDeletableSession("9402")

        assertThat(enqueueSessionOutbox(sessionId, "race-outbox-before-delete")).isTrue()
        assertThatThrownBy { lifecycleService.delete(HostSessionIdCommand(host, sessionId)) }
            .isInstanceOf(HostSessionDeletionBlockedException::class.java)
        assertThat(orphanSessionAggregateCount(sessionId)).isZero()
        assertThat(sessionExists(sessionId)).isTrue()
    }

    @Test
    @Timeout(30)
    fun `concurrent session outbox and delete serialize to a legal outcome`() {
        val sessionId = insertDeletableSession("9403")
        val outcome =
            race(
                effect = { enqueueSessionOutbox(sessionId, "race-outbox-concurrent") },
                sessionId = sessionId,
            )
        assertThat(outcome).isIn(
            RaceOutcome.EFFECT_COMMITTED_DELETE_BLOCKED,
            RaceOutcome.DELETE_COMMITTED_EFFECT_REJECTED,
        )
        assertThat(orphanSessionAggregateCount(sessionId)).isZero()
    }

    @Test
    fun `manual dispatch cannot commit after its session is deleted`() {
        val sessionId = insertDeletableSession("9404")

        deleteTemplate.execute { lifecycleService.delete(HostSessionIdCommand(host, sessionId)) }

        assertThatThrownBy { insertManualDispatch(sessionId, "race-manual-after-delete") }
            .isInstanceOf(NotificationSessionNotFoundException::class.java)
        assertThat(orphanSessionAggregateCount(sessionId)).isZero()
        assertThat(sessionExists(sessionId)).isTrue()
        assertThat(sessionIsActive(sessionId)).isFalse()
    }

    @Test
    fun `manual dispatch then delete is blocked and leaves no orphan`() {
        val sessionId = insertDeletableSession("9405")

        insertManualDispatch(sessionId, "race-manual-before-delete")
        assertThatThrownBy { lifecycleService.delete(HostSessionIdCommand(host, sessionId)) }
            .isInstanceOf(HostSessionDeletionBlockedException::class.java)
        assertThat(orphanSessionAggregateCount(sessionId)).isZero()
        assertThat(sessionExists(sessionId)).isTrue()
    }

    @Test
    @Timeout(30)
    fun `concurrent manual dispatch and delete serialize to a legal outcome`() {
        val sessionId = insertDeletableSession("9406")
        val outcome =
            race(
                effect = { insertManualDispatch(sessionId, "race-manual-concurrent") },
                sessionId = sessionId,
            )
        assertThat(outcome).isIn(
            RaceOutcome.EFFECT_COMMITTED_DELETE_BLOCKED,
            RaceOutcome.DELETE_COMMITTED_EFFECT_REJECTED,
        )
        assertThat(orphanSessionAggregateCount(sessionId)).isZero()
    }

    private fun race(
        effect: () -> Unit,
        sessionId: UUID,
    ): RaceOutcome {
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        return try {
            val effectFuture =
                executor.submit<Boolean> {
                    ready.countDown()
                    check(start.await(10, TimeUnit.SECONDS))
                    runEffect(effect)
                }
            val deleteFuture =
                executor.submit<DeleteAttempt> {
                    ready.countDown()
                    check(start.await(10, TimeUnit.SECONDS))
                    runDelete(sessionId)
                }
            check(ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            val effectCommitted = effectFuture.get(20, TimeUnit.SECONDS)
            val deleteAttempt = deleteFuture.get(20, TimeUnit.SECONDS)
            when {
                effectCommitted && deleteAttempt == DeleteAttempt.BLOCKED ->
                    RaceOutcome.EFFECT_COMMITTED_DELETE_BLOCKED
                !effectCommitted && deleteAttempt == DeleteAttempt.DELETED ->
                    RaceOutcome.DELETE_COMMITTED_EFFECT_REJECTED
                else ->
                    error(
                        "Illegal race outcome effectCommitted=$effectCommitted " +
                            "deleteAttempt=$deleteAttempt orphans=${orphanSessionAggregateCount(sessionId)}",
                    )
            }
        } finally {
            executor.shutdownNow()
        }
    }

    private fun runEffect(effect: () -> Unit): Boolean =
        try {
            effectTemplate.execute {
                effect()
                true
            } == true
        } catch (_: NotificationSessionNotFoundException) {
            false
        } catch (_: DataIntegrityViolationException) {
            false
        }

    private fun runDelete(sessionId: UUID): DeleteAttempt =
        try {
            deleteTemplate.execute { lifecycleService.delete(HostSessionIdCommand(host, sessionId)) }
            DeleteAttempt.DELETED
        } catch (_: HostSessionDeletionBlockedException) {
            DeleteAttempt.BLOCKED
        } catch (_: DataIntegrityViolationException) {
            DeleteAttempt.BLOCKED
        }

    private fun enqueueSessionOutbox(
        sessionId: UUID,
        dedupeKey: String,
    ): Boolean =
        outboxAdapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.SESSION_RECORD_UPDATED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload =
                NotificationEventPayload(
                    sessionId = sessionId,
                    sessionNumber = 1,
                    bookTitle = "Race Book",
                ),
            dedupeKey = dedupeKey,
        )

    private fun insertManualDispatch(
        sessionId: UUID,
        identitySeed: String,
    ) {
        val dispatchId = UUID.nameUUIDFromBytes(identitySeed.toByteArray())
        manualDispatchAdapter.insertManualDispatch(
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            selection =
                ManualNotificationSelection(
                    sessionId = sessionId,
                    eventType = NotificationEventType.SESSION_REMINDER_DUE,
                    contentRevision = "c".repeat(64),
                    audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                    requestedChannels = ManualNotificationRequestedChannels.BOTH,
                    sendMode = ManualNotificationSendMode.NOW,
                ),
            payload =
                NotificationEventPayload(
                    sessionId = sessionId,
                    sessionNumber = 1,
                    bookTitle = "Race Book",
                    manualDispatch =
                        NotificationManualDispatchPayload(
                            id = dispatchId,
                            source = NotificationDispatchSource.MANUAL,
                            requestedByMembershipId = hostMembershipId,
                            requestedChannels = ManualNotificationRequestedChannels.BOTH,
                            audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                            contentRevision = "c".repeat(64),
                            resend = false,
                            sendMode = ManualNotificationSendMode.NOW,
                        ),
                ),
            targetSnapshot = ManualNotificationTargetSnapshot(1, 0, 0, 1, 1, 1, 0, 0),
            resend = false,
        )
    }

    private fun insertDeletableSession(suffix: String): UUID {
        val sessionId = UUID.fromString("00000000-0000-0000-0000-00000000$suffix")
        val number =
            jdbcTemplate.queryForObject(
                "select coalesce(max(number), 0) + 1 from sessions where club_id = ?",
                Int::class.java,
                clubId.toString(),
            ) ?: error("session number")
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, ?, '삭제 경합 테스트', 'Race Book', '테스트 저자',
                    '2026-08-21', '19:00:00', '21:00:00', '온라인', '2026-08-20 19:00:00', 'OPEN', 'MEMBER')
            """.trimIndent(),
            sessionId.toString(),
            clubId.toString(),
            number,
        )
        return sessionId
    }

    private fun orphanSessionAggregateCount(sessionId: UUID): Int {
        val outbox =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from notification_event_outbox
                where club_id = ?
                  and aggregate_type = 'SESSION'
                  and aggregate_id = ?
                  and not exists (
                    select 1 from sessions where sessions.id = notification_event_outbox.aggregate_id
                  )
                """.trimIndent(),
                Int::class.java,
                clubId.toString(),
                sessionId.toString(),
            ) ?: 0
        val dispatches =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from notification_manual_dispatches
                where club_id = ?
                  and session_id = ?
                  and not exists (
                    select 1 from sessions where sessions.id = notification_manual_dispatches.session_id
                  )
                """.trimIndent(),
                Int::class.java,
                clubId.toString(),
                sessionId.toString(),
            ) ?: 0
        val decisions =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from host_action_notification_decisions
                where club_id = ?
                  and session_id = ?
                  and not exists (
                    select 1 from sessions where sessions.id = host_action_notification_decisions.session_id
                  )
                """.trimIndent(),
                Int::class.java,
                clubId.toString(),
                sessionId.toString(),
            ) ?: 0
        return outbox + dispatches + decisions
    }

    private fun sessionExists(sessionId: UUID): Boolean =
        jdbcTemplate.queryForObject(
            "select count(*) from sessions where club_id = ? and id = ?",
            Int::class.java,
            clubId.toString(),
            sessionId.toString(),
        ) == 1

    private fun sessionIsActive(sessionId: UUID): Boolean =
        jdbcTemplate.queryForObject(
            "select count(*) from active_sessions where club_id = ? and id = ?",
            Int::class.java,
            clubId.toString(),
            sessionId.toString(),
        ) == 1
}

private enum class RaceOutcome {
    EFFECT_COMMITTED_DELETE_BLOCKED,
    DELETE_COMMITTED_EFFECT_REJECTED,
}

private enum class DeleteAttempt {
    DELETED,
    BLOCKED,
}
