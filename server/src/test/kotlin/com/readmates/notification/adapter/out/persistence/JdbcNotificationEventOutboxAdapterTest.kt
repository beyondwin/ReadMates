package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
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
import java.util.UUID

private const val CLEANUP_NOTIFICATION_EVENT_OUTBOX_SQL = """
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-000000000101';
    delete from clubs
    where id = '00000000-0000-0000-0000-000000000101';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Sql(
    statements = [CLEANUP_NOTIFICATION_EVENT_OUTBOX_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_NOTIFICATION_EVENT_OUTBOX_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class JdbcNotificationEventOutboxAdapterTest(
    @param:Autowired private val adapter: JdbcNotificationEventOutboxAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000101")
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000201")

    @Test
    fun `enqueue event is idempotent by dedupe key`() {
        insertClub()
        val payload = NotificationEventPayload(
            sessionId = sessionId,
            sessionNumber = 7,
            bookTitle = "Outbox Patterns",
            targetDate = LocalDate.of(2026, 5, 1),
        )

        val first = adapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.SESSION_REMINDER_DUE,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = payload,
            dedupeKey = "event-outbox-adapter-test-dedupe",
        )
        val duplicate = adapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.SESSION_REMINDER_DUE,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = payload.copy(bookTitle = "Duplicate Payload"),
            dedupeKey = "event-outbox-adapter-test-dedupe",
        )

        val row = jdbcTemplate.queryForMap(
            """
            select event_type, aggregate_type, aggregate_id, kafka_topic, kafka_key, status,
                   json_unquote(json_extract(payload_json, '$.bookTitle')) as book_title
            from notification_event_outbox
            where club_id = ?
            """.trimIndent(),
            clubId.toString(),
        )

        assertThat(first).isTrue()
        assertThat(duplicate).isFalse()
        assertThat(row["event_type"]).isEqualTo("SESSION_REMINDER_DUE")
        assertThat(row["aggregate_type"]).isEqualTo("SESSION")
        assertThat(row["aggregate_id"]).isEqualTo(sessionId.toString())
        assertThat(row["kafka_topic"]).isEqualTo("readmates.notification.events.v1")
        assertThat(row["kafka_key"]).isEqualTo(clubId.toString())
        assertThat(row["status"]).isEqualTo("PENDING")
        assertThat(row["book_title"]).isEqualTo("Outbox Patterns")
        assertThat(eventRows()).isEqualTo(1)
    }

    @Test
    fun `claim publishable moves pending row to publishing`() {
        insertClub()
        adapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, bookTitle = "Distributed Systems"),
            dedupeKey = "event-outbox-adapter-test-claim",
        )

        val claimed = adapter.claimPublishable(1)

        assertThat(claimed).hasSize(1)
        assertThat(claimed.single().clubId).isEqualTo(clubId)
        assertThat(claimed.single().eventType).isEqualTo(NotificationEventType.NEXT_BOOK_PUBLISHED)
        assertThat(claimed.single().status).isEqualTo(NotificationEventOutboxStatus.PUBLISHING)
        assertThat(claimed.single().lockedAt).isNotNull()
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select status
                from notification_event_outbox
                where id = ?
                """.trimIndent(),
                String::class.java,
                claimed.single().id.toString(),
            ),
        ).isEqualTo("PUBLISHING")
    }

    private fun eventRows(): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_event_outbox
            where club_id = ?
            """.trimIndent(),
            Int::class.java,
            clubId.toString(),
        ) ?: 0

    private fun insertClub() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, 'readmates-event-outbox-test', 'ReadMates', 'Read together', 'Outbox adapter test club.')
            """.trimIndent(),
            clubId.toString(),
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
