package com.readmates.notification.adapter.out.persistence

import com.readmates.auth.domain.MembershipRole
import com.readmates.notification.application.model.HostActionTargetCounts
import com.readmates.notification.application.model.HostConfirmedAction
import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.application.model.NotificationSessionNotFoundException
import com.readmates.notification.application.port.out.HostActionNotificationPreviewRecord
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
import java.time.OffsetDateTime
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private const val CLEANUP_HOST_ACTION_GATE_SQL = """
    update host_action_notification_previews
    set consumed_at = null, consumed_decision_id = null
    where id = '00000000-0000-0000-0000-000000009101';
    delete from host_action_notification_decisions
    where preview_id = '00000000-0000-0000-0000-000000009101';
    delete from host_action_notification_previews
    where id = '00000000-0000-0000-0000-000000009101';
    delete from sessions
    where id = '00000000-0000-0000-0000-000000009102';
    update host_action_notification_previews
    set consumed_at = null, consumed_decision_id = null
    where id = '00000000-0000-0000-0000-000000009104';
    delete from host_action_notification_decisions
    where preview_id = '00000000-0000-0000-0000-000000009104';
    delete from host_action_notification_previews
    where id = '00000000-0000-0000-0000-000000009104';
    delete from host_session_lifecycle_audit
    where session_id = '00000000-0000-0000-0000-000000009103';
    delete from sessions
    where id = '00000000-0000-0000-0000-000000009103';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_HOST_ACTION_GATE_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_HOST_ACTION_GATE_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcHostActionNotificationAdapterTest(
    @param:Autowired private val adapter: JdbcHostActionNotificationAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val lifecycleService: HostSessionLifecycleService,
    @param:Autowired private val transactionManager: PlatformTransactionManager,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `target counts use the same session state eligibility as delivery planning`() {
        insertTargetCountSession("OPEN")

        assertThat(
            adapter.countTargets(CLUB_ID, TARGET_COUNT_SESSION_ID, NotificationEventType.SESSION_RECORD_UPDATED),
        ).isEqualTo(HostActionTargetCounts(0, 0, 0, 0))
        assertThat(
            adapter.countTargets(CLUB_ID, TARGET_COUNT_SESSION_ID, NotificationEventType.NEXT_BOOK_PUBLISHED),
        ).isEqualTo(HostActionTargetCounts(0, 0, 0, 0))

        jdbcTemplate.update("update sessions set state = 'CLOSED' where id = ?", TARGET_COUNT_SESSION_ID.toString())
        assertThat(
            adapter
                .countTargets(CLUB_ID, TARGET_COUNT_SESSION_ID, NotificationEventType.SESSION_RECORD_UPDATED)
                .targetCount,
        ).isGreaterThan(0)

        jdbcTemplate.update("update sessions set state = 'DRAFT' where id = ?", TARGET_COUNT_SESSION_ID.toString())
        assertThat(
            adapter
                .countTargets(CLUB_ID, TARGET_COUNT_SESSION_ID, NotificationEventType.NEXT_BOOK_PUBLISHED)
                .targetCount,
        ).isGreaterThan(0)
    }

    @Test
    fun `complete stores skip decision and consumes preview atomically`() {
        val preview =
            HostActionNotificationPreviewRecord(
                id = PREVIEW_ID,
                clubId = CLUB_ID,
                sessionId = SESSION_ID,
                hostMembershipId = HOST_MEMBERSHIP_ID,
                action = HostConfirmedAction.SESSION_RECORD_APPLY,
                eventType = NotificationEventType.SESSION_RECORD_UPDATED,
                requestHash = "a".repeat(64),
                expectedDraftRevision = 2,
                expectedLiveRevision = 1,
                counts = HostActionTargetCounts(2, 2, 1, 1),
                expiresAt = OffsetDateTime.parse("2099-07-23T08:05:00Z"),
            )
        adapter.insertPreview(preview)

        val stored =
            adapter.completeDecision(
                preview = adapter.lockPreview(PREVIEW_ID, CLUB_ID, HOST_MEMBERSHIP_ID)!!,
                decision = NotificationDecision.SKIP,
                liveRevision = 2,
                eventId = null,
                now = OffsetDateTime.parse("2026-07-23T08:00:00Z"),
            )

        assertThat(stored.decision).isEqualTo(NotificationDecision.SKIP)
        assertThat(stored.eventId).isNull()
        assertThat(adapter.findDecision(PREVIEW_ID)).isEqualTo(stored)
        val consumed =
            jdbcTemplate.queryForMap(
                "select consumed_at, consumed_decision_id from host_action_notification_previews where id = ?",
                PREVIEW_ID.toString(),
            )
        assertThat(consumed["consumed_at"]).isNotNull()
        assertThat(consumed["consumed_decision_id"]).isEqualTo(stored.id.toString())
    }

    @Test
    fun `complete decision rejects a missing parent session`() {
        insertRaceSession()
        val preview = racePreview()
        adapter.insertPreview(preview)
        lifecycleService.delete(HostSessionIdCommand(hostMember(), RACE_SESSION_ID))

        assertThatThrownBy {
            adapter.completeDecision(
                preview = preview,
                decision = NotificationDecision.SKIP,
                liveRevision = 1,
                eventId = null,
                now = OffsetDateTime.parse("2026-07-23T08:00:00Z"),
            )
        }.isInstanceOf(NotificationSessionNotFoundException::class.java)
        assertThat(orphanDecisionCount()).isZero()
    }

    @Test
    @Timeout(30)
    fun `complete decision and delete serialize to a legal outcome`() {
        insertRaceSession()
        val preview = racePreview()
        adapter.insertPreview(preview)
        val effectTemplate = TransactionTemplate(transactionManager)
        val deleteTemplate = TransactionTemplate(transactionManager)
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val effectFuture =
                executor.submit<Boolean> {
                    ready.countDown()
                    check(start.await(10, TimeUnit.SECONDS))
                    try {
                        effectTemplate.execute {
                            adapter.completeDecision(
                                preview = preview,
                                decision = NotificationDecision.SKIP,
                                liveRevision = 1,
                                eventId = null,
                                now = OffsetDateTime.parse("2026-07-23T08:00:00Z"),
                            )
                        }
                        true
                    } catch (_: NotificationSessionNotFoundException) {
                        false
                    } catch (_: DataIntegrityViolationException) {
                        false
                    }
                }
            val deleteFuture =
                executor.submit<Boolean> {
                    ready.countDown()
                    check(start.await(10, TimeUnit.SECONDS))
                    try {
                        deleteTemplate.execute {
                            lifecycleService.delete(HostSessionIdCommand(hostMember(), RACE_SESSION_ID))
                        }
                        true
                    } catch (_: HostSessionDeletionBlockedException) {
                        false
                    } catch (_: DataIntegrityViolationException) {
                        false
                    }
                }
            check(ready.await(10, TimeUnit.SECONDS))
            start.countDown()
            val effectCommitted = effectFuture.get(20, TimeUnit.SECONDS)
            val deleteCommitted = deleteFuture.get(20, TimeUnit.SECONDS)
            assertThat(effectCommitted && deleteCommitted).isFalse()
            assertThat(effectCommitted || deleteCommitted).isTrue()
            assertThat(orphanDecisionCount()).isZero()
        } finally {
            executor.shutdownNow()
        }
    }

    private fun insertRaceSession() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, 9103, '결정 경합 테스트', '테스트 책', '테스트 저자',
                    '2026-07-23', '19:00:00', '21:00:00', '온라인', '2026-07-22 19:00:00', 'OPEN', 'MEMBER')
            """.trimIndent(),
            RACE_SESSION_ID.toString(),
            CLUB_ID.toString(),
        )
    }

    private fun racePreview() =
        HostActionNotificationPreviewRecord(
            id = RACE_PREVIEW_ID,
            clubId = CLUB_ID,
            sessionId = RACE_SESSION_ID,
            hostMembershipId = HOST_MEMBERSHIP_ID,
            action = HostConfirmedAction.SESSION_RECORD_APPLY,
            eventType = NotificationEventType.SESSION_RECORD_UPDATED,
            requestHash = "b".repeat(64),
            expectedDraftRevision = 1,
            expectedLiveRevision = 0,
            counts = HostActionTargetCounts(0, 0, 0, 0),
            expiresAt = OffsetDateTime.parse("2099-07-23T08:05:00Z"),
        )

    private fun hostMember() =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = HOST_MEMBERSHIP_ID,
            clubId = CLUB_ID,
            clubSlug = "readmates",
            email = "host@example.com",
            displayName = "김호스트",
            accountName = "김호스트",
            role = MembershipRole.HOST,
        )

    private fun orphanDecisionCount(): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from host_action_notification_decisions
            where session_id = ?
              and not exists (
                select 1 from sessions where sessions.id = host_action_notification_decisions.session_id
              )
            """.trimIndent(),
            Int::class.java,
            RACE_SESSION_ID.toString(),
        ) ?: 0

    private fun insertTargetCountSession(state: String) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, 9102, '대상 계산 테스트', '테스트 책', '테스트 저자',
                    '2026-07-23', '19:00:00', '21:00:00', '온라인', '2026-07-22 19:00:00', ?, 'HOST_ONLY')
            """.trimIndent(),
            TARGET_COUNT_SESSION_ID.toString(),
            CLUB_ID.toString(),
            state,
        )
    }
}

private val PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000009101")
private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")
private val HOST_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
private val TARGET_COUNT_SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000009102")
private val RACE_SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000009103")
private val RACE_PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000009104")
