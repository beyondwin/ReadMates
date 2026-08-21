package com.readmates.notification

import com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapter
import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import com.readmates.notification.application.service.NotificationRelayService
import com.readmates.notification.application.service.ReadmatesOperationalMetrics
import com.readmates.notification.domain.NotificationEventType
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.MDC
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.time.Clock
import java.util.Collections
import java.util.UUID

private const val CLEANUP_CORRELATION_OUTBOX_SQL = """
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-0000000000c1';
    delete from sessions
    where id = '00000000-0000-0000-0000-0000000000c2';
    delete from clubs
    where id = '00000000-0000-0000-0000-0000000000c1';
"""

private const val CORRELATION_NOTIFICATION_EVENTS_TOPIC = "readmates.notification.events.correlation-test"

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.notifications.kafka.events-topic=$CORRELATION_NOTIFICATION_EVENTS_TOPIC",
    ],
)
@Sql(
    statements = [CLEANUP_CORRELATION_OUTBOX_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_CORRELATION_OUTBOX_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
@Tag("integration")
class CorrelationIdEndToEndTest(
    @param:Autowired private val outboxAdapter: JdbcNotificationEventOutboxAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val notificationRuntimeProperties: NotificationRuntimeProperties,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-0000000000c1")
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-0000000000c2")

    @Test
    fun `request id from MDC flows through outbox row into Kafka publisher requestId argument`() {
        insertClub()
        val requestId = "e2e-corr-${UUID.randomUUID().toString().substring(0, 16)}"
        val dedupeKey = "correlation-id-end-to-end-${UUID.randomUUID()}"
        val capturingPublisher = CapturingNotificationEventPublisher()
        val relayService =
            NotificationRelayService(
                notificationEventOutboxPort = outboxAdapter,
                notificationEventPublisherPort = capturingPublisher,
                operationalMetrics = ReadmatesOperationalMetrics(SimpleMeterRegistry()),
                runtimeProperties = notificationRuntimeProperties,
                clock = Clock.systemUTC(),
            )

        // Step 1: enqueue under an MDC scope simulating an inbound HTTP request that
        // carries X-Readmates-Request-Id (server-side filter populates MDC.requestId).
        MDC.put("requestId", requestId)
        try {
            val enqueued =
                outboxAdapter.enqueueEvent(
                    clubId = clubId,
                    eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                    aggregateType = "SESSION",
                    aggregateId = sessionId,
                    payload = NotificationEventPayload(sessionId = sessionId, bookTitle = "Correlation Id Test"),
                    dedupeKey = dedupeKey,
                )
            assertThat(enqueued).isTrue()
        } finally {
            MDC.remove("requestId")
        }

        // Step 2: row carries the requestId from MDC (covered in detail by adapter test;
        // re-asserted here so the regression message stays meaningful if this step regresses).
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
        assertThat(storedRequestId).isEqualTo(requestId)

        // Step 3: relay service claims the row and forwards row.requestId to the
        // publisher port. This is the joining seam between task_2 (outbox column) and
        // task_3 (Kafka header) — the asserted leg this regression test guards.
        val published = relayService.publishPending(limit = 10)

        assertThat(published).isGreaterThanOrEqualTo(1)
        assertThat(capturingPublisher.requestIdsForEvent(dedupeKey, jdbcTemplate))
            .`as`("publisher should observe requestId forwarded from outbox row")
            .containsExactly(requestId)
    }

    private fun insertClub() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, 'readmates-correlation-test', 'ReadMates', 'Read together', 'Correlation id end-to-end test club.')
            """.trimIndent(),
            clubId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, 1, '상관관계 테스트 회차', 'Correlation Id Test', '테스트 저자',
                    '2026-05-01', '19:00:00', '21:00:00', '온라인', '2026-04-30 19:00:00', 'OPEN', 'MEMBER')
            """.trimIndent(),
            sessionId.toString(),
            clubId.toString(),
        )
    }

    private class CapturingNotificationEventPublisher : NotificationEventPublisherPort {
        private val captures = Collections.synchronizedList(mutableListOf<Capture>())

        override fun publish(
            message: NotificationEventMessage,
            topic: String,
            key: String,
            requestId: String?,
        ) {
            captures += Capture(eventId = message.eventId, requestId = requestId)
        }

        fun requestIdsForEvent(
            dedupeKey: String,
            jdbcTemplate: JdbcTemplate,
        ): List<String?> {
            val eventId =
                jdbcTemplate.queryForObject(
                    """
                    select id
                    from notification_event_outbox
                    where dedupe_key = ?
                    """.trimIndent(),
                    String::class.java,
                    dedupeKey,
                ) ?: error("Missing notification event outbox row for dedupe key $dedupeKey")
            val targetEventId = UUID.fromString(eventId)
            return captures.toList().filter { it.eventId == targetEventId }.map { it.requestId }
        }

        private data class Capture(
            val eventId: UUID,
            val requestId: String?,
        )
    }
}
