package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.HostNotificationEvent
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.math.max

private const val MAX_EVENT_LAST_ERROR_LENGTH = 500
private const val PUBLISHING_LEASE_TIMEOUT_MINUTES = 15

@Repository
class JdbcNotificationEventOutboxAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
    private val objectMapper: ObjectMapper,
    @param:Value("\${readmates.notifications.kafka.events-topic:readmates.notification.events.v1}") private val eventsTopic: String,
) : NotificationEventOutboxPort {
    private val payloadType = objectMapper.typeFactory.constructType(NotificationEventPayload::class.java)

    override fun enqueueEvent(
        clubId: UUID,
        eventType: NotificationEventType,
        aggregateType: String,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        dedupeKey: String,
    ): Boolean =
        try {
            jdbcTemplate().update(
                """
                insert into notification_event_outbox (
                  id,
                  club_id,
                  event_type,
                  aggregate_type,
                  aggregate_id,
                  payload_json,
                  kafka_topic,
                  kafka_key,
                  status,
                  dedupe_key
                )
                values (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
                """.trimIndent(),
                UUID.randomUUID().dbString(),
                clubId.dbString(),
                eventType.name,
                aggregateType,
                aggregateId.dbString(),
                objectMapper.writeValueAsString(payload),
                eventsTopic,
                clubId.dbString(),
                dedupeKey,
            ) > 0
        } catch (_: DuplicateKeyException) {
            false
        }

    @Transactional
    override fun enqueueSessionReminderDue(targetDate: LocalDate): Int =
        jdbcTemplate().update(
            """
            insert ignore into notification_event_outbox (
              id,
              club_id,
              event_type,
              aggregate_type,
              aggregate_id,
              payload_json,
              kafka_topic,
              kafka_key,
              status,
              dedupe_key
            )
            select
              uuid(),
              sessions.club_id,
              'SESSION_REMINDER_DUE',
              'SESSION',
              sessions.id,
              json_object(
                'sessionId', sessions.id,
                'sessionNumber', sessions.number,
                'bookTitle', sessions.book_title,
                'targetDate', ?
              ),
              ?,
              sessions.club_id,
              'PENDING',
              concat('session-reminder:', ?, ':', sessions.id)
            from sessions
            where sessions.session_date = ?
              and sessions.state in ('DRAFT', 'OPEN')
              and sessions.visibility in ('MEMBER', 'PUBLIC')
            """.trimIndent(),
            targetDate.toString(),
            eventsTopic,
            targetDate.toString(),
            targetDate,
        )

    @Transactional
    override fun claimPublishable(limit: Int): List<NotificationEventOutboxItem> {
        if (limit <= 0) {
            return emptyList()
        }

        val jdbcTemplate = jdbcTemplate()
        resetStalePublishingRows(jdbcTemplate)
        val ids = jdbcTemplate.query(
            """
            select id
            from notification_event_outbox
            where status in ('PENDING', 'FAILED')
              and next_attempt_at <= utc_timestamp(6)
            order by next_attempt_at, created_at
            limit ?
            for update skip locked
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            limit,
        )
        if (ids.isEmpty()) {
            return emptyList()
        }

        val placeholders = ids.joinToString(",") { "?" }
        val idArgs = ids.map { it.dbString() as Any }.toTypedArray()
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set status = 'PUBLISHING',
                locked_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where id in ($placeholders)
              and status in ('PENDING', 'FAILED')
            """.trimIndent(),
            *idArgs,
        )

        val orderedArgs = (ids.map { it.dbString() as Any } + ids.map { it.dbString() as Any }).toTypedArray()
        return jdbcTemplate.query(
            """
            select id, club_id, event_type, aggregate_type, aggregate_id, payload_json,
                   status, kafka_topic, kafka_key, attempt_count, locked_at
            from notification_event_outbox
            where id in ($placeholders)
            order by field(id, $placeholders)
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNotificationEventOutboxItem() },
            *orderedArgs,
        )
    }

    override fun markPublished(id: UUID, lockedAt: OffsetDateTime): Boolean =
        jdbcTemplate().update(
            """
            update notification_event_outbox
            set status = 'PUBLISHED',
                published_at = utc_timestamp(6),
                locked_at = null,
                last_error = null,
                updated_at = utc_timestamp(6)
            where id = ?
              and status = 'PUBLISHING'
              and locked_at = ?
            """.trimIndent(),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) > 0

    override fun markPublishFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean =
        jdbcTemplate().update(
            """
            update notification_event_outbox
            set status = 'FAILED',
                attempt_count = attempt_count + 1,
                next_attempt_at = timestampadd(MINUTE, ?, utc_timestamp(6)),
                locked_at = null,
                last_error = ?,
                updated_at = utc_timestamp(6)
            where id = ?
              and status = 'PUBLISHING'
              and locked_at = ?
            """.trimIndent(),
            max(0L, nextAttemptDelayMinutes),
            sanitizeNotificationError(error, MAX_EVENT_LAST_ERROR_LENGTH),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) > 0

    override fun markPublishDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean =
        jdbcTemplate().update(
            """
            update notification_event_outbox
            set status = 'DEAD',
                attempt_count = attempt_count + 1,
                next_attempt_at = utc_timestamp(6),
                locked_at = null,
                last_error = ?,
                updated_at = utc_timestamp(6)
            where id = ?
              and status = 'PUBLISHING'
              and locked_at = ?
            """.trimIndent(),
            sanitizeNotificationError(error, MAX_EVENT_LAST_ERROR_LENGTH),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) > 0

    override fun loadMessage(eventId: UUID): NotificationEventMessage? =
        jdbcTemplate().query(
            """
            select id, club_id, event_type, aggregate_type, aggregate_id, payload_json, created_at
            from notification_event_outbox
            where id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNotificationEventMessage() },
            eventId.dbString(),
        ).firstOrNull()

    override fun listHostEvents(
        clubId: UUID,
        status: NotificationEventOutboxStatus?,
        limit: Int,
    ): List<HostNotificationEvent> {
        val statusPredicate = if (status == null) "" else "and status = ?"
        val args = mutableListOf<Any>(clubId.dbString())
        status?.let { args += it.name }
        args += limit
        return jdbcTemplate().query(
            """
            select id, event_type, status, attempt_count, created_at, updated_at
            from notification_event_outbox
            where club_id = ?
              $statusPredicate
            order by updated_at desc, created_at desc, id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostNotificationEvent() },
            *args.toTypedArray(),
        )
    }

    private fun ResultSet.toNotificationEventOutboxItem(): NotificationEventOutboxItem =
        NotificationEventOutboxItem(
            id = uuid("id"),
            clubId = uuid("club_id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            aggregateType = getString("aggregate_type"),
            aggregateId = uuid("aggregate_id"),
            payload = parsePayload(getString("payload_json")),
            status = NotificationEventOutboxStatus.valueOf(getString("status")),
            kafkaTopic = getString("kafka_topic"),
            kafkaKey = getString("kafka_key"),
            attemptCount = getInt("attempt_count"),
            lockedAt = utcOffsetDateTime("locked_at"),
        )

    private fun ResultSet.toNotificationEventMessage(): NotificationEventMessage =
        NotificationEventMessage(
            eventId = uuid("id"),
            clubId = uuid("club_id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            aggregateType = getString("aggregate_type"),
            aggregateId = uuid("aggregate_id"),
            occurredAt = utcOffsetDateTime("created_at"),
            payload = parsePayload(getString("payload_json")),
        )

    private fun ResultSet.toHostNotificationEvent(): HostNotificationEvent =
        HostNotificationEvent(
            id = uuid("id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            status = NotificationEventOutboxStatus.valueOf(getString("status")),
            attemptCount = getInt("attempt_count"),
            createdAt = utcOffsetDateTime("created_at"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )

    private fun parsePayload(rawPayload: String): NotificationEventPayload =
        objectMapper.readValue(rawPayload, payloadType)

    private fun resetStalePublishingRows(jdbcTemplate: JdbcTemplate) {
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set status = 'PENDING',
                locked_at = null,
                next_attempt_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where status = 'PUBLISHING'
              and locked_at < timestampadd(MINUTE, ?, utc_timestamp(6))
            """.trimIndent(),
            -PUBLISHING_LEASE_TIMEOUT_MINUTES,
        )
    }

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("Notification event outbox storage is unavailable")
}
