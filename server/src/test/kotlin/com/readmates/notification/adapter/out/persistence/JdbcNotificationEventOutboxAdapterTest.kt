package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationEventOutboxItem
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
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private const val CLEANUP_NOTIFICATION_EVENT_OUTBOX_SQL = """
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-000000000101';
    delete from notification_event_outbox
    where aggregate_id = '00000000-0000-0000-0000-000000009501';
    delete from sessions
    where id = '00000000-0000-0000-0000-000000009501';
    delete from clubs
    where id = '00000000-0000-0000-0000-000000000101';
"""
private const val TEST_NOTIFICATION_EVENTS_TOPIC = "readmates.notification.events.test-override"

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.notifications.kafka.events-topic=$TEST_NOTIFICATION_EVENTS_TOPIC",
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
        assertThat(row["kafka_topic"]).isEqualTo(TEST_NOTIFICATION_EVENTS_TOPIC)
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

    @Test
    fun `claim publishable reclaims stale publishing rows but not fresh publishing rows`() {
        insertClub()
        adapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, bookTitle = "Stale Lease"),
            dedupeKey = "event-outbox-adapter-test-stale-publishing",
        )
        adapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.SESSION_REMINDER_DUE,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, bookTitle = "Fresh Lease"),
            dedupeKey = "event-outbox-adapter-test-fresh-publishing",
        )
        val stalePublishingId = eventIdForDedupeKey("event-outbox-adapter-test-stale-publishing")
        val freshPublishingId = eventIdForDedupeKey("event-outbox-adapter-test-fresh-publishing")
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set status = 'PUBLISHING',
                locked_at = timestampadd(MINUTE, -16, utc_timestamp(6)),
                next_attempt_at = timestampadd(MINUTE, -16, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            stalePublishingId,
        )
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set status = 'PUBLISHING',
                locked_at = utc_timestamp(6),
                next_attempt_at = timestampadd(MINUTE, -16, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            freshPublishingId,
        )

        val claimed = adapter.claimPublishable(10)

        assertThat(claimed.map { it.id.toString() }).contains(stalePublishingId)
        assertThat(claimed.map { it.id.toString() }).doesNotContain(freshPublishingId)
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select status
                from notification_event_outbox
                where id = ?
                """.trimIndent(),
                String::class.java,
                stalePublishingId,
            ),
        ).isEqualTo("PUBLISHING")
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select locked_at > timestampadd(MINUTE, -1, utc_timestamp(6))
                from notification_event_outbox
                where id = ?
                """.trimIndent(),
                Boolean::class.java,
                stalePublishingId,
            ),
        ).isTrue()
    }

    @Test
    fun `claim publishable moves due failed rows to publishing but leaves future failed rows alone`() {
        insertClub()
        val dueFailedId = enqueueTestEvent(
            dedupeKey = "event-outbox-adapter-test-due-failed",
            payload = NotificationEventPayload(sessionId = sessionId, bookTitle = "Due Failed"),
        )
        val futureFailedId = enqueueTestEvent(
            dedupeKey = "event-outbox-adapter-test-future-failed",
            payload = NotificationEventPayload(sessionId = sessionId, bookTitle = "Future Failed"),
        )
        markFailedForRetry(dueFailedId, nextAttemptExpression = "timestampadd(MINUTE, -1, utc_timestamp(6))")
        markFailedForRetry(futureFailedId, nextAttemptExpression = "timestampadd(MINUTE, 5, utc_timestamp(6))")

        val claimed = adapter.claimPublishable(10)

        assertThat(claimed.map { it.id.toString() }).containsExactly(dueFailedId)
        assertThat(claimed.single().status).isEqualTo(NotificationEventOutboxStatus.PUBLISHING)
        assertThat(claimed.single().attemptCount).isEqualTo(2)
        assertThat(eventRow(dueFailedId)["status"]).isEqualTo("PUBLISHING")
        assertThat(eventRow(futureFailedId)["status"]).isEqualTo("FAILED")
    }

    @Test
    fun `markPublished only publishes the active publishing lease`() {
        insertClub()
        val claimed = claimSingleEvent("event-outbox-adapter-test-mark-published")
        val staleLease = claimed.lockedAt.minusSeconds(1)

        val staleMarked = adapter.markPublished(claimed.id, staleLease)
        val activeMarked = adapter.markPublished(claimed.id, claimed.lockedAt)

        val row = eventRow(claimed.id.toString())
        assertThat(staleMarked).isFalse()
        assertThat(activeMarked).isTrue()
        assertThat(row["status"]).isEqualTo("PUBLISHED")
        assertThat(row["published_at"]).isNotNull()
        assertThat(row["locked_at"]).isNull()
        assertThat(row["last_error"]).isNull()
    }

    @Test
    fun `markPublishFailed only fails active publishing lease and stores sanitized truncated error`() {
        insertClub()
        val claimed = claimSingleEvent("event-outbox-adapter-test-mark-failed")
        val unsafeError = unsafeLongError()

        val staleMarked = adapter.markPublishFailed(claimed.id, claimed.lockedAt.minusSeconds(1), "stale", 0)
        val activeMarked = adapter.markPublishFailed(claimed.id, claimed.lockedAt, unsafeError, -10)

        val row = eventRow(claimed.id.toString())
        val storedError = row["last_error"].toString()
        assertThat(staleMarked).isFalse()
        assertThat(activeMarked).isTrue()
        assertThat(row["status"]).isEqualTo("FAILED")
        assertThat(row["attempt_count"]).isEqualTo(1)
        assertThat(row["locked_at"]).isNull()
        assertThat(storedError).hasSize(500)
        assertThat(storedError).contains("[redacted-secret]", "[redacted-email]")
        assertThat(storedError).doesNotContain("Authorization", "reader@example.com", "Bearer example")
    }

    @Test
    fun `markPublishDead only kills active publishing lease and stores sanitized truncated error`() {
        insertClub()
        val claimed = claimSingleEvent("event-outbox-adapter-test-mark-dead")
        val unsafeError = unsafeLongError()

        val staleMarked = adapter.markPublishDead(claimed.id, claimed.lockedAt.minusSeconds(1), "stale")
        val activeMarked = adapter.markPublishDead(claimed.id, claimed.lockedAt, unsafeError)

        val row = eventRow(claimed.id.toString())
        val storedError = row["last_error"].toString()
        assertThat(staleMarked).isFalse()
        assertThat(activeMarked).isTrue()
        assertThat(row["status"]).isEqualTo("DEAD")
        assertThat(row["attempt_count"]).isEqualTo(1)
        assertThat(row["locked_at"]).isNull()
        assertThat(storedError).hasSize(500)
        assertThat(storedError).contains("[redacted-secret]", "[redacted-email]")
        assertThat(storedError).doesNotContain("Authorization", "reader@example.com", "Bearer example")
    }

    @Test
    fun `mark publish transitions do not overwrite rows that are no longer publishing`() {
        insertClub()
        val publishedClaim = claimSingleEvent("event-outbox-adapter-test-cas-published-status")
        val failedClaim = claimSingleEvent("event-outbox-adapter-test-cas-failed-status")
        val deadClaim = claimSingleEvent("event-outbox-adapter-test-cas-dead-status")
        forceEventState(publishedClaim.id.toString(), "DEAD")
        forceEventState(failedClaim.id.toString(), "PUBLISHED")
        forceEventState(deadClaim.id.toString(), "FAILED")

        val publishedMarked = adapter.markPublished(publishedClaim.id, publishedClaim.lockedAt)
        val failedMarked = adapter.markPublishFailed(failedClaim.id, failedClaim.lockedAt, "late failure", 0)
        val deadMarked = adapter.markPublishDead(deadClaim.id, deadClaim.lockedAt, "late death")

        assertThat(publishedMarked).isFalse()
        assertThat(failedMarked).isFalse()
        assertThat(deadMarked).isFalse()
        assertThat(eventRow(publishedClaim.id.toString())["status"]).isEqualTo("DEAD")
        assertThat(eventRow(failedClaim.id.toString())["status"]).isEqualTo("PUBLISHED")
        assertThat(eventRow(deadClaim.id.toString())["status"]).isEqualTo("FAILED")
    }

    @Test
    fun `loadMessage maps created at and payload`() {
        insertClub()
        val payload = NotificationEventPayload(
            sessionId = sessionId,
            sessionNumber = 12,
            bookTitle = "Message Mapping",
            documentVersion = 3,
            authorMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
            targetDate = LocalDate.of(2026, 5, 9),
        )
        val eventId = enqueueTestEvent(
            dedupeKey = "event-outbox-adapter-test-load-message",
            eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            payload = payload,
        )
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set created_at = ?
            where id = ?
            """.trimIndent(),
            LocalDateTime.of(2026, 4, 29, 12, 34, 56, 123456000),
            eventId,
        )

        val message = adapter.loadMessage(UUID.fromString(eventId))

        assertThat(message).isNotNull
        assertThat(message!!.eventId.toString()).isEqualTo(eventId)
        assertThat(message.clubId).isEqualTo(clubId)
        assertThat(message.eventType).isEqualTo(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED)
        assertThat(message.aggregateType).isEqualTo("SESSION")
        assertThat(message.aggregateId).isEqualTo(sessionId)
        assertThat(message.occurredAt).isEqualTo(OffsetDateTime.of(2026, 4, 29, 12, 34, 56, 123456000, ZoneOffset.UTC))
        assertThat(message.payload).isEqualTo(payload)
    }

    @Test
    fun `loadMessage returns null for missing event`() {
        val message = adapter.loadMessage(UUID.fromString("00000000-0000-0000-0000-000000009999"))

        assertThat(message).isNull()
    }

    @Test
    fun `enqueueSessionReminderDue creates idempotent session reminder events with public-safe payload`() {
        val reminderSessionId = "00000000-0000-0000-0000-000000009501"
        insertReminderSession(reminderSessionId)

        val firstInserted = adapter.enqueueSessionReminderDue(LocalDate.of(2026, 5, 1))
        val duplicateInserted = adapter.enqueueSessionReminderDue(LocalDate.of(2026, 5, 1))

        val row = jdbcTemplate.queryForMap(
            """
            select
              event_type,
              aggregate_type,
              aggregate_id,
              status,
              kafka_topic,
              kafka_key,
              dedupe_key,
              json_unquote(json_extract(payload_json, '$.sessionId')) as session_id,
              cast(json_unquote(json_extract(payload_json, '$.sessionNumber')) as signed) as session_number,
              json_unquote(json_extract(payload_json, '$.bookTitle')) as book_title,
              json_unquote(json_extract(payload_json, '$.targetDate')) as target_date
            from notification_event_outbox
            where aggregate_id = ?
            """.trimIndent(),
            reminderSessionId,
        )

        assertThat(firstInserted).isEqualTo(1)
        assertThat(duplicateInserted).isZero()
        assertThat(row["event_type"]).isEqualTo("SESSION_REMINDER_DUE")
        assertThat(row["aggregate_type"]).isEqualTo("SESSION")
        assertThat(row["aggregate_id"]).isEqualTo(reminderSessionId)
        assertThat(row["status"]).isEqualTo("PENDING")
        assertThat(row["kafka_topic"]).isEqualTo(TEST_NOTIFICATION_EVENTS_TOPIC)
        assertThat(row["kafka_key"]).isEqualTo("00000000-0000-0000-0000-000000000001")
        assertThat(row["dedupe_key"]).isEqualTo("session-reminder:2026-05-01:$reminderSessionId")
        assertThat(row["session_id"]).isEqualTo(reminderSessionId)
        assertThat((row["session_number"] as Number).toInt()).isEqualTo(9501)
        assertThat(row["book_title"]).isEqualTo("리마인더 이벤트 테스트 책")
        assertThat(row["target_date"]).isEqualTo("2026-05-01")
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

    private fun claimSingleEvent(
        dedupeKey: String,
    ): NotificationEventOutboxItem {
        val eventId = enqueueTestEvent(dedupeKey)

        return adapter.claimPublishable(10).single { it.id.toString() == eventId }
    }

    private fun enqueueTestEvent(
        dedupeKey: String,
        eventType: NotificationEventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
        payload: NotificationEventPayload = NotificationEventPayload(sessionId = sessionId, bookTitle = "Outbox Test"),
    ): String {
        val inserted = adapter.enqueueEvent(
            clubId = clubId,
            eventType = eventType,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = payload,
            dedupeKey = dedupeKey,
        )
        assertThat(inserted).isTrue()
        return eventIdForDedupeKey(dedupeKey)
    }

    private fun markFailedForRetry(
        eventId: String,
        nextAttemptExpression: String,
    ) {
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set status = 'FAILED',
                attempt_count = 2,
                locked_at = null,
                next_attempt_at = $nextAttemptExpression
            where id = ?
            """.trimIndent(),
            eventId,
        )
    }

    private fun forceEventState(
        eventId: String,
        status: String,
    ) {
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set status = ?,
                locked_at = null
            where id = ?
            """.trimIndent(),
            status,
            eventId,
        )
    }

    private fun eventRow(eventId: String): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select status, attempt_count, locked_at, published_at, last_error
            from notification_event_outbox
            where id = ?
            """.trimIndent(),
            eventId,
        )

    private fun eventIdForDedupeKey(dedupeKey: String): String =
        jdbcTemplate.queryForObject(
            """
            select id
            from notification_event_outbox
            where dedupe_key = ?
            """.trimIndent(),
            String::class.java,
            dedupeKey,
        ) ?: error("Missing notification event outbox row for dedupe key $dedupeKey")

    private fun unsafeLongError(): String =
        "Authorization: Bearer example reader@example.com " + "x".repeat(600)

    private fun insertClub() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, 'readmates-event-outbox-test', 'ReadMates', 'Read together', 'Outbox adapter test club.')
            """.trimIndent(),
            clubId.toString(),
        )
    }

    private fun insertReminderSession(sessionId: String) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label,
              question_deadline_at, state, visibility
            ) values (
              ?,
              '00000000-0000-0000-0000-000000000001',
              9501,
              '리마인더 이벤트 테스트 회차',
              '리마인더 이벤트 테스트 책',
              '테스트 저자',
              '2026-05-01',
              '19:30:00',
              '21:30:00',
              '온라인',
              '2026-04-30 14:59:00.000000',
              'OPEN',
              'MEMBER'
            )
            """.trimIndent(),
            sessionId,
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
