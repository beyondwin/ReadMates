package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.domain.NotificationOutboxStatus
import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private const val CLEANUP_NOTIFICATION_OUTBOX_SQL = """
    delete from notification_test_mail_audit
    where club_id in (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002'
    );
    delete from notification_preferences
    where club_id in (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002'
    );
    delete from notification_outbox
    where club_id in (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002'
    );
    update sessions
    set state = 'PUBLISHED',
        visibility = 'PUBLIC'
    where id = '00000000-0000-0000-0000-000000000302';
    delete from sessions
    where id = '00000000-0000-0000-0000-000000009401';
    delete from clubs
    where id = '00000000-0000-0000-0000-000000000002';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Sql(
    statements = [CLEANUP_NOTIFICATION_OUTBOX_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_NOTIFICATION_OUTBOX_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class JdbcNotificationOutboxAdapterTest(
    @param:Autowired private val adapter: JdbcNotificationOutboxAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `enqueue next book skips member with disabled event preference`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000302")
        makeNextBookSessionEligible(sessionId)
        disableMemberPreference("member1@example.com", "next_book_published_enabled")

        adapter.enqueueNextBookPublished(clubId, sessionId)

        val member1Rows = notificationRowsFor("NEXT_BOOK_PUBLISHED", "member1@example.com")
        assertThat(member1Rows).isZero()
    }

    @Test
    fun `enqueue feedback skips member with global email disabled`() {
        disableMemberEmail("member1@example.com")

        adapter.enqueueFeedbackDocumentPublished(
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
        )

        val member1Rows = notificationRowsFor("FEEDBACK_DOCUMENT_PUBLISHED", "member1@example.com")
        assertThat(member1Rows).isZero()
    }

    @Test
    fun `enqueue feedback notification creates one pending row per active attended participant`() {
        val inserted = adapter.enqueueFeedbackDocumentPublished(
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
        )

        val rows = jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_outbox
            where event_type = 'FEEDBACK_DOCUMENT_PUBLISHED'
              and aggregate_id = '00000000-0000-0000-0000-000000000301'
              and status = 'PENDING'
            """.trimIndent(),
            Int::class.java,
        )

        assertThat(inserted).isEqualTo(rows)
        assertThat(rows).isGreaterThan(1)
    }

    @Test
    fun `enqueueReviewPublished notifies opted-in active members except author`() {
        enableReviewPublished("member2@example.com")
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000306")
        val authorMembershipId = membershipIdForEmail("member1@example.com")

        val inserted = adapter.enqueueReviewPublished(clubId, sessionId, authorMembershipId)

        assertThat(inserted).isGreaterThan(0)
        assertThat(notificationRowsFor("REVIEW_PUBLISHED", "member1@example.com")).isZero()
        assertThat(notificationRowsFor("REVIEW_PUBLISHED", "member2@example.com")).isGreaterThan(0)
    }

    @Test
    fun `enqueue is idempotent for the same event and recipient`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

        val firstInserted = adapter.enqueueFeedbackDocumentPublished(clubId, sessionId)
        val duplicateInserted = adapter.enqueueFeedbackDocumentPublished(clubId, sessionId)

        val duplicateCount = jdbcTemplate.queryForObject(
            """
            select count(*) - count(distinct dedupe_key)
            from notification_outbox
            where event_type = 'FEEDBACK_DOCUMENT_PUBLISHED'
              and aggregate_id = ?
            """.trimIndent(),
            Int::class.java,
            sessionId.toString(),
        )

        assertThat(firstInserted).isGreaterThan(0)
        assertThat(duplicateInserted).isZero()
        assertThat(duplicateCount).isZero()
    }

    @Test
    fun `claimPending reclaims stale sending rows`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

        adapter.enqueueFeedbackDocumentPublished(clubId, sessionId)
        val staleSendingId = jdbcTemplate.queryForObject(
            """
            select id
            from notification_outbox
            where event_type = 'FEEDBACK_DOCUMENT_PUBLISHED'
              and aggregate_id = ?
            order by created_at
            limit 1
            """.trimIndent(),
            String::class.java,
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            update notification_outbox
            set status = 'SENDING',
                locked_at = timestampadd(MINUTE, -16, utc_timestamp(6)),
                next_attempt_at = timestampadd(MINUTE, -16, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            staleSendingId,
        )

        val claimed = adapter.claimPending(10)

        assertThat(claimed.map { it.id.toString() }).contains(staleSendingId)
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select status
                from notification_outbox
                where id = ?
                """.trimIndent(),
                String::class.java,
                staleSendingId,
            ),
        ).isEqualTo("SENDING")
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select locked_at > timestampadd(MINUTE, -1, utc_timestamp(6))
                from notification_outbox
                where id = ?
                """.trimIndent(),
                Boolean::class.java,
                staleSendingId,
            ),
        ).isTrue()
    }

    @Test
    fun `claimPendingForClub only claims rows for requested club`() {
        val hostClubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val otherClubId = UUID.fromString("00000000-0000-0000-0000-000000000002")
        insertOtherClub()
        insertPendingNotification(
            id = "00000000-0000-0000-0000-000000009201",
            clubId = hostClubId.toString(),
            dedupeKey = "host-notification-adapter-test-host-club",
        )
        insertPendingNotification(
            id = "00000000-0000-0000-0000-000000009202",
            clubId = otherClubId.toString(),
            dedupeKey = "host-notification-adapter-test-other-club",
        )

        val claimed = adapter.claimPendingForClub(hostClubId, 10)

        assertThat(claimed.map { it.id.toString() }).containsExactly("00000000-0000-0000-0000-000000009201")
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select status
                from notification_outbox
                where id = '00000000-0000-0000-0000-000000009202'
                """.trimIndent(),
                String::class.java,
            ),
        ).isEqualTo("PENDING")
    }

    @Test
    fun `outboxBacklog counts pending failed dead and sending rows`() {
        listOf(
            "00000000-0000-0000-0000-000000009301" to NotificationOutboxStatus.PENDING,
            "00000000-0000-0000-0000-000000009302" to NotificationOutboxStatus.FAILED,
            "00000000-0000-0000-0000-000000009303" to NotificationOutboxStatus.DEAD,
            "00000000-0000-0000-0000-000000009304" to NotificationOutboxStatus.SENDING,
        ).forEach { (id, status) ->
            insertNotification(
                id = id,
                clubId = "00000000-0000-0000-0000-000000000001",
                status = status,
                dedupeKey = "host-notification-adapter-test-backlog-${status.name.lowercase()}",
            )
        }

        val backlog = adapter.outboxBacklog()

        assertThat(backlog.pending).isEqualTo(1)
        assertThat(backlog.failed).isEqualTo(1)
        assertThat(backlog.dead).isEqualTo(1)
        assertThat(backlog.sending).isEqualTo(1)
    }

    @Test
    fun `reserveTestMailAuditAttempt inserts one row and refuses recent host attempt`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")
        val cooldownStartedAfter = OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(60)

        val first = adapter.reserveTestMailAuditAttempt(
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            recipientMaskedEmail = "e***@example.com",
            recipientEmailHash = "0".repeat(64),
            cooldownStartedAfter = cooldownStartedAfter,
        )
        val second = adapter.reserveTestMailAuditAttempt(
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            recipientMaskedEmail = "o***@example.com",
            recipientEmailHash = "1".repeat(64),
            cooldownStartedAfter = cooldownStartedAfter,
        )

        assertThat(first).isNotNull
        assertThat(first?.status?.name).isEqualTo("SENT")
        assertThat(second).isNull()
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from notification_test_mail_audit
                where club_id = ?
                  and host_membership_id = ?
                """.trimIndent(),
                Int::class.java,
                clubId.toString(),
                hostMembershipId.toString(),
            ),
        ).isEqualTo(1)
    }

    @Test
    fun `markTestMailAuditFailed updates reserved audit row`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")
        val reserved = adapter.reserveTestMailAuditAttempt(
            clubId = clubId,
            hostMembershipId = hostMembershipId,
            recipientMaskedEmail = "e***@example.com",
            recipientEmailHash = "0".repeat(64),
            cooldownStartedAfter = OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(60),
        )

        val failed = adapter.markTestMailAuditFailed(reserved!!.id, "smtp rejected")

        assertThat(failed.status.name).isEqualTo("FAILED")
        assertThat(failed.lastError).isEqualTo("smtp rejected")
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select status
                from notification_test_mail_audit
                where id = ?
                """.trimIndent(),
                String::class.java,
                reserved.id.toString(),
            ),
        ).isEqualTo("FAILED")
    }

    @Test
    fun `enqueueSessionReminderDue creates reminder rows for active members on target date`() {
        val sessionId = "00000000-0000-0000-0000-000000009401"
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label,
              question_deadline_at, state, visibility
            ) values (
              ?,
              '00000000-0000-0000-0000-000000000001',
              9401,
              '리마인더 테스트 회차',
              '리마인더 테스트 책',
              '테스트 저자',
              '2026-04-30',
              '19:30:00',
              '21:30:00',
              '온라인',
              '2026-04-29 14:59:00.000000',
              'OPEN',
              'MEMBER'
            )
            """.trimIndent(),
            sessionId,
        )

        val inserted = adapter.enqueueSessionReminderDue(LocalDate.of(2026, 4, 30))

        assertThat(inserted).isGreaterThan(0)
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from notification_outbox
                where event_type = 'SESSION_REMINDER_DUE'
                  and aggregate_id = ?
                  and status = 'PENDING'
                """.trimIndent(),
                Int::class.java,
                sessionId,
            ),
        ).isGreaterThan(0)
    }

    @Test
    fun `markSent does not overwrite row that is no longer sending`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

        adapter.enqueueFeedbackDocumentPublished(clubId, sessionId)
        val claimed = adapter.claimPending(1).single()
        jdbcTemplate.update(
            """
            update notification_outbox
            set status = 'DEAD',
                last_error = 'already terminal',
                locked_at = null,
                sent_at = null
            where id = ?
            """.trimIndent(),
            claimed.id.toString(),
        )

        val marked = adapter.markSent(claimed.id, claimed.lockedAt)

        val row = jdbcTemplate.queryForMap(
            """
            select status, last_error, sent_at
            from notification_outbox
            where id = ?
            """.trimIndent(),
            claimed.id.toString(),
        )
        assertThat(row["status"]).isEqualTo("DEAD")
        assertThat(row["last_error"]).isEqualTo("already terminal")
        assertThat(row["sent_at"]).isNull()
        assertThat(marked).isFalse()
    }

    @Test
    fun `markSent does not overwrite row reclaimed with a newer lease`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

        adapter.enqueueFeedbackDocumentPublished(clubId, sessionId)
        val staleClaim = adapter.claimPending(1).single()
        jdbcTemplate.update(
            """
            update notification_outbox
            set status = 'DEAD',
                locked_at = null
            where club_id = ?
              and id <> ?
            """.trimIndent(),
            clubId.toString(),
            staleClaim.id.toString(),
        )
        jdbcTemplate.update(
            """
            update notification_outbox
            set status = 'PENDING',
                locked_at = null,
                next_attempt_at = utc_timestamp(6)
            where id = ?
            """.trimIndent(),
            staleClaim.id.toString(),
        )
        val freshClaim = adapter.claimPending(1).single()
        assertThat(freshClaim.id).isEqualTo(staleClaim.id)
        assertThat(freshClaim.lockedAt).isNotEqualTo(staleClaim.lockedAt)

        val marked = adapter.markSent(staleClaim.id, staleClaim.lockedAt)

        val row = jdbcTemplate.queryForMap(
            """
            select status, locked_at, sent_at
            from notification_outbox
            where id = ?
            """.trimIndent(),
            staleClaim.id.toString(),
        )
        assertThat(row["status"]).isEqualTo("SENDING")
        assertThat(row["sent_at"]).isNull()
        assertThat(marked).isFalse()
    }

    private fun insertOtherClub() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (
              '00000000-0000-0000-0000-000000000002',
              'other-club',
              'Other Club',
              'Separate reading club',
              'Separate club for notification processing scope tests.'
            )
            """.trimIndent(),
        )
    }

    private fun insertPendingNotification(id: String, clubId: String, dedupeKey: String) {
        insertNotification(id = id, clubId = clubId, status = NotificationOutboxStatus.PENDING, dedupeKey = dedupeKey)
    }

    private fun disableMemberEmail(email: String) {
        disableMemberPreference(email, "email_enabled")
    }

    private fun enableReviewPublished(email: String) {
        upsertPreference(email, "review_published_enabled", true)
    }

    private fun membershipIdForEmail(email: String): UUID =
        UUID.fromString(
            jdbcTemplate.queryForObject(
                """
                select memberships.id
                from memberships
                join users on users.id = memberships.user_id
                where users.email = ?
                  and memberships.club_id = '00000000-0000-0000-0000-000000000001'
                """.trimIndent(),
                String::class.java,
                email,
            ),
        )

    private fun makeNextBookSessionEligible(sessionId: UUID) {
        jdbcTemplate.update(
            """
            update sessions
            set state = 'DRAFT',
                visibility = 'MEMBER'
            where id = ?
            """.trimIndent(),
            sessionId.toString(),
        )
    }

    private fun disableMemberPreference(email: String, column: String) {
        val allowedColumns = setOf(
            "email_enabled",
            "next_book_published_enabled",
            "session_reminder_due_enabled",
            "feedback_document_published_enabled",
            "review_published_enabled",
        )
        require(column in allowedColumns) { "Unsupported notification preference column: $column" }
        upsertPreference(email, column, false)
    }

    private fun upsertPreference(email: String, column: String, enabled: Boolean) {
        val membership = jdbcTemplate.queryForMap(
            """
            select memberships.id as membership_id, memberships.club_id as club_id
            from memberships
            join users on users.id = memberships.user_id
            where users.email = ?
              and memberships.club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            email,
        )
        jdbcTemplate.update(
            """
            insert into notification_preferences (membership_id, club_id)
            values (?, ?)
            on duplicate key update updated_at = utc_timestamp(6)
            """.trimIndent(),
            membership["membership_id"].toString(),
            membership["club_id"].toString(),
        )
        jdbcTemplate.update(
            """
            update notification_preferences
            set $column = ?
            where membership_id = ?
              and club_id = ?
            """.trimIndent(),
            enabled,
            membership["membership_id"].toString(),
            membership["club_id"].toString(),
        )
    }

    private fun notificationRowsFor(eventType: String, email: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_outbox
            where event_type = ?
              and recipient_email = ?
            """.trimIndent(),
            Int::class.java,
            eventType,
            email,
        ) ?: 0

    private fun insertNotification(
        id: String,
        clubId: String,
        status: NotificationOutboxStatus,
        dedupeKey: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id,
              recipient_email, subject, body_text, deep_link_path, status, dedupe_key
            ) values (
              ?,
              ?,
              'FEEDBACK_DOCUMENT_PUBLISHED',
              'SESSION',
              '00000000-0000-0000-0000-000000000301',
              'member@example.com',
              '피드백 문서가 올라왔습니다',
              'ReadMates에서 확인해 주세요.',
              '/app/feedback/00000000-0000-0000-0000-000000000301',
              ?,
              ?
            )
            """.trimIndent(),
            id,
            clubId,
            status.name,
            dedupeKey,
        )
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
