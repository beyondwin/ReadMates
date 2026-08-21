package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationSessionNotFoundException
import com.readmates.notification.application.port.out.NotificationDeliveryBacklogPort
import com.readmates.notification.application.port.out.NotificationEventOutboxBacklogPort
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import com.readmates.notification.application.service.NotificationRelayService
import com.readmates.notification.application.service.ReadmatesOperationalMetrics
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.MDC
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Collections
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private const val CLEANUP_NOTIFICATION_EVENT_OUTBOX_SQL = """
    delete from notification_deliveries
    where club_id = '00000000-0000-0000-0000-000000000101';
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-000000000101';
    delete from notification_event_outbox
    where aggregate_id in (
      '00000000-0000-0000-0000-000000009501',
      '00000000-0000-0000-0000-000000009510',
      '00000000-0000-0000-0000-000000009511',
      '00000000-0000-0000-0000-000000009512'
    );
    delete from club_notification_policies
    where club_id in (
      '00000000-0000-0000-0000-000000000910',
      '00000000-0000-0000-0000-000000000911'
    );
    delete from sessions
    where id in (
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000009501',
      '00000000-0000-0000-0000-000000009510',
      '00000000-0000-0000-0000-000000009511',
      '00000000-0000-0000-0000-000000009512'
    );
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000101';
    delete from memberships
    where id = '00000000-0000-0000-0000-000000000801';
    delete from memberships
    where id in (
      '00000000-0000-0000-0000-000000000810',
      '00000000-0000-0000-0000-000000000811',
      '00000000-0000-0000-0000-000000000812'
    );
    delete from users
    where id = '00000000-0000-0000-0000-000000000701';
    delete from users
    where id in (
      '00000000-0000-0000-0000-000000000710',
      '00000000-0000-0000-0000-000000000711',
      '00000000-0000-0000-0000-000000000712'
    );
    delete from clubs
    where id in (
      '00000000-0000-0000-0000-000000000910',
      '00000000-0000-0000-0000-000000000911',
      '00000000-0000-0000-0000-000000000912'
    );
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
@Tag("integration")
@Suppress("LargeClass")
class JdbcNotificationEventOutboxAdapterTest(
    @param:Autowired private val adapter: JdbcNotificationEventOutboxAdapter,
    @param:Autowired private val deliveryBacklogPort: NotificationDeliveryBacklogPort,
    @param:Autowired private val eventOutboxBacklogPort: NotificationEventOutboxBacklogPort,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val objectMapper: ObjectMapper,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000101")
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000201")

    @Test
    fun `event outbox and delivery backlog queries keep exact statuses and tables separate`() {
        insertClub()
        assertTruthfulBacklogs(
            jdbcTemplate = jdbcTemplate,
            clubId = clubId,
            eventOutboxBacklogPort = eventOutboxBacklogPort,
            deliveryBacklogPort = deliveryBacklogPort,
        )
    }

    @Test
    fun `enqueue event is idempotent by dedupe key`() {
        insertClub()
        val payload =
            NotificationEventPayload(
                sessionId = sessionId,
                sessionNumber = 7,
                bookTitle = "Outbox Patterns",
                targetDate = LocalDate.of(2026, 5, 1),
            )

        val first =
            adapter.enqueueEvent(
                clubId = clubId,
                eventType = NotificationEventType.SESSION_REMINDER_DUE,
                aggregateType = "SESSION",
                aggregateId = sessionId,
                payload = payload,
                dedupeKey = "event-outbox-adapter-test-dedupe",
            )
        val duplicate =
            adapter.enqueueEvent(
                clubId = clubId,
                eventType = NotificationEventType.SESSION_REMINDER_DUE,
                aggregateType = "SESSION",
                aggregateId = sessionId,
                payload = payload.copy(bookTitle = "Duplicate Payload"),
                dedupeKey = "event-outbox-adapter-test-dedupe",
            )

        val row =
            jdbcTemplate.queryForMap(
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
    fun `enqueue event preserves a caller supplied event id`() {
        insertClub()
        val eventId = UUID.fromString("00000000-0000-0000-0000-000000000111")

        val inserted =
            adapter.enqueueEvent(
                eventId = eventId,
                clubId = clubId,
                eventType = NotificationEventType.SESSION_RECORD_UPDATED,
                aggregateType = "SESSION",
                aggregateId = sessionId,
                payload = NotificationEventPayload(sessionId = sessionId, sessionNumber = 7, bookTitle = "기록"),
                dedupeKey = "event-outbox-caller-id",
            )

        assertThat(inserted).isTrue()
        assertThat(eventIdForDedupeKey("event-outbox-caller-id")).isEqualTo(eventId.toString())
    }

    @Test
    fun `session aggregate enqueue rejects a missing parent session`() {
        insertClub()
        jdbcTemplate.update(
            "delete from sessions where id = ? and club_id = ?",
            sessionId.toString(),
            clubId.toString(),
        )

        assertThatThrownBy {
            adapter.enqueueEvent(
                clubId = clubId,
                eventType = NotificationEventType.SESSION_RECORD_UPDATED,
                aggregateType = "SESSION",
                aggregateId = sessionId,
                payload = NotificationEventPayload(sessionId = sessionId, sessionNumber = 7, bookTitle = "기록"),
                dedupeKey = "event-outbox-missing-session",
            )
        }.isInstanceOf(NotificationSessionNotFoundException::class.java)
        assertThat(eventRows()).isZero()
    }

    @Test
    fun `non-session aggregate enqueue does not require a live session`() {
        insertClub()
        jdbcTemplate.update(
            "delete from sessions where id = ? and club_id = ?",
            sessionId.toString(),
            clubId.toString(),
        )
        val jobId = UUID.fromString("00000000-0000-0000-0000-000000000121")

        val inserted =
            adapter.enqueueEvent(
                clubId = clubId,
                eventType = NotificationEventType.AI_GENERATION_READY,
                aggregateType = "AI_GENERATION_JOB",
                aggregateId = jobId,
                payload = NotificationEventPayload(sessionId = sessionId, jobId = jobId),
                dedupeKey = "event-outbox-ai-job",
            )

        assertThat(inserted).isTrue()
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
    fun `relay service concurrent claims do not publish duplicate event ids`() {
        insertClub()
        repeat(3) { index ->
            enqueueTestEvent("event-outbox-adapter-test-concurrent-claim-$index")
        }
        val publisher = RecordingNotificationEventPublisher()
        val service =
            NotificationRelayService(
                notificationEventOutboxPort = adapter,
                notificationEventPublisherPort = publisher,
                operationalMetrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
                runtimeProperties = relayRuntimeProperties(),
                clock = Clock.systemUTC(),
            )

        val publishedCounts =
            runConcurrently(workerCount = 2) {
                service.publishPending(limit = 2)
            }

        assertThat(publishedCounts.sum()).isEqualTo(3)
        assertThat(publisher.eventIds()).hasSize(3).doesNotHaveDuplicates()
        assertThat(publishedEventRows()).isEqualTo(3)
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
                locked_at = timestampadd(MINUTE, -14, utc_timestamp(6)),
                next_attempt_at = timestampadd(MINUTE, -14, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            freshPublishingId,
        )
        val staleLeaseBefore = eventRow(stalePublishingId)["locked_at"]
        val freshLeaseBefore = eventRow(freshPublishingId)["locked_at"]
        assertThat(leaseIsOlderThanProductionCutoff(stalePublishingId)).isTrue()
        assertThat(leaseIsOlderThanProductionCutoff(freshPublishingId)).isFalse()

        val claimed = adapter.claimPublishable(10)
        val reclaimed = claimed.single { it.id.toString() == stalePublishingId }

        assertThat(claimed.map { it.id.toString() }).contains(stalePublishingId)
        assertThat(claimed.map { it.id.toString() }).doesNotContain(freshPublishingId)
        assertThat(reclaimed.status).isEqualTo(NotificationEventOutboxStatus.PUBLISHING)
        assertThat(reclaimed.attemptCount).isZero()
        assertThat(reclaimed.lockedAt).isNotNull()
        assertThat(eventRow(stalePublishingId)["locked_at"]).isNotEqualTo(staleLeaseBefore)
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
        val freshRow = eventRow(freshPublishingId)
        assertThat(freshRow["status"]).isEqualTo("PUBLISHING")
        assertThat(freshRow["attempt_count"]).isEqualTo(0)
        assertThat(freshRow["locked_at"]).isEqualTo(freshLeaseBefore)
        assertThat(freshRow["published_at"]).isNull()
    }

    @Test
    fun `claim publishable uses the typed non-default lease for stale publishing boundaries`() =
        assertTypedEventClaimLeaseBoundaries(
            jdbcTemplate = jdbcTemplate,
            objectMapper = objectMapper,
            adapter = adapter,
            clubId = clubId,
            sessionId = sessionId,
            insertClub = ::insertClub,
        )

    @Test
    fun `claim publishable moves due failed rows to publishing but leaves future failed rows alone`() {
        insertClub()
        val dueFailedId =
            enqueueTestEvent(
                dedupeKey = "event-outbox-adapter-test-due-failed",
                payload = NotificationEventPayload(sessionId = sessionId, bookTitle = "Due Failed"),
            )
        val futureFailedId =
            enqueueTestEvent(
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
        val payload =
            NotificationEventPayload(
                sessionId = sessionId,
                sessionNumber = 12,
                bookTitle = "Message Mapping",
                documentVersion = 3,
                authorMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000301"),
                targetDate = LocalDate.of(2026, 5, 9),
            )
        val eventId =
            enqueueTestEvent(
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
        assertThat(message.clubSlug).isEqualTo("readmates-event-outbox-test")
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
    fun `enqueueEvent persists MDC requestId into request_id column`() {
        insertClub()
        MDC.put("requestId", "test-req-1234")
        val dedupeKey = "event-outbox-adapter-test-mdc-req-${UUID.randomUUID()}"
        try {
            adapter.enqueueEvent(
                clubId = clubId,
                eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                aggregateType = "SESSION",
                aggregateId = sessionId,
                payload = NotificationEventPayload(sessionId = sessionId, bookTitle = "MDC Request"),
                dedupeKey = dedupeKey,
            )

            val storedRequestId =
                jdbcTemplate.queryForObject(
                    """
                    select request_id
                    from notification_event_outbox
                    where dedupe_key = ?
                    """.trimIndent(),
                    String::class.java,
                    dedupeKey,
                )
            assertThat(storedRequestId).isEqualTo("test-req-1234")
        } finally {
            MDC.remove("requestId")
        }
    }

    @Test
    fun `enqueueEvent stores NULL request_id when MDC is empty`() {
        insertClub()
        MDC.remove("requestId")
        val dedupeKey = "event-outbox-adapter-test-mdc-null-${UUID.randomUUID()}"
        adapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, bookTitle = "No MDC"),
            dedupeKey = dedupeKey,
        )

        val storedRequestId =
            jdbcTemplate.queryForObject(
                """
                select request_id
                from notification_event_outbox
                where dedupe_key = ?
                """.trimIndent(),
                String::class.java,
                dedupeKey,
            )
        assertThat(storedRequestId).isNull()
    }

    @Test
    fun `enqueueSessionReminderDue includes only opted in clubs and remains idempotent`() {
        jdbcTemplate.seedReminderCandidate(
            clubId = "00000000-0000-0000-0000-000000000910",
            userId = "00000000-0000-0000-0000-000000000710",
            membershipId = "00000000-0000-0000-0000-000000000810",
            sessionId = "00000000-0000-0000-0000-000000009510",
            policy = true,
        )
        jdbcTemplate.seedReminderCandidate(
            clubId = "00000000-0000-0000-0000-000000000911",
            userId = "00000000-0000-0000-0000-000000000711",
            membershipId = "00000000-0000-0000-0000-000000000811",
            sessionId = "00000000-0000-0000-0000-000000009511",
            policy = false,
        )
        jdbcTemplate.seedReminderCandidate(
            clubId = "00000000-0000-0000-0000-000000000912",
            userId = "00000000-0000-0000-0000-000000000712",
            membershipId = "00000000-0000-0000-0000-000000000812",
            sessionId = "00000000-0000-0000-0000-000000009512",
            policy = null,
        )

        val firstInserted = adapter.enqueueSessionReminderDue(LocalDate.of(2026, 5, 1))
        val duplicateInserted = adapter.enqueueSessionReminderDue(LocalDate.of(2026, 5, 1))

        assertThat(firstInserted).isEqualTo(1)
        assertThat(duplicateInserted).isZero()
        assertThat(jdbcTemplate.reminderEventCount("00000000-0000-0000-0000-000000000910")).isEqualTo(1)
        assertThat(jdbcTemplate.reminderEventCount("00000000-0000-0000-0000-000000000911")).isZero()
        assertThat(jdbcTemplate.reminderEventCount("00000000-0000-0000-0000-000000000912")).isZero()
        assertOptedInReminderRow(jdbcTemplate)
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

    private fun publishedEventRows(): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_event_outbox
            where club_id = ?
              and status = 'PUBLISHED'
            """.trimIndent(),
            Int::class.java,
            clubId.toString(),
        ) ?: 0

    private fun claimSingleEvent(dedupeKey: String): NotificationEventOutboxItem {
        val eventId = enqueueTestEvent(dedupeKey)

        return adapter.claimPublishable(10).single { it.id.toString() == eventId }
    }

    private fun enqueueTestEvent(
        dedupeKey: String,
        eventType: NotificationEventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
        payload: NotificationEventPayload = NotificationEventPayload(sessionId = sessionId, bookTitle = "Outbox Test"),
    ): String {
        val inserted =
            adapter.enqueueEvent(
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
            select status, attempt_count, locked_at, published_at, last_error, request_id
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

    private fun leaseIsOlderThanProductionCutoff(eventId: String): Boolean =
        jdbcTemplate.queryForObject(
            """
            select locked_at < timestampadd(MINUTE, -15, utc_timestamp(6))
            from notification_event_outbox
            where id = ?
            """.trimIndent(),
            Boolean::class.java,
            eventId,
        ) ?: false

    private fun unsafeLongError(): String = "Authorization: Bearer example reader@example.com " + "x".repeat(600)

    private fun insertClub() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, 'readmates-event-outbox-test', 'ReadMates', 'Read together', 'Outbox adapter test club.')
            """.trimIndent(),
            clubId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, 1, '아웃박스 테스트 회차', 'Outbox Patterns', '테스트 저자',
                    '2026-05-01', '19:00:00', '21:00:00', '온라인', '2026-04-30 19:00:00', 'OPEN', 'MEMBER')
            """.trimIndent(),
            sessionId.toString(),
            clubId.toString(),
        )
    }

    private fun <T> runConcurrently(
        workerCount: Int,
        action: () -> T,
    ): List<T> {
        val executor = Executors.newFixedThreadPool(workerCount)
        val ready = CountDownLatch(workerCount)
        val start = CountDownLatch(1)
        return try {
            val futures =
                (1..workerCount).map {
                    executor.submit<T> {
                        ready.countDown()
                        check(start.await(5, TimeUnit.SECONDS)) { "Timed out waiting to start concurrent work" }
                        action()
                    }
                }
            check(ready.await(5, TimeUnit.SECONDS)) { "Timed out waiting for concurrent workers" }
            start.countDown()
            futures.map { it.get(10, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }
    }

    private class RecordingNotificationEventPublisher : NotificationEventPublisherPort {
        private val eventIds = Collections.synchronizedList(mutableListOf<UUID>())

        override fun publish(
            message: NotificationEventMessage,
            topic: String,
            key: String,
            requestId: String?,
        ) {
            eventIds += message.eventId
        }

        fun eventIds(): List<UUID> = eventIds.toList()
    }
}

private fun assertTruthfulBacklogs(
    jdbcTemplate: JdbcTemplate,
    clubId: UUID,
    eventOutboxBacklogPort: NotificationEventOutboxBacklogPort,
    deliveryBacklogPort: NotificationDeliveryBacklogPort,
) {
    val eventIds =
        jdbcTemplate.seedEventBacklog(
            clubId = clubId,
            statusCounts =
                mapOf(
                    NotificationEventOutboxStatus.PENDING to 1,
                    NotificationEventOutboxStatus.FAILED to 2,
                    NotificationEventOutboxStatus.DEAD to 3,
                    NotificationEventOutboxStatus.PUBLISHING to 4,
                    NotificationEventOutboxStatus.PUBLISHED to 5,
                ),
        )

    val eventBacklog = eventOutboxBacklogPort.eventOutboxBacklog()
    val deliveryBeforePlanning = deliveryBacklogPort.deliveryBacklog()

    assertThat(eventBacklog.pending).isEqualTo(1)
    assertThat(eventBacklog.failed).isEqualTo(2)
    assertThat(eventBacklog.dead).isEqualTo(3)
    assertThat(eventBacklog.publishing).isEqualTo(4)
    assertThat(deliveryBeforePlanning.pending).isZero()
    assertThat(deliveryBeforePlanning.failed).isZero()
    assertThat(deliveryBeforePlanning.dead).isZero()
    assertThat(deliveryBeforePlanning.sending).isZero()

    jdbcTemplate.insertBacklogRecipient(clubId)
    jdbcTemplate.seedDeliveryBacklog(
        eventId = eventIds.first(),
        clubId = clubId,
        channel = "EMAIL",
        statusCounts =
            mapOf(
                "PENDING" to 6,
                "FAILED" to 7,
                "DEAD" to 8,
                "SENDING" to 9,
                "SENT" to 10,
            ),
    )
    jdbcTemplate.seedDeliveryBacklog(
        eventId = eventIds.first(),
        clubId = clubId,
        channel = "IN_APP",
        statusCounts = mapOf("PENDING" to 11),
    )

    val deliveryBacklog = deliveryBacklogPort.deliveryBacklog()

    assertThat(deliveryBacklog.pending).isEqualTo(6)
    assertThat(deliveryBacklog.failed).isEqualTo(7)
    assertThat(deliveryBacklog.dead).isEqualTo(8)
    assertThat(deliveryBacklog.sending).isEqualTo(9)
}

private fun JdbcTemplate.insertBacklogRecipient(clubId: UUID) {
    update(
        """
        insert into users (id, google_subject_id, email, name, short_name, auth_provider)
        values (?, ?, 'backlog-recipient@example.test', 'Backlog Recipient', 'Recipient', 'GOOGLE')
        """.trimIndent(),
        "00000000-0000-0000-0000-000000000701",
        "backlog-recipient-subject",
    )
    update(
        """
        insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
        values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), 'Recipient', 'globe-notebook')
        """.trimIndent(),
        "00000000-0000-0000-0000-000000000801",
        clubId.toString(),
        "00000000-0000-0000-0000-000000000701",
    )
}

private fun JdbcTemplate.seedEventBacklog(
    clubId: UUID,
    statusCounts: Map<NotificationEventOutboxStatus, Int>,
): List<UUID> =
    statusCounts.flatMap { (status, count) ->
        (1..count).map { ordinal ->
            UUID.randomUUID().also { eventId ->
                update(
                    """
                    insert into notification_event_outbox (
                      id, club_id, event_type, aggregate_type, aggregate_id, payload_json,
                      status, kafka_topic, kafka_key, dedupe_key
                    ) values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, '{}', ?, ?, ?, ?)
                    """.trimIndent(),
                    eventId.toString(),
                    clubId.toString(),
                    UUID.randomUUID().toString(),
                    status.name,
                    TEST_NOTIFICATION_EVENTS_TOPIC,
                    clubId.toString(),
                    "backlog-event-${status.name.lowercase()}-$ordinal-$eventId",
                )
            }
        }
    }

private fun JdbcTemplate.seedDeliveryBacklog(
    eventId: UUID,
    clubId: UUID,
    channel: String,
    statusCounts: Map<String, Int>,
) {
    statusCounts.forEach { (status, count) ->
        repeat(count) { index ->
            val deliveryId = UUID.randomUUID()
            update(
                """
                insert into notification_deliveries (
                  id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key
                ) values (?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                deliveryId.toString(),
                eventId.toString(),
                clubId.toString(),
                "00000000-0000-0000-0000-000000000801",
                channel,
                status,
                "backlog-delivery-${channel.lowercase()}-${status.lowercase()}-$index-$deliveryId",
            )
        }
    }
}

private fun relayRuntimeProperties(): NotificationRuntimeProperties =
    NotificationRuntimeProperties(
        worker = NotificationRuntimeProperties.Worker(eventMaxAge = Duration.ofHours(24)),
        kafka = NotificationRuntimeProperties.Kafka(maxPublishAttempts = 5),
    )

private fun notificationRuntimeProperties(claimLease: Duration): NotificationRuntimeProperties =
    NotificationRuntimeProperties(
        worker = NotificationRuntimeProperties.Worker(claimLease = claimLease),
    )

private fun assertTypedEventClaimLeaseBoundaries(
    jdbcTemplate: JdbcTemplate,
    objectMapper: ObjectMapper,
    adapter: JdbcNotificationEventOutboxAdapter,
    clubId: UUID,
    sessionId: UUID,
    insertClub: () -> Unit,
) {
    insertClub()
    val lease = Duration.ofMinutes(7).plusSeconds(30).plusMillis(500)
    val leaseMicros = 450_500_000L
    val leaseAdapter =
        JdbcNotificationEventOutboxAdapter(
            jdbcTemplate = jdbcTemplate,
            objectMapper = objectMapper,
            eventsTopic = TEST_NOTIFICATION_EVENTS_TOPIC,
            runtimeProperties = notificationRuntimeProperties(lease),
            sessionGuard = SessionScopedNotificationGuard(jdbcTemplate),
        )
    val expiredId =
        enqueueConfiguredLeaseEvent(adapter, jdbcTemplate, clubId, sessionId, "expired", "Expired Configured Lease")
    val insideId =
        enqueueConfiguredLeaseEvent(adapter, jdbcTemplate, clubId, sessionId, "inside", "Inside Configured Lease")
    jdbcTemplate.setPublishingLease(expiredId, -leaseMicros)
    jdbcTemplate.setPublishingLease(insideId, -(leaseMicros - 5_000_000L))
    val insideLeaseBefore = jdbcTemplate.configuredLeaseEventRow(insideId)["locked_at"]

    val claimed = leaseAdapter.claimPublishable(10)

    assertThat(claimed.map { it.id.toString() }).contains(expiredId)
    assertThat(claimed.map { it.id.toString() }).doesNotContain(insideId)
    assertThat(jdbcTemplate.configuredLeaseEventRow(insideId)["status"]).isEqualTo("PUBLISHING")
    assertThat(jdbcTemplate.configuredLeaseEventRow(insideId)["locked_at"]).isEqualTo(insideLeaseBefore)
}

private fun enqueueConfiguredLeaseEvent(
    adapter: JdbcNotificationEventOutboxAdapter,
    jdbcTemplate: JdbcTemplate,
    clubId: UUID,
    sessionId: UUID,
    suffix: String,
    bookTitle: String,
): String {
    val dedupeKey = "event-outbox-adapter-test-configured-$suffix-lease"
    check(
        adapter.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = "SESSION",
            aggregateId = sessionId,
            payload = NotificationEventPayload(sessionId = sessionId, bookTitle = bookTitle),
            dedupeKey = dedupeKey,
        ),
    )
    return requireNotNull(
        jdbcTemplate.queryForObject(
            "select id from notification_event_outbox where dedupe_key = ?",
            String::class.java,
            dedupeKey,
        ),
    )
}

private fun JdbcTemplate.setPublishingLease(
    eventId: String,
    offsetMicros: Long,
) {
    update(
        """
        update notification_event_outbox
        set status = 'PUBLISHING',
            locked_at = timestampadd(MICROSECOND, ?, utc_timestamp(6)),
            next_attempt_at = timestampadd(MICROSECOND, ?, utc_timestamp(6))
        where id = ?
        """.trimIndent(),
        offsetMicros,
        offsetMicros,
        eventId,
    )
}

private fun JdbcTemplate.configuredLeaseEventRow(eventId: String): Map<String, Any?> =
    queryForMap(
        "select status, locked_at from notification_event_outbox where id = ?",
        eventId,
    )

private fun JdbcTemplate.seedReminderCandidate(
    clubId: String,
    userId: String,
    membershipId: String,
    sessionId: String,
    policy: Boolean?,
) {
    insertReminderClub(clubId)
    insertReminderHost(clubId, userId, membershipId)
    insertReminderSession(clubId, sessionId)
    policy?.let { insertReminderPolicy(clubId, membershipId, it) }
}

private fun JdbcTemplate.insertReminderClub(clubId: String) {
    update(
        """
        insert into clubs (id, slug, name, tagline, about)
        values (?, ?, 'Reminder Test Club', 'Read together', 'Reminder policy adapter test club.')
        """.trimIndent(),
        clubId,
        "reminder-${clubId.takeLast(3)}",
    )
}

private fun JdbcTemplate.insertReminderHost(
    clubId: String,
    userId: String,
    membershipId: String,
) {
    update(
        """
        insert into users (id, google_subject_id, email, name, short_name, auth_provider)
        values (?, ?, ?, 'Reminder Host', 'Host', 'GOOGLE')
        """.trimIndent(),
        userId,
        "google-$userId",
        "host-${clubId.takeLast(3)}@example.com",
    )
    update(
        """
        insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
        values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'Host', 'globe-notebook')
        """.trimIndent(),
        membershipId,
        clubId,
        userId,
    )
}

private fun JdbcTemplate.insertReminderSession(
    clubId: String,
    sessionId: String,
) {
    update(
        """
        insert into sessions (
          id, club_id, number, title, book_title, book_author,
          session_date, start_time, end_time, location_label,
          question_deadline_at, state, visibility
        ) values (
          ?, ?, 9501, '리마인더 이벤트 테스트 회차', '리마인더 이벤트 테스트 책', '테스트 저자',
          '2026-05-01', '19:30:00', '21:30:00', '온라인',
          '2026-04-30 14:59:00.000000', 'OPEN', 'MEMBER'
        )
        """.trimIndent(),
        sessionId,
        clubId,
    )
}

private fun JdbcTemplate.insertReminderPolicy(
    clubId: String,
    membershipId: String,
    enabled: Boolean,
) {
    update(
        """
        insert into club_notification_policies (
          club_id, session_reminder_enabled, updated_by_membership_id
        ) values (?, ?, ?)
        """.trimIndent(),
        clubId,
        enabled,
        membershipId,
    )
}

private fun JdbcTemplate.reminderEventCount(clubId: String): Int =
    queryForObject(
        """
        select count(*)
        from notification_event_outbox
        where club_id = ?
          and event_type = 'SESSION_REMINDER_DUE'
        """.trimIndent(),
        Int::class.java,
        clubId,
    ) ?: 0

private fun assertOptedInReminderRow(jdbcTemplate: JdbcTemplate) {
    val row =
        jdbcTemplate.queryForMap(
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
            where club_id = '00000000-0000-0000-0000-000000000910'
            """.trimIndent(),
        )

    assertThat(row["event_type"]).isEqualTo("SESSION_REMINDER_DUE")
    assertThat(row["aggregate_type"]).isEqualTo("SESSION")
    assertThat(row["aggregate_id"]).isEqualTo("00000000-0000-0000-0000-000000009510")
    assertThat(row["status"]).isEqualTo("PENDING")
    assertThat(row["kafka_topic"]).isEqualTo(TEST_NOTIFICATION_EVENTS_TOPIC)
    assertThat(row["kafka_key"]).isEqualTo("00000000-0000-0000-0000-000000000910")
    assertThat(row["dedupe_key"])
        .isEqualTo("session-reminder:2026-05-01:00000000-0000-0000-0000-000000009510")
    assertThat(row["session_id"]).isEqualTo("00000000-0000-0000-0000-000000009510")
    assertThat((row["session_number"] as Number).toInt()).isEqualTo(9501)
    assertThat(row["book_title"]).isEqualTo("리마인더 이벤트 테스트 책")
    assertThat(row["target_date"]).isEqualTo("2026-05-01")
}
