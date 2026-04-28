package com.readmates.notification.adapter.out.persistence

import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

private const val CLEANUP_NOTIFICATION_OUTBOX_SQL = """
    delete from notification_outbox
    where club_id in (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002'
    );
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
    fun `enqueue feedback notification creates one pending row per active attended participant`() {
        adapter.enqueueFeedbackDocumentPublished(
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

        assertThat(rows).isGreaterThan(0)
    }

    @Test
    fun `enqueue is idempotent for the same event and recipient`() {
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")

        adapter.enqueueFeedbackDocumentPublished(clubId, sessionId)
        adapter.enqueueFeedbackDocumentPublished(clubId, sessionId)

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
              'PENDING',
              ?
            )
            """.trimIndent(),
            id,
            clubId,
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
